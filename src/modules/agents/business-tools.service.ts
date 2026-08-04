import { Injectable } from '@nestjs/common';
import { LeadSource, LeadStage, ProjectStatus, TaskStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { generateSlug } from '../../common/utils';
import { AgentsService } from './agents.service';

/**
 * Gives agents operational hands on every Flow module:
 * CRM clients, leads pipeline, projects, tasks, finance (read-only), and notifications.
 * All writes are attributed to the org owner and scoped by organizationId.
 * Finance is intentionally READ-ONLY for agents — creating invoices/payments stays human.
 */
@Injectable()
export class BusinessToolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agentsService: AgentsService,
  ) {}

  // ---------- Overview ----------

  async businessSnapshot(orgId: string) {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [clients, leadsByStage, projectsByStatus, openTasks, unpaidInvoices, revenueThisMonth, expensesThisMonth] =
      await Promise.all([
        this.prisma.client.count({ where: { organizationId: orgId, isActive: true } }),
        this.prisma.lead.groupBy({ by: ['stage'], where: { organizationId: orgId }, _count: true }),
        this.prisma.project.groupBy({ by: ['status'], where: { organizationId: orgId }, _count: true }),
        this.prisma.task.count({
          where: { organizationId: orgId, status: { in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS] } },
        }),
        this.prisma.invoice.aggregate({
          where: { organizationId: orgId, status: { in: ['SENT', 'OVERDUE', 'PARTIAL'] as any } },
          _sum: { amountDue: true },
          _count: true,
        }),
        this.prisma.payment.aggregate({
          where: { organizationId: orgId, status: 'PAID' as any, createdAt: { gte: monthStart } },
          _sum: { amount: true },
        }),
        this.prisma.expense.aggregate({
          where: { organizationId: orgId, date: { gte: monthStart } },
          _sum: { amount: true },
        }),
      ]);

    return {
      activeClients: clients,
      leadsByStage: Object.fromEntries(leadsByStage.map((l) => [l.stage, l._count])),
      projectsByStatus: Object.fromEntries(projectsByStatus.map((p) => [p.status, p._count])),
      openTasks,
      outstandingInvoices: { count: unpaidInvoices._count, amountDue: unpaidInvoices._sum.amountDue || 0 },
      revenueThisMonth: revenueThisMonth._sum.amount || 0,
      expensesThisMonth: expensesThisMonth._sum.amount || 0,
    };
  }

  // ---------- CRM: Clients ----------

  async listClients(orgId: string, search?: string) {
    return this.prisma.client.findMany({
      where: {
        organizationId: orgId,
        isActive: true,
        ...(search ? { companyName: { contains: search, mode: 'insensitive' as any } } : {}),
      },
      select: { id: true, companyName: true, contactPerson: true, email: true, phone: true, notes: true },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });
  }

  async createClient(orgId: string, data: { companyName: string; contactPerson?: string; email?: string; phone?: string; notes?: string }) {
    if (!data.companyName) return { error: 'companyName is required' };
    const ownerId = await this.agentsService.getOwnerUserId(orgId);
    const client = await this.prisma.client.create({
      data: { organizationId: orgId, createdById: ownerId, ...data },
    });
    return { clientId: client.id, companyName: client.companyName };
  }

  async updateClient(orgId: string, clientId: string, data: { contactPerson?: string; email?: string; phone?: string; notes?: string }) {
    const client = await this.prisma.client.findFirst({ where: { id: clientId, organizationId: orgId } });
    if (!client) return { error: 'Client not found' };
    await this.prisma.client.update({ where: { id: clientId }, data });
    return { clientId, updated: Object.keys(data) };
  }

  // ---------- CRM: Leads ----------

  async listLeads(orgId: string, stage?: string) {
    return this.prisma.lead.findMany({
      where: { organizationId: orgId, ...(stage ? { stage: stage as LeadStage } : {}) },
      select: { id: true, companyName: true, contactName: true, email: true, stage: true, value: true, probability: true, notes: true, expectedCloseDate: true },
      orderBy: { updatedAt: 'desc' },
      take: 25,
    });
  }

  async createLead(
    orgId: string,
    data: { companyName: string; contactName: string; email?: string; phone?: string; source?: string; value?: number; notes?: string },
  ) {
    if (!data.companyName || !data.contactName) return { error: 'companyName and contactName are required' };
    const ownerId = await this.agentsService.getOwnerUserId(orgId);
    const lead = await this.prisma.lead.create({
      data: {
        organizationId: orgId,
        createdById: ownerId,
        companyName: data.companyName,
        contactName: data.contactName,
        email: data.email,
        phone: data.phone,
        source: (Object.values(LeadSource) as string[]).includes(data.source || '') ? (data.source as LeadSource) : LeadSource.OTHER,
        value: data.value,
        notes: data.notes,
      },
    });
    return { leadId: lead.id, companyName: lead.companyName, stage: lead.stage };
  }

  async updateLead(orgId: string, leadId: string, data: { stage?: string; notes?: string; value?: number; probability?: number; lostReason?: string }) {
    const lead = await this.prisma.lead.findFirst({ where: { id: leadId, organizationId: orgId } });
    if (!lead) return { error: 'Lead not found' };
    const stage = data.stage && (Object.values(LeadStage) as string[]).includes(data.stage) ? (data.stage as LeadStage) : undefined;
    const updated = await this.prisma.lead.update({
      where: { id: leadId },
      data: {
        stage,
        notes: data.notes,
        value: data.value,
        probability: data.probability,
        lostReason: data.lostReason,
        closedAt: stage === LeadStage.WON || stage === LeadStage.LOST ? new Date() : undefined,
      },
    });
    return { leadId, stage: updated.stage, value: updated.value };
  }

  // ---------- Projects ----------

  async listProjects(orgId: string, status?: string) {
    return this.prisma.project.findMany({
      where: { organizationId: orgId, ...(status ? { status: status as ProjectStatus } : {}) },
      select: {
        id: true, name: true, status: true, priority: true, progress: true, deadline: true, budget: true,
        client: { select: { companyName: true } },
        _count: { select: { tasks: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });
  }

  async createProject(orgId: string, data: { name: string; description?: string; clientId?: string; deadline?: string; budget?: number }) {
    if (!data.name) return { error: 'name is required' };
    const ownerId = await this.agentsService.getOwnerUserId(orgId);
    let slug = generateSlug(data.name);
    const existing = await this.prisma.project.findUnique({ where: { organizationId_slug: { organizationId: orgId, slug } } });
    if (existing) slug = `${slug}-${Date.now().toString(36)}`;
    const project = await this.prisma.project.create({
      data: {
        organizationId: orgId,
        createdById: ownerId,
        name: data.name,
        slug,
        description: data.description,
        clientId: data.clientId,
        deadline: data.deadline ? new Date(data.deadline) : undefined,
        budget: data.budget,
        status: ProjectStatus.PLANNING,
      },
    });
    return { projectId: project.id, name: project.name, slug: project.slug };
  }

  async updateProject(orgId: string, projectId: string, data: { status?: string; progress?: number; description?: string; deadline?: string }) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, organizationId: orgId } });
    if (!project) return { error: 'Project not found' };
    const updated = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        status: data.status && (Object.values(ProjectStatus) as string[]).includes(data.status) ? (data.status as ProjectStatus) : undefined,
        progress: typeof data.progress === 'number' ? Math.max(0, Math.min(100, data.progress)) : undefined,
        description: data.description,
        deadline: data.deadline ? new Date(data.deadline) : undefined,
        completedAt: data.status === 'COMPLETED' ? new Date() : undefined,
      },
    });
    return { projectId, status: updated.status, progress: updated.progress };
  }

  // ---------- Tasks (any project, not just AI Operations) ----------

  async listProjectTasks(orgId: string, projectId?: string, status?: string) {
    return this.prisma.task.findMany({
      where: {
        organizationId: orgId,
        ...(projectId ? { projectId } : {}),
        ...(status ? { status: status as TaskStatus } : {}),
      },
      select: {
        id: true, title: true, status: true, priority: true, dueDate: true,
        project: { select: { id: true, name: true } },
        assignee: { select: { firstName: true, lastName: true } },
        assigneeAgent: { select: { name: true, role: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 25,
    });
  }

  async createProjectTask(
    orgId: string,
    data: { projectId: string; title: string; description?: string; priority?: string; dueDate?: string },
  ) {
    if (!data.projectId || !data.title) return { error: 'projectId and title are required' };
    const project = await this.prisma.project.findFirst({ where: { id: data.projectId, organizationId: orgId } });
    if (!project) return { error: 'Project not found' };
    const ownerId = await this.agentsService.getOwnerUserId(orgId);
    const count = await this.prisma.task.count({ where: { projectId: data.projectId } });
    const task = await this.prisma.task.create({
      data: {
        organizationId: orgId,
        projectId: data.projectId,
        createdById: ownerId,
        title: data.title,
        description: data.description,
        priority: (['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(data.priority || '') ? data.priority : 'MEDIUM') as any,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        origin: 'AGENT',
        position: count,
      },
    });
    return { taskId: task.id, title: task.title, project: project.name };
  }

  async updateTaskStatus(orgId: string, taskId: string, status: string) {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, organizationId: orgId } });
    if (!task) return { error: 'Task not found' };
    if (!(Object.values(TaskStatus) as string[]).includes(status)) return { error: `Invalid status: ${status}` };
    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: { status: status as TaskStatus, completedAt: status === 'DONE' ? new Date() : undefined },
    });
    return { taskId, status: updated.status };
  }

  // ---------- Finance (READ-ONLY for agents) ----------

  async financeSummary(orgId: string) {
    const [invoices, overdue, quotations, expenses] = await Promise.all([
      this.prisma.invoice.groupBy({ by: ['status'], where: { organizationId: orgId }, _count: true, _sum: { total: true } }),
      this.prisma.invoice.findMany({
        where: { organizationId: orgId, status: 'OVERDUE' as any },
        select: { invoiceNumber: true, amountDue: true, dueDate: true, client: { select: { companyName: true } } },
        take: 10,
      }),
      this.prisma.quotation.groupBy({ by: ['status'], where: { organizationId: orgId }, _count: true }),
      this.prisma.expense.aggregate({ where: { organizationId: orgId }, _sum: { amount: true }, _count: true }),
    ]);
    return {
      invoicesByStatus: invoices.map((i) => ({ status: i.status, count: i._count, total: i._sum.total || 0 })),
      overdueInvoices: overdue,
      quotationsByStatus: Object.fromEntries(quotations.map((q) => [q.status, q._count])),
      totalExpenses: { count: expenses._count, amount: expenses._sum.amount || 0 },
      note: 'Finance is read-only for agents. Creating invoices/payments requires a human.',
    };
  }

  // ---------- Notifications ----------

  async notifyOwner(orgId: string, agentName: string, title: string, message: string) {
    if (!title || !message) return { error: 'title and message are required' };
    const ownerId = await this.agentsService.getOwnerUserId(orgId);
    const notification = await this.prisma.notification.create({
      data: {
        organizationId: orgId,
        userId: ownerId,
        type: 'SYSTEM',
        title: `[${agentName}] ${title}`,
        message,
      },
    });
    return { notificationId: notification.id, delivered: true };
  }
}
