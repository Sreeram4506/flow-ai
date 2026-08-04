import { Logger } from '@nestjs/common';
import {
  AiProvider,
  GeneratedMedia,
  GroundedResult,
  TextResult,
  VideoOutcome,
} from './ai-provider.interface';

/**
 * Tries one provider, then the other.
 *
 * Capability availability is per-key and changes without warning: an OpenAI
 * balance runs dry mid-day, a Gemini free-tier model hits its 20-requests-a-day
 * cap. Either one alone therefore takes the whole agent platform down until
 * somebody notices and edits `.env`. Falling through to the other vendor keeps
 * it running on whatever currently works.
 *
 * Only *provider-level* failures fail over — no credit, rate limited, bad key,
 * model unavailable. A prompt the model legitimately refused, or an empty
 * answer, is not retried elsewhere: the second vendor would refuse it too, and
 * retrying would just double the spend.
 */
export class FailoverAiProvider implements AiProvider {
  private readonly logger = new Logger(FailoverAiProvider.name);

  constructor(
    private readonly primary: AiProvider,
    private readonly secondary: AiProvider,
  ) {}

  get name(): string {
    return this.usable.map((p) => p.name).join('→') || this.primary.name;
  }

  get available(): boolean {
    return this.usable.length > 0;
  }

  /** Configured providers, primary first. */
  private get usable(): AiProvider[] {
    return [this.primary, this.secondary].filter((p) => p.available);
  }

  /**
   * Runs `attempt` against each provider until one succeeds.
   * `succeeded` decides what counts as a usable result.
   */
  private async race<T>(
    label: string,
    attempt: (provider: AiProvider) => Promise<T>,
    succeeded: (value: T) => boolean,
    exhausted: (lastFailure: T | undefined) => T,
  ): Promise<T> {
    const providers = this.usable;
    let last: T | undefined;

    for (const provider of providers) {
      const result = await attempt(provider);
      if (succeeded(result)) {
        if (provider !== providers[0]) {
          this.logger.warn(`${label}: fell back to "${provider.name}" after "${providers[0].name}" failed`);
        }
        return result;
      }
      last = result;
      if (provider !== providers[providers.length - 1]) {
        this.logger.warn(`${label}: "${provider.name}" unavailable, trying the next provider`);
      }
    }
    return exhausted(last);
  }

  async generateText(prompt: string): Promise<string> {
    return (await this.generateTextResult(prompt)).text;
  }

  async generateTextResult(prompt: string): Promise<TextResult> {
    if (!this.available) return { text: '', error: 'No AI provider has an API key configured.' };
    return this.race<TextResult>(
      'text',
      (p) => p.generateTextResult(prompt),
      (r) => !r.error,
      (last) => last ?? { text: '', error: 'No AI provider available.' },
    );
  }

  async researchGrounded(prompt: string): Promise<GroundedResult | null> {
    if (!this.available) return null;
    return this.race<GroundedResult | null>(
      'grounded search',
      (p) => p.researchGrounded(prompt),
      (r) => !!r && !!r.text,
      () => null,
    );
  }

  async analyzeImage(bytes: string, mimeType: string, instruction: string): Promise<string> {
    if (!this.available) return '';
    return this.race<string>(
      'vision',
      (p) => p.analyzeImage(bytes, mimeType, instruction),
      (r) => !!r,
      () => '',
    );
  }

  async generateImage(prompt: string): Promise<GeneratedMedia | null> {
    if (!this.available) return null;
    return this.race<GeneratedMedia | null>(
      'image',
      (p) => p.generateImage(prompt),
      (r) => !!r?.bytes,
      () => null,
    );
  }

  async generateVideo(prompt: string, destination: string, maxWaitMs: number): Promise<VideoOutcome> {
    if (!this.available) return { ok: false, reason: 'No AI provider has an API key configured.' };
    return this.race<VideoOutcome>(
      'video',
      (p) => p.generateVideo(prompt, destination, maxWaitMs),
      (r) => r.ok,
      (last) => last ?? { ok: false, reason: 'No AI provider available.' },
    );
  }
}
