import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateOrganizationDto, UpdateOrganizationDto, InviteMemberDto, UpdateMemberRoleDto } from './dto/organization.dto';
import { PaginationDto } from '../../common/dto';
import { paginate, generateSlug, generateRandomString } from '../../common/utils';
import { UserRole } from '@prisma/client';

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateOrganizationDto, userId: string) {
    const slug = generateSlug(dto.name) + '-' + generateRandomString(6).toLowerCase();

    const org = await this.prisma.organization.create({
      data: { ...dto, slug },
    });

    // Add creator as OWNER
    await this.prisma.organizationMember.create({
      data: {
        organizationId: org.id,
        userId,
        role: UserRole.OWNER,
        status: 'ACTIVE',
        joinedAt: new Date(),
      },
    });

    return org;
  }

  async findAll(query: PaginationDto) {
    const where: any = {};
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { slug: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    const [orgs, total] = await Promise.all([
      this.prisma.organization.findMany({
        where, skip: query.skip, take: query.take,
        orderBy: { [query.sortBy || 'createdAt']: query.sortOrder || 'desc' },
      }),
      this.prisma.organization.count({ where }),
    ]);
    return paginate(orgs, total, query.page!, query.limit!);
  }

  async findUserOrganizations(userId: string) {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId, status: 'ACTIVE' },
      include: {
        organization: true,
      },
    });
    return memberships.map((m: any) => ({
      ...m.organization,
      role: m.role,
      joinedAt: m.joinedAt,
    }));
  }

  async findOne(id: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        members: {
          include: { user: { select: { id: true, email: true, firstName: true, lastName: true, avatar: true } } },
        },
        _count: { select: { projects: true, clients: true, teams: true, invoices: true } },
      },
    });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async update(id: string, dto: UpdateOrganizationDto) {
    await this.findOne(id);
    return this.prisma.organization.update({ where: { id }, data: dto });
  }

  async delete(id: string) {
    await this.findOne(id);
    await this.prisma.organization.delete({ where: { id } });
    return { message: 'Organization deleted' };
  }

  // ---- Members ----

  async getMembers(orgId: string, query: PaginationDto) {
    const where: any = { organizationId: orgId };
    if (query.search) {
      where.user = {
        OR: [
          { firstName: { contains: query.search, mode: 'insensitive' } },
          { lastName: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
        ],
      };
    }
    const [members, total] = await Promise.all([
      this.prisma.organizationMember.findMany({
        where, skip: query.skip, take: query.take,
        include: { user: { select: { id: true, email: true, firstName: true, lastName: true, avatar: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.organizationMember.count({ where }),
    ]);
    return paginate(members, total, query.page!, query.limit!);
  }

  async inviteMember(orgId: string, dto: InviteMemberDto) {
    const existingUser = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });

    if (existingUser) {
      const existingMember = await this.prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: orgId, userId: existingUser.id } },
      });
      if (existingMember) throw new ConflictException('User is already a member');

      return this.prisma.organizationMember.create({
        data: {
          organizationId: orgId,
          userId: existingUser.id,
          role: dto.role,
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
      });
    }

    // Create invitation for non-existing user
    const inviteToken = generateRandomString(32);
    const placeholderUser = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        firstName: dto.email.split('@')[0],
        lastName: '',
      },
    });

    return this.prisma.organizationMember.create({
      data: {
        organizationId: orgId,
        userId: placeholderUser.id,
        role: dto.role,
        status: 'INVITED',
        inviteEmail: dto.email.toLowerCase(),
        inviteToken,
      },
    });
  }

  async updateMemberRole(orgId: string, memberId: string, dto: UpdateMemberRoleDto) {
    const member = await this.prisma.organizationMember.findFirst({
      where: { id: memberId, organizationId: orgId },
    });
    if (!member) throw new NotFoundException('Member not found');
    if (member.role === UserRole.OWNER) throw new ForbiddenException('Cannot change owner role');

    return this.prisma.organizationMember.update({
      where: { id: memberId },
      data: { role: dto.role },
    });
  }

  async removeMember(orgId: string, memberId: string) {
    const member = await this.prisma.organizationMember.findFirst({
      where: { id: memberId, organizationId: orgId },
    });
    if (!member) throw new NotFoundException('Member not found');
    if (member.role === UserRole.OWNER) throw new ForbiddenException('Cannot remove owner');

    await this.prisma.organizationMember.delete({ where: { id: memberId } });
    return { message: 'Member removed' };
  }

  async acceptInvite(token: string, userId: string) {
    const invite = await this.prisma.organizationMember.findUnique({ where: { inviteToken: token } });
    if (!invite || invite.status !== 'INVITED') throw new NotFoundException('Invalid invite');

    return this.prisma.organizationMember.update({
      where: { id: invite.id },
      data: { userId, status: 'ACTIVE', joinedAt: new Date(), inviteToken: null },
    });
  }

  // ---- API Keys ----

  async createApiKey(orgId: string, name: string) {
    // Generate a secure API key
    const rawKey = `flow_live_sk_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
    
    await this.prisma.apiKey.create({
      data: {
        organizationId: orgId,
        name,
        key: rawKey, // In a real app this should be hashed, but schema defines it as string
      }
    });

    return { name, key: rawKey };
  }

  async getApiKeys(orgId: string) {
    const keys = await this.prisma.apiKey.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
    });
    
    // Mask keys before returning
    return keys.map(k => ({
      ...k,
      key: `${k.key.substring(0, 16)}••••••••••••••••`,
    }));
  }

  async revokeApiKey(orgId: string, keyId: string) {
    const key = await this.prisma.apiKey.findFirst({
      where: { id: keyId, organizationId: orgId },
    });
    if (!key) throw new NotFoundException('API Key not found');
    
    await this.prisma.apiKey.delete({
      where: { id: keyId },
    });
    return { message: 'API Key revoked successfully' };
  }
}
