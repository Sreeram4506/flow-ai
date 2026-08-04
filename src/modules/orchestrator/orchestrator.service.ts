import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AgentRole, EmailStatus, PublishChannel, TaskStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AgentsService } from '../agents/agents.service';
import { AgentExecutorService } from '../agents/agent-executor.service';
import { AgentSettingsService } from '../agent-settings/agent-settings.service';
import { ChannelsService } from '../channels/channels.service';
import { EventsGateway } from '../../gateway/events.gateway';

@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentsService: AgentsService,
    private readonly executor: AgentExecutorService,
    private readonly settingsService: AgentSettingsService,
    private readonly channelsService: ChannelsService,
    private readonly gateway: EventsGateway,
  ) {}

  // ================= HUMAN DIRECTIVES =================

  /**
   * The owner gives an agent work directly: "Plan a product-launch campaign",
   * "Post about our new feature on Instagram tomorrow", etc.
   * Creates a tracked task in the AI Operations project; the agent either runs
   * immediately (runNow) or is picked up by the worker within 2 minutes.
   */
  async createDirective(
    orgId: string,
    dto: {
      instruction: string;
      assigneeRole: AgentRole;
      title?: string;
      priority?: string;
      dueDate?: string;
      runNow?: boolean;
    },
  ) {
    if (!dto.instruction?.trim()) throw new NotFoundException('Instruction is required');
    const role = dto.assigneeRole || AgentRole.CEO;
    const [agent, projectId, ownerId] = await Promise.all([
      this.agentsService.getByRole(orgId, role),
      this.agentsService.getOpsProjectId(orgId),
      this.agentsService.getOwnerUserId(orgId),
    ]);
    const count = await this.prisma.task.count({ where: { projectId } });
    const task = await this.prisma.task.create({
      data: {
        organizationId: orgId,
        projectId,
        title: dto.title || dto.instruction.slice(0, 90),
        description: dto.instruction,
        priority: (['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(dto.priority || '') ? dto.priority : 'MEDIUM') as any,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        assigneeAgentId: agent.id,
        origin: 'AGENT',
        createdById: ownerId,
        position: count,
      },
    });
    this.gateway.server?.to(`org:${orgId}`).emit('agent-activity', {
      type: 'task-created',
      agent: 'You',
      taskId: task.id,
      title: task.title,
      assignedTo: agent.name,
      at: new Date().toISOString(),
    });

    if (dto.runNow) {
      await this.prisma.task.update({ where: { id: task.id }, data: { status: TaskStatus.IN_PROGRESS } });
      const instruction =
        `The human owner assigned you this task directly (taskId: "${task.id}"):\n` +
        `Title: ${task.title}\nInstructions: ${task.description}\n` +
        `Complete the work using your tools, then call complete_task with this taskId before finishing.`;
      const result = await this.executor.runAgent(orgId, agent, 'manual', instruction);
      const fresh = await this.prisma.task.findUnique({ where: { id: task.id } });
      if (fresh && fresh.status === TaskStatus.IN_PROGRESS) {
        await this.prisma.task.update({
          where: { id: task.id },
          data: { status: result.output.startsWith('Failed') ? TaskStatus.TODO : TaskStatus.IN_REVIEW },
        });
      }
      return { task, run: result };
    }
    return { task, note: `Queued — ${agent.name} will pick this up within 2 minutes` };
  }

  /** All agent tasks (directives + CEO-delegated) with live status. */
  async listDirectives(orgId: string) {
    const projectId = await this.agentsService.getOpsProjectId(orgId);
    return this.prisma.task.findMany({
      where: { projectId },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        dueDate: true,
        completedAt: true,
        createdAt: true,
        assigneeAgent: { select: { id: true, name: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  // ================= DAILY PLANNING (CEO) =================

  /** Hourly check: any org whose plan hour has arrived gets a CEO planning run. */
  @Cron(CronExpression.EVERY_HOUR)
  async dailyPlanningTick() {
    const currentHour = new Date().getHours();
    const settingsList = await this.prisma.agentSettings.findMany({
      where: { killSwitch: false, autonomyEnabled: true, dailyPlanHour: currentHour },
    });
    for (const settings of settingsList) {
      const alreadyRan = await this.hasPlannedToday(settings.organizationId);
      if (!alreadyRan) {
        this.logger.log(`Starting daily plan for org ${settings.organizationId}`);
        await this.runDailyPlan(settings.organizationId).catch((err) =>
          this.logger.error(`Daily plan failed for ${settings.organizationId}: ${err.message}`),
        );
      }
    }
  }

  private async hasPlannedToday(orgId: string): Promise<boolean> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const ceo = await this.agentsService.getByRole(orgId, AgentRole.CEO).catch(() => null);
    if (!ceo) return true;
    const run = await this.prisma.agentRun.findFirst({
      where: { organizationId: orgId, agentId: ceo.id, trigger: 'cron', startedAt: { gte: startOfDay } },
    });
    return !!run;
  }

  async runDailyPlan(orgId: string, trigger = 'cron') {
    const ceo = await this.agentsService.getByRole(orgId, AgentRole.CEO);
    const briefing = await this.buildDailyBriefing(orgId);
    const instruction =
      `It is a new working day. Review the briefing below, then create today's plan by delegating tasks ` +
      `to the MARKETING and CTO agents with create_task. Typical day: one Instagram post, one LinkedIn post ` +
      `(if connected), blog/website work if due, and channel-health verification. Then finish with a summary.\n\n` +
      `=== DAILY BRIEFING ===\n${briefing}`;
    return this.executor.runAgent(orgId, ceo, trigger, instruction);
  }

  private async buildDailyBriefing(orgId: string): Promise<string> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [recentContent, openTasks, channelHealth] = await Promise.all([
      this.prisma.contentItem.findMany({
        where: { organizationId: orgId, createdAt: { gte: since } },
        select: { channel: true, status: true, title: true, caption: true, error: true },
        take: 20,
      }),
      this.prisma.task.findMany({
        where: { organizationId: orgId, origin: 'AGENT', status: { in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS] } },
        select: { title: true, status: true, assigneeAgent: { select: { role: true } } },
        take: 20,
      }),
      this.channelsService.healthCheck(orgId).catch(() => []),
    ]);

    return [
      `Last 24h content (${recentContent.length}): ${recentContent.map((c) => `[${c.channel}/${c.status}] ${c.title || c.caption?.slice(0, 60) || ''}${c.error ? ` (ERROR: ${c.error})` : ''}`).join('; ') || 'none'}`,
      `Open agent tasks (${openTasks.length}): ${openTasks.map((t) => `[${t.assigneeAgent?.role || 'unassigned'}/${t.status}] ${t.title}`).join('; ') || 'none'}`,
      `Channel health: ${channelHealth.map((h) => `${h.channel}: ${h.connected ? 'OK' : `DOWN (${h.detail})`}`).join('; ') || 'unknown'}`,
    ].join('\n');
  }

  // ================= AGENT TASK WORKER =================

  /** Every 2 minutes: pick up TODO tasks assigned to agents and run them. */
  @Cron('*/2 * * * *')
  async processAgentTasks() {
    const tasks = await this.prisma.task.findMany({
      where: { origin: 'AGENT', status: TaskStatus.TODO, assigneeAgentId: { not: null } },
      include: { assigneeAgent: true },
      orderBy: { createdAt: 'asc' },
      take: 2, // pacing: max 2 agent task runs per tick
    });

    for (const task of tasks) {
      if (!task.assigneeAgent) continue;
      if (await this.settingsService.isHalted(task.organizationId)) continue;

      await this.prisma.task.update({ where: { id: task.id }, data: { status: TaskStatus.IN_PROGRESS } });
      const instruction =
        `You have been assigned this task (taskId: "${task.id}"):\n` +
        `Title: ${task.title}\nDescription: ${task.description || '(none)'}\n` +
        `Complete the work using your tools, then call complete_task with this taskId before finishing.`;

      const result = await this.executor.runAgent(task.organizationId, task.assigneeAgent, 'task', instruction);

      // If the agent didn't mark it done itself, move it back for review
      const fresh = await this.prisma.task.findUnique({ where: { id: task.id } });
      if (fresh && fresh.status === TaskStatus.IN_PROGRESS) {
        await this.prisma.task.update({
          where: { id: task.id },
          data: { status: result.output.startsWith('Failed') ? TaskStatus.TODO : TaskStatus.IN_REVIEW },
        });
      }
    }
  }

  // ================= EMAIL PIPELINE =================

  /** Inbound email (from a webhook or manual entry) → CEO triage. */
  async handleInboundEmail(orgId: string, dto: { from: string; to?: string; subject?: string; body: string }) {
    const email = await this.prisma.emailMessage.create({
      data: {
        organizationId: orgId,
        direction: 'INBOUND',
        status: EmailStatus.RECEIVED,
        fromAddress: dto.from,
        toAddress: dto.to || 'inbox',
        subject: dto.subject,
        bodyText: dto.body,
      },
    });

    const ceo = await this.agentsService.getByRole(orgId, AgentRole.CEO);
    const instruction =
      `An email arrived (emailId: "${email.id}"):\nFrom: ${dto.from}\nSubject: ${dto.subject || '(none)'}\n` +
      `Body:\n${dto.body.slice(0, 3000)}\n\n` +
      `Decide whether it needs a reply. If yes, use draft_email (set replyToEmailId to "${email.id}", ` +
      `and write in the company voice using the brand context). If it's spam or needs no action, just finish with your reasoning.`;

    const run = await this.executor.runAgent(orgId, ceo, 'email', instruction);
    await this.prisma.emailMessage.update({ where: { id: email.id }, data: { status: EmailStatus.TRIAGED } });
    return { emailId: email.id, triage: run.output };
  }

  /** Every minute: send QUEUED emails whose hold-buffer expired. */
  @Cron(CronExpression.EVERY_MINUTE)
  async sendQueuedEmails() {
    const due = await this.prisma.emailMessage.findMany({
      where: { direction: 'OUTBOUND', status: EmailStatus.QUEUED, holdUntil: { lte: new Date() } },
      take: 10,
    });
    for (const email of due) {
      if (await this.settingsService.isChannelPaused(email.organizationId, PublishChannel.EMAIL)) continue;
      const result = await this.channelsService.publish({
        organizationId: email.organizationId,
        channel: PublishChannel.EMAIL,
        toAddress: email.toAddress,
        subject: email.subject || undefined,
        body: email.bodyText,
      });
      await this.prisma.emailMessage.update({
        where: { id: email.id },
        data: result.success
          ? { status: EmailStatus.SENT, sentAt: new Date() }
          : { status: EmailStatus.FAILED, error: result.error },
      });
      this.gateway.server?.to(`org:${email.organizationId}`).emit('agent-activity', {
        type: result.success ? 'email-sent' : 'email-failed',
        emailId: email.id,
        to: email.toAddress,
        subject: email.subject,
        error: result.error,
        at: new Date().toISOString(),
      });
    }
  }

  async listEmails(orgId: string) {
    return this.prisma.emailMessage.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /** Approve a drafted email → queue it (with hold-buffer) for sending. */
  async approveEmail(orgId: string, emailId: string) {
    const email = await this.prisma.emailMessage.findFirst({ where: { id: emailId, organizationId: orgId } });
    if (!email) throw new NotFoundException('Email not found');
    const settings = await this.settingsService.get(orgId);
    return this.prisma.emailMessage.update({
      where: { id: emailId },
      data: { status: EmailStatus.QUEUED, holdUntil: new Date(Date.now() + settings.emailHoldMinutes * 60 * 1000) },
    });
  }

  async cancelEmail(orgId: string, emailId: string) {
    const email = await this.prisma.emailMessage.findFirst({ where: { id: emailId, organizationId: orgId } });
    if (!email) throw new NotFoundException('Email not found');
    if (email.status === EmailStatus.SENT) return email; // too late
    return this.prisma.emailMessage.update({ where: { id: emailId }, data: { status: EmailStatus.CANCELLED } });
  }
}
