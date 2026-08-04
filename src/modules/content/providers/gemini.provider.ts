import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { promises as fs } from 'fs';
import { AiProvider, GeneratedMedia, GroundedResult, TextResult, VideoOutcome } from './ai-provider.interface';

/**
 * Google Gemini implementation.
 *
 * Caveats discovered against a real key, which shape the code here:
 *  - Grounded search, image, vision and video are billed; a free-tier key gets
 *    429 RESOURCE_EXHAUSTED on all four while plain text still works.
 *  - Free-tier daily caps vary per model: `gemini-flash-latest` resolves to
 *    gemini-3.6-flash at 20 requests/day.
 *  - `imagen-3.0-*` / `imagen-4.0-*` return 404 for keys created after their
 *    cutoff, so the Gemini-native image path is tried first and Imagen is only
 *    a fallback for older keys.
 */
@Injectable()
export class GeminiProvider implements AiProvider {
  readonly name = 'gemini';
  private readonly logger = new Logger(GeminiProvider.name);
  private readonly ai: GoogleGenAI | null = null;

  private readonly textModel: string;
  private readonly imageModel: string;
  private readonly videoModel: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('gemini.apiKey');
    if (apiKey) this.ai = new GoogleGenAI({ apiKey });

    this.textModel = this.configService.get<string>('gemini.textModel') || 'gemini-2.0-flash';
    this.imageModel = this.configService.get<string>('agents.imageModel') || 'gemini-2.5-flash-image';
    this.videoModel = this.configService.get<string>('agents.videoModel') || 'veo-3.1-fast-generate-preview';
  }

  get available(): boolean {
    return this.ai !== null;
  }

  async generateText(prompt: string): Promise<string> {
    return (await this.generateTextResult(prompt)).text;
  }

  async generateTextResult(prompt: string): Promise<TextResult> {
    if (!this.ai) return { text: '', error: 'GEMINI_API_KEY is not configured.' };

    // A bare 503 UNAVAILABLE is Gemini's "model briefly overloaded" signal,
    // not a real outage — confirmed by retrying the exact same prompt
    // seconds later with no other change and getting a clean answer. Failing
    // the whole agent run on one blip (and, with failover wired up,
    // needlessly falling through to the *other* vendor) wastes a run for
    // something a short retry fixes for free.
    let lastErr: any;
    for (let attempt = 0; attempt <= 2; attempt++) {
      try {
        const response = await this.ai.models.generateContent({ model: this.textModel, contents: prompt });
        return { text: response.text || '' };
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

  /** 503/UNAVAILABLE — transient overload, worth one quick retry. 429/401/404 are not. */
  private isTransient(err: any): boolean {
    return /"code":\s*503|UNAVAILABLE/.test(String(err?.message ?? err));
  }

  /** Turns the common, actionable failures into something an operator can act on. */
  private humanise(err: any, fallback: string): string {
    const raw = String(err?.message ?? err);
    if (/RESOURCE_EXHAUSTED|429/.test(raw)) {
      const perDay = raw.match(/"quotaValue":\s*"(\d+)"/)?.[1];
      return (
        `Gemini quota exhausted on "${this.textModel}"` +
        (perDay ? ` (free-tier limit ${perDay}/day)` : '') +
        ' — enable billing or switch TEXT_MODEL.'
      );
    }
    if (/API_KEY_INVALID|401|PERMISSION_DENIED/.test(raw)) {
      return 'Gemini rejected the API key. Check GEMINI_API_KEY.';
    }
    if (/NOT_FOUND|404/.test(raw)) {
      return `Model "${this.textModel}" is not available to this key (404).`;
    }
    return fallback;
  }

  async researchGrounded(prompt: string): Promise<GroundedResult | null> {
    if (!this.ai) return null;
    try {
      const response = await this.ai.models.generateContent({
        model: this.textModel,
        contents: prompt,
        config: { tools: [{ googleSearch: {} }] },
      });
      const meta = response.candidates?.[0]?.groundingMetadata;
      const sources = (meta?.groundingChunks || [])
        .map((c: any) => c?.web?.uri)
        .filter((u: unknown): u is string => typeof u === 'string' && u.length > 0);

      return {
        text: response.text || '',
        sources: [...new Set(sources)],
        queries: (meta?.webSearchQueries || []) as string[],
      };
    } catch (err: any) {
      this.logger.warn(`Grounded search unavailable: ${this.reason(err)}`);
      return null;
    }
  }

  async analyzeImage(bytes: string, mimeType: string, instruction: string): Promise<string> {
    if (!this.ai) return '';
    try {
      const response = await this.ai.models.generateContent({
        model: this.textModel,
        contents: [{ inlineData: { mimeType, data: bytes } }, { text: instruction }],
      });
      return response.text || '';
    } catch (err: any) {
      this.logger.warn(`Vision analysis unavailable: ${this.reason(err)}`);
      return '';
    }
  }

  async generateImage(prompt: string): Promise<GeneratedMedia | null> {
    if (!this.ai) return null;
    const attempts: string[] = [];

    // Gemini-native image output (current models).
    try {
      const response = await this.ai.models.generateContent({ model: this.imageModel, contents: prompt });
      const parts = response.candidates?.[0]?.content?.parts || [];
      const inline = parts.find((p: any) => p?.inlineData?.data)?.inlineData;
      if (inline?.data) {
        return {
          bytes: inline.data,
          mimeType: inline.mimeType || 'image/png',
          provider: `gemini:${this.imageModel}`,
        };
      }
      attempts.push(`${this.imageModel}: no image part`);
    } catch (err: any) {
      attempts.push(`${this.imageModel}: ${this.reason(err)}`);
    }

    // Imagen fallback for older keys that still have access.
    try {
      const response = await this.ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt,
        config: { numberOfImages: 1 },
      });
      const imageBytes = response?.generatedImages?.[0]?.image?.imageBytes;
      if (imageBytes) {
        return { bytes: imageBytes, mimeType: 'image/png', provider: 'gemini:imagen-4.0' };
      }
      attempts.push('imagen-4.0-generate-001: no image returned');
    } catch (err: any) {
      attempts.push(`imagen-4.0-generate-001: ${this.reason(err)}`);
    }

    this.logger.warn(`Image generation unavailable — ${attempts.join(' | ')}`);
    return null;
  }

  async generateVideo(prompt: string, destination: string, maxWaitMs: number): Promise<VideoOutcome> {
    if (!this.ai) return { ok: false, reason: 'GEMINI_API_KEY is not configured.' };
    try {
      let operation = await this.ai.models.generateVideos({ model: this.videoModel, prompt });

      const deadline = Date.now() + maxWaitMs;
      while (!operation.done) {
        if (Date.now() > deadline) {
          this.logger.warn(`Veo operation ${operation.name} exceeded ${maxWaitMs / 1000}s; abandoning the wait`);
          return {
            ok: false,
            reason: `Timed out after ${Math.round(maxWaitMs / 60000)} min. Operation ${operation.name} may still finish server-side.`,
          };
        }
        await this.sleep(10_000);
        operation = await this.ai.operations.getVideosOperation({ operation });
      }

      if (operation.error) {
        const detail = JSON.stringify(operation.error).slice(0, 200);
        this.logger.error(`Veo failed: ${detail}`);
        return { ok: false, reason: `Veo rejected the job: ${detail}` };
      }

      const video = operation.response?.generatedVideos?.[0]?.video;
      if (!video) return { ok: false, reason: 'Veo returned no video.' };

      if (video.videoBytes) {
        await fs.writeFile(destination, Buffer.from(video.videoBytes, 'base64'));
      } else if (video.uri) {
        // Generated files sit behind an authenticated URI; the SDK downloader
        // attaches the API key.
        await this.ai.files.download({ file: video, downloadPath: destination });
      } else {
        return { ok: false, reason: 'Veo returned a video with neither bytes nor a URI.' };
      }

      return { ok: true, filePath: destination, provider: `gemini:${this.videoModel}` };
    } catch (err: any) {
      const reason = this.reason(err);
      this.logger.warn(`Video generation unavailable: ${reason}`);
      return { ok: false, reason };
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Gemini errors arrive as JSON strings; surface the useful part. */
  private reason(err: any): string {
    const msg = String(err?.message ?? err);
    try {
      const parsed = JSON.parse(msg);
      return `${parsed.error?.code} ${parsed.error?.status}`;
    } catch {
      return msg.slice(0, 140);
    }
  }
}
