// ================ AUDIT LOGS MODULE ================
import { Module, Injectable, Controller, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { Get, Query } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { PaginationDto } from '../../common/dto';
import { paginate } from '../../common/utils';
import { AuditAction } from '@prisma/client';
import { OrgId } from '../../common/decorators';
import { TenantGuard } from '../../common/guards';

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async log(data: { organizationId?: string; userId?: string; action: AuditAction; entity: string; entityId?: string; oldData?: any; newData?: any; ipAddress?: string; userAgent?: string }) {
    return this.prisma.auditLog.create({ data });
  }

  async findAll(orgId: string, query: PaginationDto & { action?: AuditAction; entity?: string; userId?: string }) {
    const where: any = { organizationId: orgId };
    if (query.action) where.action = query.action;
    if (query.entity) where.entity = query.entity;
    if (query.userId) where.userId = query.userId;
    if (query.search) where.entity = { contains: query.search, mode: 'insensitive' };
    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, skip: query.skip, take: query.take, include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } }, orderBy: { createdAt: 'desc' } }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paginate(logs, total, query.page!, query.limit!);
  }
}

@ApiTags('Audit Logs') @ApiBearerAuth() @ApiHeader({ name: 'x-organization-id', required: true })
@UseGuards(TenantGuard)
@Controller('api/audit-logs')
export class AuditLogsController {
  constructor(private readonly service: AuditLogsService) {}

  @Get() @ApiOperation({ summary: 'List audit logs' })
  findAll(@OrgId() orgId: string, @Query() query: PaginationDto) { return this.service.findAll(orgId, query); }
}

@Module({ controllers: [AuditLogsController], providers: [AuditLogsService], exports: [AuditLogsService] })
export class AuditLogsModule {}
