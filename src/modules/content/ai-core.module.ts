import { Module } from '@nestjs/common';
import { GeminiProvider } from './providers/gemini.provider';
import { OpenAiProvider } from './providers/openai.provider';
import { aiProviderFactory } from './providers/ai-provider.factory';
import { AI_PROVIDER } from './providers/ai-provider.interface';
import { ScraperService } from './scraper.service';

/**
 * Vendor-agnostic AI access and web scraping, with no dependency on any feature
 * module.
 *
 * It is separate from `ContentModule` because more than one feature needs this
 * infrastructure: `ContentModule` uses it for the generation pipeline, and
 * `BrandModule` uses it to import a brand profile from a website. Since
 * `ContentModule` already imports `BrandModule`, putting the shared pieces here
 * is what keeps the two from importing each other in a cycle.
 */
@Module({
  providers: [GeminiProvider, OpenAiProvider, aiProviderFactory, ScraperService],
  exports: [AI_PROVIDER, ScraperService],
})
export class AiCoreModule {}
