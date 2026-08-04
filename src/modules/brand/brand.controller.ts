import { Body, Controller, Get, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BrandService } from './brand.service';
import { BrandImportService } from './brand-import.service';
import { ImportBrandFromWebsiteDto, UpsertBrandProfileDto, UpdateBrandProfileDto } from './dto';
import { OrgId } from '../../common/decorators';
import { TenantGuard } from '../../common/guards';

@ApiTags('Brand Profile')
@ApiBearerAuth()
@ApiHeader({ name: 'x-organization-id', required: true })
@UseGuards(TenantGuard)
@Controller('api/brand')
export class BrandController {
  constructor(
    private readonly service: BrandService,
    private readonly importService: BrandImportService,
  ) {}

  @Get() @ApiOperation({ summary: 'Get brand profile' })
  get(@OrgId() orgId: string) { return this.service.get(orgId); }

  /**
   * Reads the company's own website and fills in the brand profile from it.
   *
   * Returns every extracted field with a confidence rating and the phrase it
   * came from, plus whether each was saved. Low-confidence values are reported
   * but deliberately not written: this profile is injected into every agent
   * prompt, so an invented tagline would quietly shape all generated content.
   */
  @Post('import') @ApiOperation({ summary: 'Import brand profile by reading the company website' })
  importFromWebsite(@OrgId() orgId: string, @Body() dto: ImportBrandFromWebsiteDto) {
    return this.importService.importFromWebsite(orgId, dto.websiteUrl, {
      save: dto.save,
      overwrite: dto.overwrite,
    });
  }

  @Put() @ApiOperation({ summary: 'Create or replace brand profile' })
  upsert(@OrgId() orgId: string, @Body() dto: UpsertBrandProfileDto) { return this.service.upsert(orgId, dto); }

  @Patch() @ApiOperation({ summary: 'Update brand profile fields' })
  update(@OrgId() orgId: string, @Body() dto: UpdateBrandProfileDto) { return this.service.update(orgId, dto); }

  @Get('context') @ApiOperation({ summary: 'Preview the brand context injected into agent prompts' })
  async context(@OrgId() orgId: string) { return { context: await this.service.buildBrandContext(orgId) }; }
}
