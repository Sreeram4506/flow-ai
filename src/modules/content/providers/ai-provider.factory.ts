import { Logger, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AI_PROVIDER, AiProvider } from './ai-provider.interface';
import { GeminiProvider } from './gemini.provider';
import { OpenAiProvider } from './openai.provider';
import { FailoverAiProvider } from './failover.provider';

/**
 * Chooses the AI vendor for the content pipeline from `AI_PROVIDER`.
 *
 * When both vendors have keys the preferred one is wrapped in a failover so a
 * single exhausted balance or daily quota can't take the whole agent platform
 * offline — the other vendor picks up until the first recovers. Set
 * `AI_FAILOVER=false` to pin generation to one vendor, e.g. to keep costs on a
 * single bill or to reproduce a provider-specific problem.
 */
export const aiProviderFactory: Provider = {
  provide: AI_PROVIDER,
  inject: [ConfigService, GeminiProvider, OpenAiProvider],
  useFactory: (config: ConfigService, gemini: GeminiProvider, openai: OpenAiProvider): AiProvider => {
    const logger = new Logger('AiProviderFactory');
    const requested = config.get<string>('aiProvider') || 'gemini';
    const failoverEnabled = config.get<boolean>('aiFailover') !== false;

    const preferred = requested === 'openai' ? openai : gemini;
    const other = preferred === openai ? gemini : openai;

    if (preferred.available && other.available && failoverEnabled) {
      logger.log(
        `Content pipeline using "${preferred.name}" with automatic failover to "${other.name}"`,
      );
      return new FailoverAiProvider(preferred, other);
    }

    if (preferred.available) {
      logger.log(`Content pipeline using "${preferred.name}" for research, image, vision and video`);
      return preferred;
    }

    if (other.available) {
      logger.warn(
        `AI_PROVIDER="${requested}" has no API key configured; falling back to "${other.name}". ` +
          `Set the matching key or change AI_PROVIDER to silence this.`,
      );
      return other;
    }

    logger.error(
      `Neither provider has an API key. Every AI stage will be skipped and content will be ` +
        `placeholder-only. Set OPENAI_API_KEY or GEMINI_API_KEY.`,
    );
    return preferred;
  },
};
