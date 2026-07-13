import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UpdateUserDto } from './dto/user.dto';
import { PaginationDto } from '../../common/dto';
import { paginate } from '../../common/utils';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: PaginationDto) {
    const where: any = {};
    if (query.search) {
      where.OR = [
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: { [query.sortBy || 'createdAt']: query.sortOrder || 'desc' },
        select: {
          id: true, email: true, firstName: true, lastName: true,
          avatar: true, phone: true, isActive: true, isEmailVerified: true,
          lastLoginAt: true, createdAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return paginate(users, total, query.page!, query.limit!);
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        avatar: true, phone: true, timezone: true, locale: true,
        isActive: true, isEmailVerified: true, isSuperAdmin: true,
        lastLoginAt: true, createdAt: true, updatedAt: true,
        organizationMembers: {
          include: { organization: { select: { id: true, name: true, slug: true, logo: true } } },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);
    return this.prisma.user.update({
      where: { id },
      data: dto,
      select: {
        id: true, email: true, firstName: true, lastName: true,
        avatar: true, phone: true, timezone: true, locale: true,
        updatedAt: true,
      },
    });
  }

  async deactivate(id: string) {
    await this.findOne(id);
    await this.prisma.user.update({ where: { id }, data: { isActive: false } });
    return { message: 'User deactivated' };
  }

  async activate(id: string) {
    await this.findOne(id);
    await this.prisma.user.update({ where: { id }, data: { isActive: true } });
    return { message: 'User activated' };
  }
}
