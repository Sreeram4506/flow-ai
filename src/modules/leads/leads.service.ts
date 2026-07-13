import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateLeadDto, UpdateLeadDto, CreateLeadActivityDto } from './dto/lead.dto';
import { PaginationDto } from '../../common/dto';
import { paginate } from '../../common/utils';
import { LeadStage } from '@prisma/client';

@Injectable()
export class LeadsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(orgId: string, userId: string, dto: CreateLeadDto) {
    let score = 50; // base score
    if (dto.value) {
      if (dto.value > 20000) score += 15;
      else if (dto.value > 10000) score += 10;
      else if (dto.value > 5000) score += 5;
    }
    if (dto.probability) {
      score += Math.round((dto.probability - 50) / 2);
    }
    if (dto.source) {
      if (dto.source === 'REFERRAL') score += 15;
      else if (dto.source === 'WEBSITE') score += 10;
      else if (dto.source === 'EMAIL') score += 5;
      else if (dto.source === 'COLD_CALL') score -= 10;
    }
    if (dto.email) {
      const isFreeEmail = /@(gmail|yahoo|outlook|hotmail|aol|live)\./i.test(dto.email);
      if (!isFreeEmail) {
        score += 15; // Corporate email domain bonus
      }
    }
    const aiScore = Math.min(100, Math.max(0, score));

    return this.prisma.lead.create({
      data: {
        ...dto,
        value: dto.value ? dto.value : undefined,
        expectedCloseDate: dto.expectedCloseDate ? new Date(dto.expectedCloseDate) : undefined,
        organizationId: orgId,
        createdById: userId,
        aiScore,
      },
    });
  }

  async findAll(orgId: string, query: PaginationDto & { stage?: LeadStage }) {
    const where: any = { organizationId: orgId };
    if (query.search) {
      where.OR = [
        { companyName: { contains: query.search, mode: 'insensitive' } },
        { contactName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.stage) where.stage = query.stage;
    const [leads, total] = await Promise.all([
      this.prisma.lead.findMany({
        where, skip: query.skip, take: query.take,
        include: { activities: { orderBy: { createdAt: 'desc' }, take: 3 } },
        orderBy: { [query.sortBy || 'createdAt']: query.sortOrder || 'desc' },
      }),
      this.prisma.lead.count({ where }),
    ]);
    return paginate(leads, total, query.page!, query.limit!);
  }

  async findOne(orgId: string, id: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, organizationId: orgId },
      include: { activities: { include: { user: { select: { id: true, firstName: true, lastName: true } } }, orderBy: { createdAt: 'desc' } }, createdBy: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }

  async update(orgId: string, id: string, dto: UpdateLeadDto) {
    await this.findOne(orgId, id);
    const data: any = { ...dto };
    if (dto.expectedCloseDate) data.expectedCloseDate = new Date(dto.expectedCloseDate);
    if (dto.stage === LeadStage.WON || dto.stage === LeadStage.LOST) data.closedAt = new Date();
    return this.prisma.lead.update({ where: { id }, data });
  }

  async delete(orgId: string, id: string) {
    await this.findOne(orgId, id);
    await this.prisma.lead.delete({ where: { id } });
    return { message: 'Lead deleted' };
  }

  async addActivity(orgId: string, leadId: string, userId: string, dto: CreateLeadActivityDto) {
    await this.findOne(orgId, leadId);
    return this.prisma.leadActivity.create({
      data: {
        ...dto,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        leadId,
        userId,
      },
    });
  }

  async getPipelineStats(orgId: string) {
    const stages = Object.values(LeadStage);
    const counts = await Promise.all(
      stages.map((stage) => this.prisma.lead.count({ where: { organizationId: orgId, stage } })),
    );
    const values = await Promise.all(
      stages.map((stage) => this.prisma.lead.aggregate({ where: { organizationId: orgId, stage }, _sum: { value: true } })),
    );
    return stages.map((stage, i) => ({ stage, count: counts[i], totalValue: values[i]._sum.value || 0 }));
  }
}
