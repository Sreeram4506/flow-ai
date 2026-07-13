import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateTaskDto, UpdateTaskDto, CreateTaskCommentDto, CreateChecklistItemDto, CreateTaskDependencyDto, BulkUpdateTasksDto } from './dto/task.dto';
import { PaginationDto } from '../../common/dto';
import { paginate } from '../../common/utils';
import { TaskStatus } from '@prisma/client';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(orgId: string, userId: string, dto: CreateTaskDto) {
    const count = await this.prisma.task.count({ where: { projectId: dto.projectId } });
    return this.prisma.task.create({
      data: {
        title: dto.title,
        description: dto.description,
        organizationId: orgId,
        projectId: dto.projectId,
        milestoneId: dto.milestoneId,
        parentTaskId: dto.parentTaskId,
        assigneeId: dto.assigneeId,
        createdById: userId,
        status: dto.status,
        priority: dto.priority,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        estimatedHours: dto.estimatedHours,
        position: count,
      },
      include: { assignee: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
    });
  }

  async findAll(orgId: string, query: PaginationDto & { projectId?: string; status?: TaskStatus; assigneeId?: string }) {
    const where: any = { organizationId: orgId };
    if (query.search) where.OR = [
      { title: { contains: query.search, mode: 'insensitive' } },
      { description: { contains: query.search, mode: 'insensitive' } },
    ];
    if (query.projectId) where.projectId = query.projectId;
    if (query.status) where.status = query.status;
    if (query.assigneeId) where.assigneeId = query.assigneeId;

    const [tasks, total] = await Promise.all([
      this.prisma.task.findMany({
        where, skip: query.skip, take: query.take,
        include: {
          assignee: { select: { id: true, firstName: true, lastName: true, avatar: true } },
          project: { select: { id: true, name: true } },
          labels: { include: { label: true } },
          _count: { select: { subtasks: true, comments: true, checklists: true, attachments: true, timeEntries: true } },
        },
        orderBy: query.sortBy === 'position' ? { position: 'asc' } : { [query.sortBy || 'createdAt']: query.sortOrder || 'desc' },
      }),
      this.prisma.task.count({ where }),
    ]);
    return paginate(tasks, total, query.page!, query.limit!);
  }

  async findOne(orgId: string, id: string) {
    const task = await this.prisma.task.findFirst({
      where: { id, organizationId: orgId },
      include: {
        assignee: { select: { id: true, email: true, firstName: true, lastName: true, avatar: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        project: { select: { id: true, name: true, slug: true } },
        milestone: { select: { id: true, title: true } },
        parentTask: { select: { id: true, title: true } },
        subtasks: { include: { assignee: { select: { id: true, firstName: true, lastName: true, avatar: true } } }, orderBy: { position: 'asc' } },
        comments: { include: { user: { select: { id: true, firstName: true, lastName: true, avatar: true } } }, orderBy: { createdAt: 'desc' } },
        checklists: { orderBy: { sortOrder: 'asc' } },
        attachments: { orderBy: { createdAt: 'desc' } },
        labels: { include: { label: true } },
        timeEntries: { include: { user: { select: { id: true, firstName: true, lastName: true } } }, orderBy: { startTime: 'desc' }, take: 10 },
        dependsOn: { include: { dependencyTask: { select: { id: true, title: true, status: true } } } },
        dependedBy: { include: { dependentTask: { select: { id: true, title: true, status: true } } } },
      },
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  async update(orgId: string, id: string, dto: UpdateTaskDto) {
    await this.findOne(orgId, id);
    const data: any = { ...dto };
    if (dto.dueDate) data.dueDate = new Date(dto.dueDate);
    if (dto.startDate) data.startDate = new Date(dto.startDate);
    if (dto.status === TaskStatus.DONE) data.completedAt = new Date();
    delete data.projectId; // Don't allow changing project
    return this.prisma.task.update({ where: { id }, data, include: { assignee: { select: { id: true, firstName: true, lastName: true, avatar: true } } } });
  }

  async delete(orgId: string, id: string) {
    await this.findOne(orgId, id);
    await this.prisma.task.delete({ where: { id } });
    return { message: 'Task deleted' };
  }

  async bulkUpdate(orgId: string, dto: BulkUpdateTasksDto) {
    const data: any = {};
    if (dto.status) data.status = dto.status;
    if (dto.assigneeId) data.assigneeId = dto.assigneeId;
    if (dto.priority) data.priority = dto.priority;
    if (dto.status === TaskStatus.DONE) data.completedAt = new Date();
    await this.prisma.task.updateMany({ where: { id: { in: dto.taskIds }, organizationId: orgId }, data });
    return { message: `${dto.taskIds.length} tasks updated` };
  }

  // ---- Comments ----
  async addComment(orgId: string, taskId: string, userId: string, dto: CreateTaskCommentDto) {
    await this.findOne(orgId, taskId);
    return this.prisma.taskComment.create({
      data: { taskId, userId, content: dto.content },
      include: { user: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
    });
  }

  async deleteComment(orgId: string, taskId: string, commentId: string) {
    await this.findOne(orgId, taskId);
    await this.prisma.taskComment.delete({ where: { id: commentId } });
    return { message: 'Comment deleted' };
  }

  // ---- Checklist ----
  async addChecklistItem(orgId: string, taskId: string, dto: CreateChecklistItemDto) {
    await this.findOne(orgId, taskId);
    const count = await this.prisma.taskChecklist.count({ where: { taskId } });
    return this.prisma.taskChecklist.create({ data: { ...dto, taskId, sortOrder: count } });
  }

  async toggleChecklistItem(orgId: string, taskId: string, itemId: string) {
    await this.findOne(orgId, taskId);
    const item = await this.prisma.taskChecklist.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException('Checklist item not found');
    return this.prisma.taskChecklist.update({ where: { id: itemId }, data: { isCompleted: !item.isCompleted } });
  }

  async deleteChecklistItem(orgId: string, taskId: string, itemId: string) {
    await this.findOne(orgId, taskId);
    await this.prisma.taskChecklist.delete({ where: { id: itemId } });
    return { message: 'Checklist item deleted' };
  }

  // ---- Dependencies ----
  async addDependency(orgId: string, taskId: string, dto: CreateTaskDependencyDto) {
    await this.findOne(orgId, taskId);
    return this.prisma.taskDependency.create({
      data: { dependentTaskId: taskId, dependencyTaskId: dto.dependencyTaskId, type: dto.type || 'finish_to_start' },
    });
  }

  async removeDependency(orgId: string, taskId: string, depId: string) {
    await this.findOne(orgId, taskId);
    await this.prisma.taskDependency.delete({ where: { id: depId } });
    return { message: 'Dependency removed' };
  }

  // ---- Kanban/Board view ----
  async getKanbanBoard(orgId: string, projectId: string) {
    const statuses = Object.values(TaskStatus);
    const columns = await Promise.all(
      statuses.map(async (status) => {
        const tasks = await this.prisma.task.findMany({
          where: { organizationId: orgId, projectId, status, parentTaskId: null },
          include: {
            assignee: { select: { id: true, firstName: true, lastName: true, avatar: true } },
            labels: { include: { label: true } },
            _count: { select: { subtasks: true, comments: true } },
          },
          orderBy: { position: 'asc' },
        });
        return { status, tasks, count: tasks.length };
      }),
    );
    return columns;
  }
}
