import { Module } from '@nestjs/common';
import { BrandController } from './brand.controller';
import { BrandService } from './brand.service';
import { BrandImportService } from './brand-import.service';
import { AiCoreModule } from '../content/ai-core.module';

@Module({
  // AiCoreModule supplies the scraper and AI provider used to import a brand
  // profile from a website. It deliberately depends on no feature module, so
  // this does not create a cycle with ContentModule (which imports this one).
  imports: [AiCoreModule],
  controllers: [BrandController],
  providers: [BrandService, BrandImportService],
  exports: [BrandService, BrandImportService],
})
export class BrandModule {}
