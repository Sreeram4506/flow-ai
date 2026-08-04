import { Process, Processor, OnQueueFailed } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { ContentService } from './content.service';
import { GenerateContentDto } from './dto';
import { EventsGateway } from '../../gateway/events.gateway';

export const CONTENT_QUEUE = 'content-generation';

export interface GenerateJobData {
  organizationId: string;
  dto: GenerateContentDto;
  agentId?: string;
  /** Who asked for it, so progress can be attributed in the UI. */
  requestedBy?: string;
}

/**
 * Runs content generation off the request thread.
 *
 * The pipeline makes four to six model calls plus media generation, so a full
 * post takes ~70s and a video post 2-3 minutes. Doing that inside the HTTP
 * request meant `POST /api/content/generate` held a connection open for
 * minutes and would exceed most proxy and load-balancer timeouts in
 * production. The endpoint now enqueues and returns immediately; progress
 * arrives over the Socket.io connection the dashboard already holds.
 */
@Processor(CONTENT_QUEUE)
export class ContentQueueProcessor {
  private readonly logger = new Logger(ContentQueueProcessor.name);

  constructor(
    private readonly contentService: ContentService,
    private readonly gateway: EventsGateway,
  ) {}

  @Process({ name: 'generate', concurrency: 2 })
  async handleGenerate(job: Job<GenerateJobData>) {
    const { organizationId, dto, agentId } = job.data;
    this.logger.log(`Job ${job.id}: generating ${dto.channel} content — "${dto.topic}"`);

    this.emit(organizationId, {
      type: 'content-job-started',
      jobId: String(job.id),
      channel: dto.channel,
      topic: dto.topic,
    });

    const item = await this.contentService.generate(organizationId, dto, agentId, (stage, status) => {
      // Per-stage progress: the pipeline is long enough that a spinner with no
      // detail is a poor experience, and a degraded stage is worth seeing as
      // it happens rather than only in the final record.
      void job.progress({ stage, status });
      this.emit(organizationId, { type: 'content-job-progress', jobId: String(job.id), stage, status });
    });

    this.emit(organizationId, {
      type: 'content-job-finished',
      jobId: String(job.id),
      contentId: item.id,
      channel: item.channel,
      contentType: item.type,
      title: item.title,
      caption: item.caption?.slice(0, 200),
      imageUrl: item.imageUrl,
      videoUrl: item.videoUrl,
      pipeline: item.pipeline,
    });
    return { contentId: item.id };
  }

  @OnQueueFailed()
  onFailed(job: Job<GenerateJobData>, err: Error) {
    this.logger.error(`Job ${job.id} failed: ${err.message}`);
    this.emit(job.data?.organizationId, {
      type: 'content-job-failed',
      jobId: String(job.id),
      error: err.message,
    });
  }

  private emit(orgId: string | undefined, payload: Record<string, unknown>) {
    if (!orgId) return;
    try {
      this.gateway.server?.to(`org:${orgId}`).emit('content-update', {
        ...payload,
        at: new Date().toISOString(),
      });
    } catch {
      /* gateway not ready — non-fatal */
    }
  }
}
