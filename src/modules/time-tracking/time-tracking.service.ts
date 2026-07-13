import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { StartTimerDto, ManualTimeEntryDto } from './dto/time-tracking.dto';
import { PaginationDto } from '../../common/dto';
import { paginate } from '../../common/utils';

@Injectable()
export class TimeTrackingService {
  constructor(private readonly prisma: PrismaService) {}

  async startTimer(userId: string, dto: StartTimerDto) {
    const running = await this.prisma.timeEntry.findFirst({ where: { userId, isRunning: true } });
    if (running) throw new BadRequestException('A timer is already running. Stop it first.');
    return this.prisma.timeEntry.create({
      data: { userId, taskId: dto.taskId, projectId: dto.projectId, description: dto.description, isBillable: dto.isBillable ?? true, startTime: new Date(), isRunning: true },
    });
  }

  async stopTimer(userId: string, entryId: string) {
    const entry = await this.prisma.timeEntry.findFirst({ where: { id: entryId, userId, isRunning: true } });
    if (!entry) throw new NotFoundException('No running timer found');
    const endTime = new Date();
    const duration = Math.round((endTime.getTime() - entry.startTime.getTime()) / 1000);
    return this.prisma.timeEntry.update({
      where: { id: entryId },
      data: { endTime, duration, isRunning: false },
    });
  }

  async getRunningTimer(userId: string) {
    return this.prisma.timeEntry.findFirst({
      where: { userId, isRunning: true },
      include: { task: { select: { id: true, title: true } }, project: { select: { id: true, name: true } } },
    });
  }

  async createManualEntry(userId: string, dto: ManualTimeEntryDto) {
    const start = new Date(dto.startTime);
    const end = new Date(dto.endTime);
    const duration = Math.round((end.getTime() - start.getTime()) / 1000);
    if (duration <= 0) throw new BadRequestException('End time must be after start time');
    return this.prisma.timeEntry.create({
      data: { userId, taskId: dto.taskId, projectId: dto.projectId, description: dto.description, startTime: start, endTime: end, duration, isBillable: dto.isBillable ?? true, hourlyRate: dto.hourlyRate, isRunning: false },
    });
  }

  async findAll(userId: string, query: PaginationDto & { projectId?: string; taskId?: string }) {
    const where: any = { userId };
    if (query.projectId) where.projectId = query.projectId;
    if (query.taskId) where.taskId = query.taskId;
    const [entries, total] = await Promise.all([
      this.prisma.timeEntry.findMany({
        where, skip: query.skip, take: query.take,
        include: { task: { select: { id: true, title: true } }, project: { select: { id: true, name: true } } },
        orderBy: { startTime: 'desc' },
      }),
      this.prisma.timeEntry.count({ where }),
    ]);
    return paginate(entries, total, query.page!, query.limit!);
  }

  async delete(userId: string, id: string) {
    const entry = await this.prisma.timeEntry.findFirst({ where: { id, userId } });
    if (!entry) throw new NotFoundException('Time entry not found');
    await this.prisma.timeEntry.delete({ where: { id } });
    return { message: 'Time entry deleted' };
  }

  async getProductivityStats(userId: string, startDate?: string, endDate?: string) {
    const where: any = { userId };
    if (startDate || endDate) {
      where.startTime = {};
      if (startDate) where.startTime.gte = new Date(startDate);
      if (endDate) where.startTime.lte = new Date(endDate);
    }
    const [total, billable, nonBillable] = await Promise.all([
      this.prisma.timeEntry.aggregate({ where, _sum: { duration: true } }),
      this.prisma.timeEntry.aggregate({ where: { ...where, isBillable: true }, _sum: { duration: true } }),
      this.prisma.timeEntry.aggregate({ where: { ...where, isBillable: false }, _sum: { duration: true } }),
    ]);
    return {
      totalSeconds: total._sum.duration || 0,
      billableSeconds: billable._sum.duration || 0,
      nonBillableSeconds: nonBillable._sum.duration || 0,
      totalHours: Math.round(((total._sum.duration || 0) / 3600) * 100) / 100,
      billableHours: Math.round(((billable._sum.duration || 0) / 3600) * 100) / 100,
    };
  }
}
