/**
 * Provider-agnostic surface for the content pipeline's AI stages.
 *
 * The pipeline (research → parse → prompt → media → vision → caption) is written
 * against this interface so the vendor is a configuration choice rather than a
 * rewrite. Two things forced this shape:
 *
 *  - Capability availability differs per vendor *and per key*. Grounded search,
 *    image, vision and video are all billed features that a given key may simply
 *    not have. Every capability therefore returns `null` when unavailable rather
 *    than throwing, so the pipeline can degrade one stage without losing the run.
 *  - Model ids get retired without notice (Gemini's `imagen-3.0-*` now 404s for
 *    newly-created keys), so every model id is configurable, never hardcoded.
 */

/** Raw generated media plus the bytes, so the vision stage can inspect it. */
export interface GeneratedMedia {
  bytes: string | null;
  mimeType: string;
  /** Set when the provider returns a URL instead of inline bytes. */
  url?: string;
  provider: string;
}

/** Result of a web-grounded research call. */
export interface GroundedResult {
  text: string;
  /** Source URLs backing the findings. */
  sources: string[];
  /** The search queries actually issued, useful for debugging relevance. */
  queries: string[];
}

/**
 * Video generation reports *why* it failed rather than returning a bare null.
 * Failures here are frequently actionable by the operator — a moderation block
 * on the generated prompt reads very differently from a timeout or a billing
 * problem — and burying that in server logs makes a content item that says
 * only "skipped" impossible to act on.
 */
export type VideoOutcome =
  | { ok: true; filePath: string; provider: string }
  | { ok: false; reason: string };

/**
 * Text generation that distinguishes "the model said nothing" from "the call
 * failed", which a bare string cannot.
 *
 * This exists because swallowing the reason made an exhausted API credit
 * balance surface to the user as a *successful* agent run summarised
 * "No response from model" — a billing problem dressed up as a green tick.
 */
export interface TextResult {
  text: string;
  /** Present only when the call failed. Safe to show to an operator. */
  error?: string;
}

export interface AiProvider {
  readonly name: string;
  /** False when no API key is configured for this provider. */
  readonly available: boolean;

  /** Plain text generation. Returns '' on failure — callers fall back. */
  generateText(prompt: string): Promise<string>;

  /** As `generateText`, but reports why an empty result came back. */
  generateTextResult(prompt: string): Promise<TextResult>;

  /**
   * Web-grounded research. Returns null when the key lacks grounded search,
   * which the caller reports as an `unverified` brief rather than a failure.
   */
  researchGrounded(prompt: string): Promise<GroundedResult | null>;

  /** Describes an image. Returns '' when vision is unavailable. */
  analyzeImage(bytes: string, mimeType: string, instruction: string): Promise<string>;

  /** Returns null when image generation is unavailable, so callers can use a placeholder. */
  generateImage(prompt: string): Promise<GeneratedMedia | null>;

  /**
   * Generates a video and writes it to `destination`.
   * Long-running: implementations poll and must respect `maxWaitMs`.
   */
  generateVideo(prompt: string, destination: string, maxWaitMs: number): Promise<VideoOutcome>;
}

/** DI token — `AiProvider` is an interface and so has no runtime identity. */
export const AI_PROVIDER = Symbol('AI_PROVIDER');
