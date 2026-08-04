import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { AI_PROVIDER, AiProvider } from './providers/ai-provider.interface';

export interface GeneratedVideo {
  url: string | null;
  provider: string;
  note?: string;
}

/**
 * Video generation (Sora on OpenAI, Veo on Gemini).
 *
 * Both vendors model this as a long-running job that must be polled, typically
 * 1-3 minutes. The wait is deliberately bounded so a stuck job can't hang an
 * agent run forever; on timeout the caller gets `url: null` plus a note rather
 * than an exception.
 *
 * Video is the most expensive operation in the pipeline (billed by duration),
 * which is why `generate_video` is a separate opt-in agent tool rather than
 * something `generate_content` reaches for on its own.
 */
@Injectable()
export class VideoService {
  private readonly logger = new Logger(VideoService.name);
  private readonly storageDir = join(process.cwd(), 'public', 'generated');
  private readonly maxWaitMs = 5 * 60 * 1000;

  constructor(
    private readonly configService: ConfigService,
    @Inject(AI_PROVIDER) private readonly provider: AiProvider,
  ) {}

  private publicBaseUrl(): string {
    return (
      this.configService.get<string>('agents.publicAssetsBaseUrl') ||
      this.configService.get<string>('app.url') ||
      'http://localhost:3000'
    );
  }

  async generateVideo(orgId: string, prompt: string): Promise<GeneratedVideo> {
    if (!this.provider.available) {
      return {
        url: null,
        provider: this.provider.name,
        note: `No API key configured for the "${this.provider.name}" provider.`,
      };
    }

    const fileName = `${Date.now()}_${randomBytes(4).toString('hex')}.mp4`;
    const dir = join(this.storageDir, orgId);
    await fs.mkdir(dir, { recursive: true });
    const destination = join(dir, fileName);

    const result = await this.provider.generateVideo(prompt, destination, this.maxWaitMs);
    if (!result.ok) {
      // Clean up the placeholder file if the provider never wrote anything.
      await fs.rm(destination, { force: true }).catch(() => undefined);
      return { url: null, provider: this.provider.name, note: result.reason };
    }

    this.logger.log(`Generated video ${fileName} for org ${orgId} via ${result.provider}`);
    return {
      url: `${this.publicBaseUrl()}/api/content/images/${orgId}/${fileName}`,
      provider: result.provider,
    };
  }
}
