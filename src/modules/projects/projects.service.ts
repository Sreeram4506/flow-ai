import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateProjectDto, UpdateProjectDto, AddProjectMemberDto, CreateMilestoneDto } from './dto/project.dto';
import { PaginationDto } from '../../common/dto';
import { paginate, generateSlug } from '../../common/utils';
import { ProjectStatus } from '@prisma/client';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(orgId: string, userId: string, dto: CreateProjectDto) {
    const slug = generateSlug(dto.name) + '-' + Date.now().toString(36);
    return this.prisma.project.create({
      data: {
        ...dto,
        slug,
        organizationId: orgId,
        createdById: userId,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        deadline: dto.deadline ? new Date(dto.deadline) : undefined,
        budget: dto.budget,
        members: { create: { userId, role: 'lead' } },
      },
      include: { members: { include: { user: { select: { id: true, firstName: true, lastName: true, avatar: true } } } } },
    });
  }

  async findAll(orgId: string, query: PaginationDto & { status?: ProjectStatus; clientId?: string }) {
    const where: any = { organizationId: orgId };
    if (query.search) where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { description: { contains: query.search, mode: 'insensitive' } },
    ];
    if (query.status) where.status = query.status;
    if (query.clientId) where.clientId = query.clientId;

    const [projects, total] = await Promise.all([
      this.prisma.project.findMany({
        where, skip: query.skip, take: query.take,
        include: {
          client: { select: { id: true, companyName: true } },
          team: { select: { id: true, name: true } },
          members: { include: { user: { select: { id: true, firstName: true, lastName: true, avatar: true } } }, take: 5 },
          _count: { select: { tasks: true, milestones: true } },
        },
        orderBy: { [query.sortBy || 'createdAt']: query.sortOrder || 'desc' },
      }),
      this.prisma.project.count({ where }),
    ]);
    return paginate(projects, total, query.page!, query.limit!);
  }

  async findOne(orgId: string, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, organizationId: orgId },
      include: {
        client: true,
        team: { include: { members: { include: { user: { select: { id: true, firstName: true, lastName: true, avatar: true } } } } } },
        members: { include: { user: { select: { id: true, email: true, firstName: true, lastName: true, avatar: true } } } },
        milestones: { orderBy: { sortOrder: 'asc' }, include: { _count: { select: { tasks: true } } } },
        _count: { select: { tasks: true, documents: true, invoices: true, timeEntries: true } },
      },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  async update(orgId: string, id: string, dto: UpdateProjectDto) {
    await this.findOne(orgId, id);
    const data: any = { ...dto };
    if (dto.startDate) data.startDate = new Date(dto.startDate);
    if (dto.deadline) data.deadline = new Date(dto.deadline);
    if (dto.status === ProjectStatus.COMPLETED) data.completedAt = new Date();
    return this.prisma.project.update({ where: { id }, data });
  }

  async delete(orgId: string, id: string) {
    await this.findOne(orgId, id);
    await this.prisma.project.update({ where: { id }, data: { status: ProjectStatus.ARCHIVED } });
    return { message: 'Project archived' };
  }

  // ---- Members ----
  async addMember(orgId: string, projectId: string, dto: AddProjectMemberDto) {
    await this.findOne(orgId, projectId);
    const existing = await this.prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId: dto.userId } } });
    if (existing) throw new ConflictException('User is already a project member');
    return this.prisma.projectMember.create({ data: { projectId, userId: dto.userId, role: dto.role || 'member' } });
  }

  async removeMember(orgId: string, projectId: string, userId: string) {
    await this.findOne(orgId, projectId);
    await this.prisma.projectMember.deleteMany({ where: { projectId, userId } });
    return { message: 'Member removed' };
  }

  // ---- Milestones ----
  async addMilestone(orgId: string, projectId: string, dto: CreateMilestoneDto) {
    await this.findOne(orgId, projectId);
    const count = await this.prisma.milestone.count({ where: { projectId } });
    return this.prisma.milestone.create({
      data: { ...dto, dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined, projectId, sortOrder: count },
    });
  }

  async completeMilestone(orgId: string, projectId: string, milestoneId: string) {
    await this.findOne(orgId, projectId);
    return this.prisma.milestone.update({ where: { id: milestoneId }, data: { completedAt: new Date() } });
  }

  async deleteMilestone(orgId: string, projectId: string, milestoneId: string) {
    await this.findOne(orgId, projectId);
    await this.prisma.milestone.delete({ where: { id: milestoneId } });
    return { message: 'Milestone deleted' };
  }

  // ---- Stats ----
  async getProjectStats(orgId: string, id: string) {
    const [taskStats, timeTotal, budgetSpent] = await Promise.all([
      this.prisma.task.groupBy({ by: ['status'], where: { projectId: id, organizationId: orgId }, _count: true }),
      this.prisma.timeEntry.aggregate({ where: { projectId: id }, _sum: { duration: true } }),
      this.prisma.timeEntry.aggregate({ where: { projectId: id, isBillable: true }, _sum: { duration: true } }),
    ]);
    return { taskStats, totalTimeSeconds: timeTotal._sum.duration || 0, billableTimeSeconds: budgetSpent._sum.duration || 0 };
  }
}
