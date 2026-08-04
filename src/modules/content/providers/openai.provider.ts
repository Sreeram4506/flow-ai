import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { promises as fs } from 'fs';
import { AiProvider, GeneratedMedia, GroundedResult, TextResult, VideoOutcome } from './ai-provider.interface';

/**
 * OpenAI implementation: Responses API for text/vision/web-search, Images API
 * for stills, and the Videos (Sora) API for clips.
 *
 * Unlike the Gemini path, all five capabilities are available on a funded key —
 * verified against this project's key before this was written.
 */
@Injectable()
export class OpenAiProvider implements AiProvider {
  readonly name = 'openai';
  private readonly logger = new Logger(OpenAiProvider.name);
  private readonly client: OpenAI | null = null;

  private readonly textModel: string;
  private readonly imageModel: string;
  private readonly videoModel: string;
  private readonly reasoningEffort: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('openai.apiKey');
    if (apiKey) this.client = new OpenAI({ apiKey });

    this.textModel = this.configService.get<string>('openai.model') || 'gpt-5-mini';
    this.imageModel = this.configService.get<string>('openai.imageModel') || 'gpt-image-1-mini';
    this.videoModel = this.configService.get<string>('openai.videoModel') || 'sora-2';
    this.reasoningEffort = this.configService.get<string>('openai.reasoningEffort') ?? 'low';
  }

  /**
   * The pipeline's stages are largely mechanical (parse to JSON, describe an
   * image, write a caption from a supplied brief), so full reasoning effort
   * mostly buys latency: measured on this project's key, one stage took 25.8s
   * at default effort vs 8.1s on gpt-5-mini at low effort — and the pipeline
   * runs four to six such calls per post.
   *
   * Set OPENAI_REASONING_EFFORT='' to omit the parameter entirely, which is
   * required for non-reasoning models that reject it.
   */
  private reasoningOpts(): Record<string, unknown> {
    return this.reasoningEffort ? { reasoning: { effort: this.reasoningEffort } } : {};
  }

  get available(): boolean {
    return this.client !== null;
  }

  async generateText(prompt: string): Promise<string> {
    return (await this.generateTextResult(prompt)).text;
  }

  async generateTextResult(prompt: string): Promise<TextResult> {
    if (!this.client) return { text: '', error: 'OPENAI_API_KEY is not configured.' };

    // 500/502/503 from OpenAI are transient server-side hiccups, not a real
    // outage, so one quick retry is worth it before giving up on this vendor
    // (and, with failover wired up, before spending a call on the other one).
    let lastErr: any;
    for (let attempt = 0; attempt <= 2; attempt++) {
      try {
        const response = await this.client.responses.create({
          model: this.textModel,
          input: prompt,
          ...this.reasoningOpts(),
        });
        return { text: response.output_text || '' };
      } catch (err: any) {
        lastErr = err;
        if (!this.isTransient(err) || attempt === 2) break;
        await this.sleep(1000 * 2 ** attempt);
      }
    }
    const reason = this.reason(lastErr);
    this.logger.error(`Text generation failed: ${reason}`);
    return { text: '', error: this.humanise(lastErr, reason) };
  }

  private isTransient(err: any): boolean {
    return [500, 502, 503].includes(err?.status);
  }

  /** Turns the common, actionable failures into something an operator can act on. */
  private humanise(err: any, fallback: string): string {
    const code = err?.code || err?.error?.code || '';
    if (code === 'credit_balance_exhausted' || /no credits remaining/i.test(err?.message || '')) {
      return 'OpenAI credit balance is exhausted — add credits at platform.openai.com/settings/organization/billing.';
    }
    if (err?.status === 429) return `Rate limited or out of quota on ${this.textModel} (${code || '429'}).`;
    if (err?.status === 401) return 'OpenAI rejected the API key (401). Check OPENAI_API_KEY.';
    if (err?.status === 404) return `Model "${this.textModel}" is not available to this key (404).`;
    return fallback;
  }

  async researchGrounded(prompt: string): Promise<GroundedResult | null> {
    if (!this.client) return null;
    try {
      const response = await this.client.responses.create({
        model: this.textModel,
        tools: [{ type: 'web_search' }],
        input: prompt,
        ...this.reasoningOpts(),
      });

      return {
        text: response.output_text || '',
        sources: this.extractSources(response.output),
        queries: this.extractQueries(response.output),
      };
    } catch (err: any) {
      this.logger.warn(`Grounded search unavailable: ${this.reason(err)}`);
      return null;
    }
  }

  async analyzeImage(bytes: string, mimeType: string, instruction: string): Promise<string> {
    if (!this.client) return '';
    try {
      const response = await this.client.responses.create({
        model: this.textModel,
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: instruction },
              { type: 'input_image', image_url: `data:${mimeType};base64,${bytes}`, detail: 'auto' },
            ],
          },
        ],
        ...this.reasoningOpts(),
      });
      return response.output_text || '';
    } catch (err: any) {
      this.logger.warn(`Vision analysis unavailable: ${this.reason(err)}`);
      return '';
    }
  }

  async generateImage(prompt: string): Promise<GeneratedMedia | null> {
    if (!this.client) return null;
    try {
      const response = await this.client.images.generate({
        model: this.imageModel,
        prompt,
        size: '1024x1024',
        n: 1,
      });
      const b64 = response.data?.[0]?.b64_json;
      if (!b64) {
        this.logger.warn('Image generation returned no data');
        return null;
      }
      return { bytes: b64, mimeType: 'image/png', provider: `openai:${this.imageModel}` };
    } catch (err: any) {
      this.logger.warn(`Image generation unavailable: ${this.reason(err)}`);
      return null;
    }
  }

  async generateVideo(prompt: string, destination: string, maxWaitMs: number): Promise<VideoOutcome> {
    if (!this.client) return { ok: false, reason: 'OPENAI_API_KEY is not configured.' };
    try {
      let job = await this.client.videos.create({
        model: this.videoModel as any,
        prompt,
        // Shortest supported clip and a vertical frame: this feeds Instagram
        // Reels / LinkedIn, and video is billed by duration.
        seconds: '4',
        size: '720x1280',
      });
      this.logger.log(`Sora job ${job.id} submitted`);

      const deadline = Date.now() + maxWaitMs;
      while (job.status === 'queued' || job.status === 'in_progress') {
        if (Date.now() > deadline) {
          this.logger.warn(`Video job ${job.id} exceeded ${maxWaitMs / 1000}s; abandoning the wait`);
          return {
            ok: false,
            reason: `Timed out after ${Math.round(maxWaitMs / 60000)} min. Job ${job.id} may still finish server-side.`,
          };
        }
        await this.sleep(10_000);
        job = await this.client.videos.retrieve(job.id);
      }

      if (job.status !== 'completed') {
        const code = (job.error as any)?.code || 'unknown_error';
        const detail = (job.error as any)?.message || '';
        this.logger.error(`Video job ${job.id} failed: ${code} ${detail}`.trim());
        // Moderation rejects prompts naming real brands, public figures or
        // trademarked material — by far the most common failure, and one the
        // operator can act on by rewording, so name it explicitly.
        const hint =
          code === 'moderation_blocked'
            ? ' The generated prompt was rejected by content moderation — this usually means it named a real brand, product, logo or person.'
            : '';
        return { ok: false, reason: `Sora rejected the job (${code}).${hint}` };
      }

      const content = await this.client.videos.downloadContent(job.id, { variant: 'video' });
      await fs.writeFile(destination, Buffer.from(await content.arrayBuffer()));
      return { ok: true, filePath: destination, provider: `openai:${this.videoModel}` };
    } catch (err: any) {
      const reason = this.reason(err);
      this.logger.warn(`Video generation unavailable: ${reason}`);
      return { ok: false, reason };
    }
  }

  // ---------- helpers ----------

  /**
   * Citation URLs live in `url_citation` annotations on the output message,
   * and web_search_call items also carry the sources consulted.
   */
  private extractSources(output: any[] | undefined): string[] {
    const urls: string[] = [];
    const walk = (node: any) => {
      if (!node || typeof node !== 'object') return;
      if (typeof node.url === 'string' && /^https?:\/\//.test(node.url)) urls.push(node.url);
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(walk);
        else if (value && typeof value === 'object') walk(value);
      }
    };
    (output || []).forEach(walk);
    return [...new Set(urls)];
  }

  private extractQueries(output: any[] | undefined): string[] {
    return (output || [])
      .filter((item: any) => item?.type === 'web_search_call')
      .map((item: any) => item?.action?.query)
      .filter((q: unknown): q is string => typeof q === 'string');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private reason(err: any): string {
    const status = err?.status ?? '';
    const code = err?.code || err?.error?.code || '';
    const msg = String(err?.message ?? err).replace(/\s+/g, ' ').slice(0, 140);
    return `${status} ${code} ${msg}`.trim();
  }
}
