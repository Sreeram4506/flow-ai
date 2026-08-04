import { Injectable, NotFoundException } from '@nestjs/common';
import { AgentRole, UserRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { DEFAULT_AGENT_DEFS } from './role-prompts';

export const AGENT_OPS_PROJECT_SLUG = 'ai-operations';

@Injectable()
export class AgentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Creates the CEO/CTO/Marketing agents for an org if they don't exist yet. */
  async ensureDefaultAgents(orgId: string) {
    const roles = Object.keys(DEFAULT_AGENT_DEFS) as AgentRole[];
    for (const role of roles) {
      const def = DEFAULT_AGENT_DEFS[role];
      const existing = await this.prisma.agent.findUnique({
        where: { organizationId_role: { organizationId: orgId, role } },
        select: { systemPromptCustomized: true },
      });

      await this.prisma.agent.upsert({
        where: { organizationId_role: { organizationId: orgId, role } },
        create: {
          organizationId: orgId,
          role,
          name: def.name,
          title: def.title,
          systemPrompt: def.systemPrompt,
          tools: def.tools,
        },
        update: {
          // Tool grants always track the platform.
          tools: def.tools,
          // The prompt tracks the platform too, unless a human has edited it.
          // Without this, an agent created before a tool existed keeps a prompt
          // that never mentions the tool -- it would be granted the capability
          // but never told to use it.
          ...(existing?.systemPromptCustomized ? {} : { systemPrompt: def.systemPrompt }),
        },
      });
    }
    return this.list(orgId);
  }

  async list(orgId: string) {
    return this.prisma.agent.findMany({
      where: { organizationId: orgId },
      include: { _count: { select: { runs: true, contentItems: true, tasks: true } } },
      orderBy: { role: 'asc' },
    });
  }

  async get(orgId: string, id: string) {
    const agent = await this.prisma.agent.findFirst({ where: { id, organizationId: orgId } });
    if (!agent) throw new NotFoundException('Agent not found');
    return agent;
  }

  async getByRole(orgId: string, role: AgentRole) {
    await this.ensureDefaultAgents(orgId);
    const agent = await this.prisma.agent.findUnique({
      where: { organizationId_role: { organizationId: orgId, role } },
    });
    if (!agent) throw new NotFoundException(`No ${role} agent`);
    return agent;
  }

  async update(orgId: string, id: string, data: { name?: string; systemPrompt?: string; isActive?: boolean }) {
    await this.get(orgId, id);
    return this.prisma.agent.update({
      where: { id },
      data: {
        ...data,
        // Editing the prompt opts this agent out of future platform prompt
        // updates, so a customization is never silently overwritten.
        ...(data.systemPrompt !== undefined ? { systemPromptCustomized: true } : {}),
      },
    });
  }

  async listRuns(orgId: string, limit = 30) {
    return this.prisma.agentRun.findMany({
      where: { organizationId: orgId },
      include: {
        agent: { select: { id: true, name: true, role: true } },
        actions: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
  }

  /** The org owner acts as the "creator" of agent-generated records that require a user. */
  async getOwnerUserId(orgId: string): Promise<string> {
    const owner = await this.prisma.organizationMember.findFirst({
      where: { organizationId: orgId, role: UserRole.OWNER },
    });
    if (owner) return owner.userId;
    const anyMember = await this.prisma.organizationMember.findFirst({ where: { organizationId: orgId } });
    if (!anyMember) throw new NotFoundException('Organization has no members');
    return anyMember.userId;
  }

  /** Find-or-create the "AI Operations" project that holds all agent tasks. */
  async getOpsProjectId(orgId: string): Promise<string> {
    const existing = await this.prisma.project.findUnique({
      where: { organizationId_slug: { organizationId: orgId, slug: AGENT_OPS_PROJECT_SLUG } },
    });
    if (existing) return existing.id;
    const ownerId = await this.getOwnerUserId(orgId);
    const project = await this.prisma.project.create({
      data: {
        organizationId: orgId,
        name: 'AI Operations',
        slug: AGENT_OPS_PROJECT_SLUG,
        description: 'Auto-created project where AI agents plan and track their daily work.',
        status: 'ACTIVE',
        createdById: ownerId,
      },
    });
    return project.id;
  }
}
