import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateTeamDto, UpdateTeamDto, AddTeamMemberDto } from './dto/team.dto';
import { PaginationDto } from '../../common/dto';
import { paginate } from '../../common/utils';

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(orgId: string, dto: CreateTeamDto) {
    return this.prisma.team.create({ data: { ...dto, organizationId: orgId } });
  }

  async findAll(orgId: string, query: PaginationDto) {
    const where: any = { organizationId: orgId };
    if (query.search) where.name = { contains: query.search, mode: 'insensitive' };
    const [teams, total] = await Promise.all([
      this.prisma.team.findMany({
        where, skip: query.skip, take: query.take,
        include: { members: { include: { user: { select: { id: true, firstName: true, lastName: true, avatar: true } } } }, _count: { select: { projects: true } } },
        orderBy: { [query.sortBy || 'createdAt']: query.sortOrder || 'desc' },
      }),
      this.prisma.team.count({ where }),
    ]);
    return paginate(teams, total, query.page!, query.limit!);
  }

  async findOne(orgId: string, id: string) {
    const team = await this.prisma.team.findFirst({
      where: { id, organizationId: orgId },
      include: { members: { include: { user: { select: { id: true, email: true, firstName: true, lastName: true, avatar: true } } } }, projects: { select: { id: true, name: true, status: true } } },
    });
    if (!team) throw new NotFoundException('Team not found');
    return team;
  }

  async update(orgId: string, id: string, dto: UpdateTeamDto) {
    await this.findOne(orgId, id);
    return this.prisma.team.update({ where: { id }, data: dto });
  }

  async delete(orgId: string, id: string) {
    await this.findOne(orgId, id);
    await this.prisma.team.delete({ where: { id } });
    return { message: 'Team deleted' };
  }

  async addMember(orgId: string, teamId: string, dto: AddTeamMemberDto) {
    await this.findOne(orgId, teamId);
    const existing = await this.prisma.teamMember.findUnique({ where: { teamId_userId: { teamId, userId: dto.userId } } });
    if (existing) throw new ConflictException('User is already a team member');
    return this.prisma.teamMember.create({ data: { teamId, userId: dto.userId, isLead: dto.isLead } });
  }

  async removeMember(orgId: string, teamId: string, userId: string) {
    await this.findOne(orgId, teamId);
    await this.prisma.teamMember.deleteMany({ where: { teamId, userId } });
    return { message: 'Member removed from team' };
  }
}
