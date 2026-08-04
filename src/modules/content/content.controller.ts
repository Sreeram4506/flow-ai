import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Response } from 'express';
import { ContentService } from './content.service';
import { CONTENT_QUEUE, GenerateJobData } from './content.queue';
import { ImageService } from './image.service';
import { CreateContentDto, GenerateContentDto, UpdateContentDto } from './dto';
import { PaginationDto } from '../../common/dto';
import { OrgId, Public } from '../../common/decorators';
import { TenantGuard } from '../../common/guards';

@ApiTags('Content (AI Publishing)')
@ApiBearerAuth()
@ApiHeader({ name: 'x-organization-id', required: true })
@Controller('api/content')
export class ContentController {
  constructor(
    private readonly service: ContentService,
    private readonly imageService: ImageService,
    @InjectQueue(CONTENT_QUEUE) private readonly queue: Queue<GenerateJobData>,
  ) {}

  /**
   * Enqueues generation and returns immediately.
   *
   * The pipeline runs four to six model calls plus media generation — ~70s for
   * an image post and 2-3 minutes with video — which is far past what an HTTP
   * request should hold open, and past most proxy timeouts. Progress streams
   * over the Socket.io channel the dashboard already has open
   * (`content-update` events: `content-job-started` / `-progress` /
   * `-finished` / `-failed`).
   *
   * `?sync=true` runs it inline instead, for scripts and for the Swagger UI
   * where waiting is more convenient than listening for a socket event.
   */
  @UseGuards(TenantGuard)
  @Post('generate') @ApiOperation({ summary: 'AI-generate an on-brand post for a channel (queued; ?sync=true to block)' })
  async generate(
    @OrgId() orgId: string,
    @Body() dto: GenerateContentDto,
    @Query('sync') sync?: string,
  ) {
    if (sync === 'true') return this.service.generate(orgId, dto);

    const job = await this.queue.add('generate', { organizationId: orgId, dto });
    return {
      jobId: String(job.id),
      status: 'queued',
      message: 'Generation started. Listen on the "content-update" socket event for progress.',
    };
  }

  @UseGuards(TenantGuard)
  @Post() @ApiOperation({ summary: 'Create content item manually' })
  create(@OrgId() orgId: string, @Body() dto: CreateContentDto) { return this.service.create(orgId, dto); }

  @UseGuards(TenantGuard)
  @Get() @ApiOperation({ summary: 'List content calendar' })
  findAll(@OrgId() orgId: string, @Query() query: PaginationDto & { channel?: any; status?: any }) {
    return this.service.findAll(orgId, query);
  }

  @UseGuards(TenantGuard)
  @Get(':id') @ApiOperation({ summary: 'Get content item' })
  findOne(@OrgId() orgId: string, @Param('id') id: string) { return this.service.findOne(orgId, id); }

  @UseGuards(TenantGuard)
  @Patch(':id') @ApiOperation({ summary: 'Edit content item (draft or scheduled)' })
  update(@OrgId() orgId: string, @Param('id') id: string, @Body() dto: UpdateContentDto) {
    return this.service.update(orgId, id, dto);
  }

  @UseGuards(TenantGuard)
  @Delete(':id') @ApiOperation({ summary: 'Cancel content item' })
  cancel(@OrgId() orgId: string, @Param('id') id: string) { return this.service.cancel(orgId, id); }

  @UseGuards(TenantGuard)
  @Post(':id/publish') @ApiOperation({ summary: 'Publish immediately (bypasses schedule, honors safety rails)' })
  publish(@OrgId() orgId: string, @Param('id') id: string) { return this.service.publishNow(orgId, id); }

  // ---- Public endpoints (no auth) ----

  @Public()
  @Get('public/blog/:orgSlug') @ApiOperation({ summary: 'Public blog feed for an organization' })
  publicBlog(@Param('orgSlug') orgSlug: string) { return this.service.publicBlog(orgSlug); }

  @Public()
  @Get('images/:orgId/:fileName') @ApiOperation({ summary: 'Serve generated images (public, for social platforms)' })
  async image(@Param('orgId') orgId: string, @Param('fileName') fileName: string, @Res() res: Response) {
    const buffer = await this.imageService.readImage(orgId, fileName);
    if (!buffer) return res.status(404).send('Not found');
    // Derived from the extension rather than hardcoded to image/png: this route
    // also serves generated .mp4 from Veo, which browsers and social platforms
    // refuse to play if it's labelled as a PNG.
    const ext = fileName.split('.').pop()?.toLowerCase();
    const contentType =
      ext === 'mp4' ? 'video/mp4'
      : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
      : ext === 'webp' ? 'image/webp'
      : 'image/png';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    return res.send(buffer);
  }
}
