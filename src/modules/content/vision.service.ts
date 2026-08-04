import { Inject, Injectable, Logger } from '@nestjs/common';
import { AI_PROVIDER, AiProvider } from './providers/ai-provider.interface';

export interface MediaAnalysis {
  /** What is actually depicted, described plainly. */
  description: string;
  /** Concrete visual elements a caption can reference. */
  subjects: string[];
  mood: string;
  colors: string[];
  /** True when a real vision pass ran; false when it degraded to the prompt. */
  analyzed: boolean;
  note?: string;
}

/**
 * Stage 5 of the pipeline: look at the media that was actually generated.
 *
 * This exists because a caption written from the *image prompt* describes the
 * picture that was requested, not the one that came back — generators drop,
 * add and reinterpret elements constantly. Captioning from a vision pass keeps
 * the words and the picture in agreement.
 *
 * Vision input is a billed Gemini feature; on a free-tier key it returns 429.
 * When that happens the analysis falls back to the prompt and is flagged
 * `analyzed: false`, so downstream callers know the caption is describing an
 * intention rather than an observation.
 */
@Injectable()
export class VisionService {
  private readonly logger = new Logger(VisionService.name);

  constructor(@Inject(AI_PROVIDER) private readonly provider: AiProvider) {}

  /**
   * Analyses generated media. `bytes` is the raw image (base64) when available —
   * we analyse the bytes we just generated rather than re-fetching the URL,
   * which avoids a round trip and works before the file is publicly reachable.
   */
  async analyze(
    bytes: string | null,
    mimeType: string,
    fallbackPrompt: string,
  ): Promise<MediaAnalysis> {
    if (!this.provider.available || !bytes) {
      return this.fromPrompt(
        fallbackPrompt,
        !this.provider.available
          ? `No API key configured for the "${this.provider.name}" provider — media was not analysed.`
          : 'No media bytes to analyse — caption derived from the prompt instead.',
      );
    }

    const raw = await this.provider.analyzeImage(
      bytes,
      mimeType,
      `Look at this image and describe what is actually in it.\n` +
        `Return ONLY valid JSON, no markdown fences, with these keys:\n` +
        `{"description": string (2-3 sentences describing exactly what is shown), ` +
        `"subjects": string[] (the concrete things visible), ` +
        `"mood": string (the feeling it conveys), ` +
        `"colors": string[] (the dominant colours)}\n` +
        `Describe only what you can see. Do not guess at intent or add context that isn't visible.`,
    );

    if (!raw) {
      return this.fromPrompt(
        fallbackPrompt,
        'Vision analysis unavailable — caption derived from the image prompt instead.',
      );
    }

    const obj = this.parseJson(raw);
    const description = typeof obj.description === 'string' ? obj.description.trim() : '';
    if (!description) return this.fromPrompt(fallbackPrompt, 'Vision returned no usable description.');

    return {
      description,
      subjects: this.stringArray(obj.subjects),
      mood: typeof obj.mood === 'string' ? obj.mood : '',
      colors: this.stringArray(obj.colors),
      analyzed: true,
    };
  }

  /**
   * Degraded path: treat the generation prompt as the description. The caption
   * still gets written, but `analyzed: false` records that nobody looked at the
   * actual picture.
   */
  private fromPrompt(prompt: string, note: string): MediaAnalysis {
    return {
      description: prompt || 'No media available.',
      subjects: [],
      mood: '',
      colors: [],
      analyzed: false,
      note,
    };
  }

  private parseJson(raw: string): Record<string, any> {
    if (!raw) return {};
    const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return JSON.parse(match[0]);
        } catch {
          return {};
        }
      }
      return {};
    }
  }

  private stringArray(v: unknown): string[] {
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : [];
  }

  private reason(err: any): string {
    const msg = String(err?.message ?? err);
    try {
      const parsed = JSON.parse(msg);
      return `${parsed.error?.code} ${parsed.error?.status}`;
    } catch {
      return msg.slice(0, 160);
    }
  }
}
