// ================ ANALYTICS MODULE ================
import { Module, Injectable, Controller, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Get, Query } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { OrgId } from '../../common/decorators';
import { TenantGuard } from '../../common/guards';
import { ProjectStatus, InvoiceStatus, PaymentStatus, ExpenseStatus, TaskStatus, LeadStage } from '@prisma/client';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(orgId: string) {
    const [
      totalRevenue, pendingPayments, activeProjects, completedProjects,
      totalClients, totalTasks, completedTasks, totalExpenses,
      recentInvoices, recentProjects, upcomingDeadlines,
    ] = await Promise.all([
      this.prisma.payment.aggregate({ where: { organizationId: orgId, status: PaymentStatus.PAID }, _sum: { amount: true } }),
      this.prisma.invoice.aggregate({ where: { organizationId: orgId, status: { in: [InvoiceStatus.SENT, InvoiceStatus.VIEWED, InvoiceStatus.OVERDUE] } }, _sum: { amountDue: true } }),
      this.prisma.project.count({ where: { organizationId: orgId, status: ProjectStatus.ACTIVE } }),
      this.prisma.project.count({ where: { organizationId: orgId, status: ProjectStatus.COMPLETED } }),
      this.prisma.client.count({ where: { organizationId: orgId, isActive: true } }),
      this.prisma.task.count({ where: { organizationId: orgId } }),
      this.prisma.task.count({ where: { organizationId: orgId, status: TaskStatus.DONE } }),
      this.prisma.expense.aggregate({ where: { organizationId: orgId, status: ExpenseStatus.APPROVED }, _sum: { amount: true } }),
      this.prisma.invoice.findMany({ where: { organizationId: orgId }, take: 5, orderBy: { createdAt: 'desc' }, select: { id: true, invoiceNumber: true, status: true, total: true, clientId: true, client: { select: { companyName: true } } } }),
      this.prisma.project.findMany({ where: { organizationId: orgId, status: ProjectStatus.ACTIVE }, take: 5, orderBy: { updatedAt: 'desc' }, select: { id: true, name: true, status: true, progress: true, deadline: true } }),
      this.prisma.task.findMany({ where: { organizationId: orgId, dueDate: { gte: new Date(), lte: new Date(Date.now() + 7 * 86400000) }, status: { not: TaskStatus.DONE } }, take: 10, orderBy: { dueDate: 'asc' }, select: { id: true, title: true, dueDate: true, priority: true, assignee: { select: { firstName: true, lastName: true } } } }),
    ]);

    const revenue = Number(totalRevenue._sum.amount || 0);
    const expenses = Number(totalExpenses._sum.amount || 0);

    // ---- Compute period-over-period trends ----
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [currentMonthRevenue, previousMonthRevenue, currentMonthExpenses, previousMonthExpenses] = await Promise.all([
      this.prisma.payment.aggregate({ where: { organizationId: orgId, status: PaymentStatus.PAID, paidAt: { gte: currentMonthStart } }, _sum: { amount: true } }),
      this.prisma.payment.aggregate({ where: { organizationId: orgId, status: PaymentStatus.PAID, paidAt: { gte: previousMonthStart, lt: currentMonthStart } }, _sum: { amount: true } }),
      this.prisma.expense.aggregate({ where: { organizationId: orgId, status: ExpenseStatus.APPROVED, date: { gte: currentMonthStart } }, _sum: { amount: true } }),
      this.prisma.expense.aggregate({ where: { organizationId: orgId, status: ExpenseStatus.APPROVED, date: { gte: previousMonthStart, lt: currentMonthStart } }, _sum: { amount: true } }),
    ]);

    const curRev = Number(currentMonthRevenue._sum.amount || 0);
    const prevRev = Number(previousMonthRevenue._sum.amount || 0);
    const curExp = Number(currentMonthExpenses._sum.amount || 0);
    const prevExp = Number(previousMonthExpenses._sum.amount || 0);

    const computeChange = (current: number, previous: number): string => {
      if (previous === 0 && current === 0) return 'Flat';
      if (previous === 0) return '+100%';
      const pct = ((current - previous) / previous) * 100;
      const sign = pct >= 0 ? '+' : '';
      return `${sign}${pct.toFixed(1)}%`;
    };

    const revenueChange = computeChange(curRev, prevRev);
    const expensesChange = computeChange(curExp, prevExp);
    const curProfit = curRev - curExp;
    const prevProfit = prevRev - prevExp;
    const profitChange = computeChange(curProfit, prevProfit);

    // ---- AI Insight generation ----
    let aiInsightText = "All operations are running smoothly. Your billing utilization is optimal.";
    let worstProject = null;
    let title = "Operations Healthy";
    let confidence = "High Confidence";

    if (recentProjects.length > 0) {
      const activeProjs = recentProjects.filter(p => p.status === ProjectStatus.ACTIVE);
      if (activeProjs.length > 0) {
        const sorted = [...activeProjs].sort((a, b) => a.progress - b.progress);
        worstProject = sorted[0];
      }
    }

    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 100;

    if (worstProject && worstProject.progress < 50) {
      title = "Project Delay Risk Alert";
      aiInsightText = `Analysis suggests "${worstProject.name}" has high risk of delay with current progress at ${worstProject.progress}%. Consider allocating more resources or review dependencies.`;
      confidence = "Medium Confidence";
    } else if (completionRate < 50) {
      title = "Task Backlog Warning";
      aiInsightText = `Your overall task completion rate is low (${completionRate}%). Focus on clearing the pending backlog of ${totalTasks - completedTasks} tasks to stay on track.`;
      confidence = "Medium Confidence";
    } else {
      aiInsightText = `Excellent progress! Overall task completion rate is at ${completionRate}%. Keep up the momentum across your ${activeProjects} active projects.`;
    }

    return {
      revenue,
      expenses,
      profit: revenue - expenses,
      revenueChange,
      expensesChange,
      profitChange,
      pendingPayments: Number(pendingPayments._sum.amountDue || 0),
      activeProjects,
      completedProjects,
      totalClients,
      totalTasks,
      completedTasks,
      taskCompletionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      recentInvoices,
      recentProjects,
      upcomingDeadlines,
      aiInsight: {
        title,
        message: aiInsightText,
        confidence,
      },
    };
  }

  async getRevenueChart(orgId: string, months: number = 12) {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const payments = await this.prisma.payment.findMany({
      where: { organizationId: orgId, status: PaymentStatus.PAID, paidAt: { gte: startDate } },
      select: { amount: true, paidAt: true },
    });

    const monthlyRevenue: Record<string, number> = {};
    for (let i = 0; i < months; i++) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlyRevenue[key] = 0;
    }

    payments.forEach((p) => {
      if (p.paidAt) {
        const key = `${p.paidAt.getFullYear()}-${String(p.paidAt.getMonth() + 1).padStart(2, '0')}`;
        if (monthlyRevenue[key] !== undefined) monthlyRevenue[key] += Number(p.amount);
      }
    });

    return Object.entries(monthlyRevenue).sort().map(([month, amount]) => ({ month, amount }));
  }

  async getProjectStats(orgId: string) {
    const statuses = Object.values(ProjectStatus);
    const counts = await Promise.all(statuses.map((s) => this.prisma.project.count({ where: { organizationId: orgId, status: s } })));
    return statuses.map((status, i) => ({ status, count: counts[i] }));
  }

  async getLeadConversion(orgId: string) {
    const stages = Object.values(LeadStage);
    const counts = await Promise.all(stages.map((s) => this.prisma.lead.count({ where: { organizationId: orgId, stage: s } })));
    return stages.map((stage, i) => ({ stage, count: counts[i] }));
  }

  async getEmployeeProductivity(orgId: string) {
    const members = await this.prisma.organizationMember.findMany({
      where: { organizationId: orgId, status: 'ACTIVE' },
      include: { user: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
    });

    const productivity = await Promise.all(members.map(async (m) => {
      const [tasksCompleted, totalTime] = await Promise.all([
        this.prisma.task.count({ where: { organizationId: orgId, assigneeId: m.userId, status: TaskStatus.DONE } }),
        this.prisma.timeEntry.aggregate({ where: { userId: m.userId }, _sum: { duration: true } }),
      ]);
      return { user: m.user, tasksCompleted, totalHours: Math.round(((totalTime._sum.duration || 0) / 3600) * 100) / 100 };
    }));

    return productivity.sort((a, b) => b.tasksCompleted - a.tasksCompleted);
  }
}

@ApiTags('Analytics') @ApiBearerAuth()
@UseGuards(TenantGuard)
@Controller('api/analytics')
export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

  @Get('dashboard') @ApiOperation({ summary: 'Get executive dashboard data' })
  getDashboard(@OrgId() orgId: string) { return this.service.getDashboard(orgId); }

  @Get('revenue') @ApiOperation({ summary: 'Get revenue chart data' })
  getRevenue(@OrgId() orgId: string, @Query('months') months?: number) { return this.service.getRevenueChart(orgId, months || 12); }

  @Get('projects') @ApiOperation({ summary: 'Get project stats' })
  getProjects(@OrgId() orgId: string) { return this.service.getProjectStats(orgId); }

  @Get('leads') @ApiOperation({ summary: 'Get lead conversion stats' })
  getLeads(@OrgId() orgId: string) { return this.service.getLeadConversion(orgId); }

  @Get('productivity') @ApiOperation({ summary: 'Get employee productivity' })
  getProductivity(@OrgId() orgId: string) { return this.service.getEmployeeProductivity(orgId); }
}

@Module({ controllers: [AnalyticsController], providers: [AnalyticsService], exports: [AnalyticsService] })
export class AnalyticsModule {}
