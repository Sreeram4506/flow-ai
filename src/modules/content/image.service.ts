import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { AI_PROVIDER, AiProvider } from './providers/ai-provider.interface';

export interface GeneratedImage {
  url: string;
  provider: string;
  /** Raw base64 image data, kept so the vision pass can analyse the real bytes. */
  bytes: string | null;
  mimeType: string;
  note?: string;
}

/**
 * Generates brand images and stores them in a locally served folder so channels
 * (Instagram) can fetch them by public URL.
 *
 * Two generation paths exist because Google runs two different APIs:
 *  - `generateImages` (Imagen models) — the classic image endpoint
 *  - `generateContent` with an image-output model — the Gemini-native path
 *
 * The Imagen models are retired for API keys created after their cutoff
 * ("no longer available to new users"), so the Gemini-native path is tried
 * first and Imagen is kept as a fallback for older keys that still have it.
 * Both are billed features; on a free-tier key both return 429 and we fall
 * back to a deterministic placeholder so the pipeline stays testable.
 */
@Injectable()
export class ImageService {
  private readonly logger = new Logger(ImageService.name);
  private readonly storageDir = join(process.cwd(), 'public', 'generated');

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

  /**
   * Returns a public URL for a generated image, plus the bytes so the caller
   * can run a vision pass over what was actually produced.
   */
  async generateImage(orgId: string, prompt: string): Promise<GeneratedImage> {
    if (!this.provider.available) {
      return this.placeholder(
        prompt,
        `No API key configured for the "${this.provider.name}" provider.`,
      );
    }

    const media = await this.provider.generateImage(prompt);
    if (!media?.bytes) {
      return this.placeholder(
        prompt,
        `Image generation unavailable via ${this.provider.name} — see server logs for the provider error.`,
      );
    }

    return this.store(orgId, media.bytes, media.mimeType, media.provider);
  }

  private async store(
    orgId: string,
    base64: string,
    mimeType: string,
    provider: string,
  ): Promise<GeneratedImage> {
    const ext = mimeType.includes('jpeg') ? 'jpg' : mimeType.includes('webp') ? 'webp' : 'png';
    const fileName = `${Date.now()}_${randomBytes(4).toString('hex')}.${ext}`;
    const dir = join(this.storageDir, orgId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(join(dir, fileName), Buffer.from(base64, 'base64'));
    this.logger.log(`Generated image ${fileName} for org ${orgId} via ${provider}`);
    return {
      url: `${this.publicBaseUrl()}/api/content/images/${orgId}/${fileName}`,
      provider,
      bytes: base64,
      mimeType,
    };
  }

  /** Deterministic placeholder keeps the pipeline testable without image access. */
  private placeholder(prompt: string, note: string): GeneratedImage {
    const seed = Math.abs([...prompt].reduce((a, c) => a + c.charCodeAt(0), 0)) % 1000;
    return {
      url: `https://picsum.photos/seed/${seed}/1080/1080`,
      provider: 'placeholder',
      bytes: null,
      mimeType: 'image/jpeg',
      note,
    };
  }

  async readImage(orgId: string, fileName: string): Promise<Buffer | null> {
    // Prevent path traversal
    if (fileName.includes('..') || fileName.includes('/') || orgId.includes('..') || orgId.includes('/')) return null;
    try {
      return await fs.readFile(join(this.storageDir, orgId, fileName));
    } catch {
      return null;
    }
  }
}
