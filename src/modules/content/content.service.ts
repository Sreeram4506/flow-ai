import { ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ContentStatus, ContentType, PublishChannel } from '@prisma/client';
import { AI_PROVIDER, AiProvider } from './providers/ai-provider.interface';
import { PrismaService } from '../../database/prisma.service';
import { PaginationDto } from '../../common/dto';
import { paginate } from '../../common/utils';
import { BrandService } from '../brand/brand.service';
import { ChannelsService } from '../channels/channels.service';
import { AgentSettingsService } from '../agent-settings/agent-settings.service';
import { ImageService } from './image.service';
import { VideoService } from './video.service';
import { ResearchService, ResearchBrief } from './research.service';
import { VisionService, MediaAnalysis } from './vision.service';
import { CreateContentDto, GenerateContentDto, UpdateContentDto } from './dto';
import { EventsGateway } from '../../gateway/events.gateway';

const MAX_PUBLISH_ATTEMPTS = 3;

/** Called as each pipeline stage starts and settles, for progress streaming. */
export type StageReporter = (stage: string, status: string) => void;

@Injectable()
export class ContentService {
  private readonly logger = new Logger(ContentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly brandService: BrandService,
    private readonly channelsService: ChannelsService,
    private readonly settingsService: AgentSettingsService,
    private readonly imageService: ImageService,
    private readonly videoService: VideoService,
    private readonly researchService: ResearchService,
    private readonly visionService: VisionService,
    private readonly gateway: EventsGateway,
    @Inject(AI_PROVIDER) private readonly provider: AiProvider,
  ) {}

  // ---- Generation ----

  private async generateText(prompt: string): Promise<string> {
    return this.provider.generateText(prompt);
  }

  /**
   * Generates a complete on-brand post through the research-first pipeline:
   *
   *   1. RESEARCH  — search for real information about the topic
   *   2. PARSE     — structure it into a brief (facts, angle, audience, points)
   *   3. PROMPT    — derive a media prompt from the brief
   *   4. MEDIA     — generate the image (or video)
   *   5. VISION    — look at what was actually generated
   *   6. CAPTION   — write the copy from the brief *and* the vision analysis
   *
   * The ordering is the point: copy is written last, once we know both what is
   * true (research) and what the picture actually shows (vision). Writing the
   * caption first — the previous behaviour — meant it described neither.
   *
   * Every stage degrades independently. A stage that can't run records why in
   * `pipeline` instead of aborting, so a free-tier key still produces a draft
   * and the UI can show exactly which stages were skipped.
   */
  async generate(
    orgId: string,
    dto: GenerateContentDto,
    agentId?: string,
    onStage: StageReporter = () => undefined,
  ) {
    // These same rails already gate the tool-calling agent loop
    // (agent-executor.service.ts); this is the other entry point into the
    // billed research/image/video pipeline (direct POST /api/content/generate
    // and its queued job), and it was bypassing both the kill-switch and the
    // daily token budget entirely. Checked up front so an org that flips the
    // kill-switch — or has already exhausted its budget — is stopped before
    // any paid API call runs, not after.
    if (await this.settingsService.isHalted(orgId)) {
      throw new ForbiddenException('Kill-switch is active for this organization — content generation is paused');
    }
    // Rough upfront estimate of this pipeline's cost (research + media prompt
    // + vision + copy calls; more for video). Approximate by design — the
    // point is to stop a run before it starts once the daily budget is spent,
    // not to meter exact token usage.
    const estTokens = dto.withVideo ? 6000 : 4000;
    const budget = await this.settingsService.consumeTokenBudget(orgId, estTokens);
    if (!budget.allowed) {
      throw new ForbiddenException('Daily AI token budget exhausted for this organization');
    }

    const brandContext = await this.brandService.buildBrandContext(orgId);
    const isBlog = dto.channel === PublishChannel.WEBSITE;
    const wantsVideo = dto.withVideo === true;
    const pipeline: Record<string, string> = {};

    // Records the stage outcome and forwards it to the caller, so a queued run
    // can stream progress instead of going silent for minutes.
    const stage = (name: string, status: string) => {
      pipeline[name] = status;
      onStage(name, status);
    };

    // --- 1+2. Research and parse -------------------------------------------
    onStage('research', 'running');
    const brief = await this.researchService.research(dto.topic, brandContext);
    stage('research', brief.grounding === 'grounded' ? 'ok' : `degraded: ${brief.grounding}`);
    if (brief.note) pipeline.researchNote = brief.note;
    if (brief.readPages.length) pipeline.pagesRead = String(brief.readPages.length);

    // --- 3. Media prompt derived from the brief ----------------------------
    // A video post doesn't also need a still unless one is explicitly asked for —
    // otherwise every Instagram video would burn an extra image generation.
    const withImage = dto.withImage ?? (!wantsVideo && (dto.channel === PublishChannel.INSTAGRAM || isBlog));
    const needsMedia = withImage || wantsVideo;
    if (needsMedia) onStage('mediaPrompt', 'running');
    const mediaPrompt = needsMedia
      ? await this.researchService.buildMediaPrompt(brief, wantsVideo ? 'video' : 'image', brandContext)
      : '';
    if (needsMedia) stage('mediaPrompt', mediaPrompt ? 'ok' : 'failed');

    // --- 4. Media generation ------------------------------------------------
    let imageUrl: string | undefined;
    let videoUrl: string | undefined;
    let mediaBytes: string | null = null;
    let mediaMime = 'image/png';

    if (wantsVideo) {
      onStage('video', 'running');
      const video = await this.videoService.generateVideo(orgId, mediaPrompt);
      videoUrl = video.url ?? undefined;
      stage('video', video.url ? 'ok' : 'skipped');
      if (video.note) pipeline.videoNote = video.note;
    }
    if (withImage) {
      onStage('image', 'running');
      const img = await this.imageService.generateImage(orgId, mediaPrompt);
      imageUrl = img.url;
      mediaBytes = img.bytes;
      mediaMime = img.mimeType;
      stage('image', img.provider === 'placeholder' ? 'placeholder' : 'ok');
      if (img.note) pipeline.imageNote = img.note;
    }

    // --- 5. Vision: what did we actually get? ------------------------------
    if (needsMedia) onStage('vision', 'running');
    const analysis = needsMedia
      ? await this.visionService.analyze(mediaBytes, mediaMime, mediaPrompt)
      : null;
    if (analysis) {
      stage('vision', analysis.analyzed ? 'ok' : 'skipped');
      if (analysis.note) pipeline.visionNote = analysis.note;
    }

    // --- 6. Copy, written from the brief + the real picture ----------------
    onStage('copy', 'running');
    const generated = await this.writeCopy(dto, brandContext, brief, analysis, isBlog);
    stage('copy', generated.fromModel ? 'ok' : 'fallback');

    const item = await this.prisma.contentItem.create({
      data: {
        organizationId: orgId,
        agentId,
        channel: dto.channel,
        type: wantsVideo
          ? ContentType.REEL
          : isBlog
            ? ContentType.BLOG_POST
            : dto.channel === 'INSTAGRAM'
              ? ContentType.IMAGE_POST
              : ContentType.TEXT_POST,
        title: generated.title,
        caption: generated.caption,
        body: generated.body,
        imageUrl,
        imagePrompt: withImage ? mediaPrompt : undefined,
        videoUrl,
        videoPrompt: wantsVideo ? mediaPrompt : undefined,
        mediaAnalysis: analysis?.description,
        researchBrief: brief as unknown as object,
        sources: brief.sources,
        readPages: brief.readPages,
        pipeline,
        hashtags: generated.hashtags,
        status: dto.scheduledFor ? ContentStatus.SCHEDULED : ContentStatus.DRAFT,
        scheduledFor: dto.scheduledFor ? new Date(dto.scheduledFor) : undefined,
      },
    });
    this.emitUpdate(orgId, item);
    return item;
  }

  /**
   * Stage 6. The caption is written against the vision analysis, so it talks
   * about what is visible in the image rather than what the prompt asked for.
   */
  private async writeCopy(
    dto: GenerateContentDto,
    brandContext: string,
    brief: ResearchBrief,
    analysis: MediaAnalysis | null,
    isBlog: boolean,
  ): Promise<{ title?: string; caption?: string; body?: string; hashtags: string[]; fromModel: boolean }> {
    const briefBlock =
      `=== RESEARCH BRIEF ===\n` +
      `Topic: ${brief.topic}\nAngle: ${brief.angle}\nAudience: ${brief.audience}\n` +
      `Summary: ${brief.summary}\n` +
      (brief.facts.length ? `Facts:\n${brief.facts.map((f) => `- ${f}`).join('\n')}\n` : '') +
      (brief.keyPoints.length ? `Key points:\n${brief.keyPoints.map((p) => `- ${p}`).join('\n')}\n` : '') +
      (brief.grounding !== 'grounded'
        ? `NOTE: these findings are unverified — do NOT state statistics or specific claims as fact.\n`
        : '');

    const imageBlock = analysis
      ? `\n=== THE IMAGE ACCOMPANYING THIS POST ===\n` +
        `${analysis.description}\n` +
        (analysis.subjects.length ? `Visible: ${analysis.subjects.join(', ')}\n` : '') +
        (analysis.mood ? `Mood: ${analysis.mood}\n` : '') +
        (analysis.colors.length ? `Colours: ${analysis.colors.join(', ')}\n` : '') +
        (analysis.analyzed
          ? `Write copy that refers naturally to what is actually shown above.\n`
          : `NOTE: this describes the requested image, not a verified one — keep references to the visual general.\n`)
      : '';

    const prompt = isBlog
      ? `${brandContext}\n\n${briefBlock}${imageBlock}\n` +
        `Write a blog post built on the brief above.\n` +
        `Return ONLY valid JSON with keys: "title" (string), "body" (markdown, 400-700 words).`
      : `${brandContext}\n\n${briefBlock}${imageBlock}\n` +
        `Write a ${dto.channel} post built on the brief above.\n` +
        `Return ONLY valid JSON with keys: "caption" (string, engaging, matching the brand tone, ` +
        `${dto.channel === 'INSTAGRAM' ? 'max 2000 chars, with tasteful emoji' : 'professional, max 1300 chars'}), ` +
        `"hashtags" (array of 3-8 relevant hashtag strings starting with #).`;

    const raw = await this.generateText(prompt);
    if (raw) {
      try {
        const parsed = JSON.parse(raw.replace(/```json/gi, '').replace(/```/g, '').trim());
        return {
          title: parsed.title,
          caption: parsed.caption,
          body: parsed.body,
          hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : [],
          fromModel: true,
        };
      } catch {
        // Model replied with prose instead of JSON — still usable as the copy.
        return isBlog
          ? { title: brief.topic, body: raw, hashtags: [], fromModel: true }
          : { caption: raw, hashtags: [], fromModel: true };
      }
    }

    // When research also degraded, `summary` falls back to the topic itself —
    // joining them would print the same sentence twice.
    const summaryDiffers = brief.summary && brief.summary.trim() !== brief.topic.trim();
    return isBlog
      ? {
          title: brief.topic,
          body:
            `# ${brief.topic}\n\n` +
            (summaryDiffers ? `${brief.summary}\n\n` : '') +
            `_Draft placeholder — text generation was unavailable (check the pipeline field for the reason)._`,
          hashtags: [],
          fromModel: false,
        }
      : {
          caption: (summaryDiffers ? `${brief.topic} — ${brief.summary}` : brief.topic).slice(0, 500),
          hashtags: [],
          fromModel: false,
        };
  }

  // ---- CRUD / calendar ----

  async create(orgId: string, dto: CreateContentDto, agentId?: string) {
    const item = await this.prisma.contentItem.create({
      data: {
        organizationId: orgId,
        agentId,
        channel: dto.channel,
        type: dto.type,
        title: dto.title,
        caption: dto.caption,
        body: dto.body,
        imageUrl: dto.imageUrl,
        imagePrompt: dto.imagePrompt,
        videoUrl: dto.videoUrl,
        videoPrompt: dto.videoPrompt,
        hashtags: dto.hashtags || [],
        status: dto.scheduledFor ? ContentStatus.SCHEDULED : ContentStatus.DRAFT,
        scheduledFor: dto.scheduledFor ? new Date(dto.scheduledFor) : undefined,
      },
    });
    this.emitUpdate(orgId, item);
    return item;
  }

  async findAll(orgId: string, query: PaginationDto & { channel?: PublishChannel; status?: ContentStatus }) {
    const where: any = { organizationId: orgId };
    if (query.channel) where.channel = query.channel;
    if (query.status) where.status = query.status;
    const [items, total] = await Promise.all([
      this.prisma.contentItem.findMany({
        where,
        skip: query.skip,
        take: query.take,
        include: { agent: { select: { id: true, name: true, role: true } } },
        orderBy: { [query.sortBy || 'createdAt']: query.sortOrder || 'desc' },
      }),
      this.prisma.contentItem.count({ where }),
    ]);
    return paginate(items, total, query.page!, query.limit!);
  }

  async findOne(orgId: string, id: string) {
    const item = await this.prisma.contentItem.findFirst({
      where: { id, organizationId: orgId },
      include: { agent: { select: { id: true, name: true, role: true } } },
    });
    if (!item) throw new NotFoundException('Content item not found');
    return item;
  }

  async update(orgId: string, id: string, dto: UpdateContentDto) {
    await this.findOne(orgId, id);
    const item = await this.prisma.contentItem.update({
      where: { id },
      data: {
        ...dto,
        scheduledFor: dto.scheduledFor ? new Date(dto.scheduledFor) : undefined,
        status: dto.scheduledFor ? ContentStatus.SCHEDULED : undefined,
      },
    });
    this.emitUpdate(orgId, item);
    return item;
  }

  async cancel(orgId: string, id: string) {
    await this.findOne(orgId, id);
    const item = await this.prisma.contentItem.update({ where: { id }, data: { status: ContentStatus.CANCELLED } });
    this.emitUpdate(orgId, item);
    return item;
  }

  // ---- Publishing ----

  async publishNow(orgId: string, id: string) {
    const item = await this.findOne(orgId, id);
    return this.executePublish(item);
  }

  private async executePublish(item: any) {
    const gate = await this.settingsService.canPublish(item.organizationId, item.channel);
    if (!gate.allowed) {
      const updated = await this.prisma.contentItem.update({
        where: { id: item.id },
        data: { status: ContentStatus.FAILED, error: `Blocked: ${gate.reason}` },
      });
      this.emitUpdate(item.organizationId, updated);
      return updated;
    }

    await this.prisma.contentItem.update({
      where: { id: item.id },
      data: { status: ContentStatus.PUBLISHING, attempts: { increment: 1 } },
    });

    const result = await this.channelsService.publish({
      organizationId: item.organizationId,
      channel: item.channel,
      caption: item.caption,
      body: item.body,
      title: item.title,
      imageUrl: item.imageUrl,
      hashtags: item.hashtags,
    });

    const updated = await this.prisma.contentItem.update({
      where: { id: item.id },
      data: result.success
        ? { status: ContentStatus.PUBLISHED, publishedAt: new Date(), externalPostId: result.externalPostId, error: null }
        : {
            status: item.attempts + 1 >= MAX_PUBLISH_ATTEMPTS ? ContentStatus.FAILED : ContentStatus.SCHEDULED,
            error: result.error,
            // back off 15 minutes before retry
            scheduledFor: item.attempts + 1 >= MAX_PUBLISH_ATTEMPTS ? undefined : new Date(Date.now() + 15 * 60 * 1000),
          },
    });
    this.emitUpdate(item.organizationId, updated);
    return updated;
  }

  /**
   * Scheduler: publishes every due SCHEDULED item. Runs every minute.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async publishDueItems() {
    const due = await this.prisma.contentItem.findMany({
      where: { status: ContentStatus.SCHEDULED, scheduledFor: { lte: new Date() } },
      take: 10, // pacing: max 10 publishes per minute across all orgs
    });
    for (const item of due) {
      try {
        await this.executePublish(item);
      } catch (err: any) {
        this.logger.error(`Publish of ${item.id} threw: ${err.message}`);
      }
    }
  }

  // ---- Public blog ----

  async publicBlog(orgSlug: string) {
    const org = await this.prisma.organization.findUnique({ where: { slug: orgSlug } });
    if (!org) throw new NotFoundException('Organization not found');
    return this.prisma.contentItem.findMany({
      where: { organizationId: org.id, channel: PublishChannel.WEBSITE, status: ContentStatus.PUBLISHED },
      select: { id: true, title: true, body: true, imageUrl: true, publishedAt: true },
      orderBy: { publishedAt: 'desc' },
      take: 50,
    });
  }

  private emitUpdate(orgId: string, item: any) {
    try {
      this.gateway.server?.to(`org:${orgId}`).emit('content-update', {
        type: 'content-ready',
        id: item.id,
        channel: item.channel,
        contentType: item.type,
        status: item.status,
        title: item.title,
        caption: item.caption?.slice(0, 200),
        // Media URLs travel with the event so the dashboard can preview the
        // post the moment it exists, rather than only after a refetch.
        imageUrl: item.imageUrl,
        videoUrl: item.videoUrl,
        // Per-stage outcomes, so a degraded run (placeholder image, skipped
        // video, unverified research) is visible in the activity feed instead
        // of only discoverable by opening the record.
        pipeline: item.pipeline,
        scheduledFor: item.scheduledFor,
        publishedAt: item.publishedAt,
        error: item.error,
      });
    } catch {
      /* gateway not ready — non-fatal */
    }
  }
}
