// ================ SEARCH MODULE ================
import { Module, Injectable, Controller, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { Get, Query } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { OrgId } from '../../common/decorators';
import { TenantGuard } from '../../common/guards';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async globalSearch(orgId: string, query: string, limit: number = 5) {
    if (!query || query.trim().length < 2) return { clients: [], projects: [], tasks: [], invoices: [], quotations: [], documents: [], leads: [] };

    const search = query.trim();
    const [clients, projects, tasks, invoices, quotations, documents, leads] = await Promise.all([
      this.prisma.client.findMany({ where: { organizationId: orgId, OR: [{ companyName: { contains: search, mode: 'insensitive' } }, { contactPerson: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }] }, take: limit, select: { id: true, companyName: true, contactPerson: true, email: true } }),
      this.prisma.project.findMany({ where: { organizationId: orgId, OR: [{ name: { contains: search, mode: 'insensitive' } }, { description: { contains: search, mode: 'insensitive' } }] }, take: limit, select: { id: true, name: true, status: true, slug: true } }),
      this.prisma.task.findMany({ where: { organizationId: orgId, OR: [{ title: { contains: search, mode: 'insensitive' } }, { description: { contains: search, mode: 'insensitive' } }] }, take: limit, select: { id: true, title: true, status: true, projectId: true } }),
      this.prisma.invoice.findMany({ where: { organizationId: orgId, OR: [{ invoiceNumber: { contains: search, mode: 'insensitive' } }, { client: { companyName: { contains: search, mode: 'insensitive' } } }] }, take: limit, select: { id: true, invoiceNumber: true, status: true, total: true } }),
      this.prisma.quotation.findMany({ where: { organizationId: orgId, OR: [{ quotationNumber: { contains: search, mode: 'insensitive' } }, { client: { companyName: { contains: search, mode: 'insensitive' } } }] }, take: limit, select: { id: true, quotationNumber: true, status: true, total: true } }),
      this.prisma.document.findMany({ where: { organizationId: orgId, name: { contains: search, mode: 'insensitive' } }, take: limit, select: { id: true, name: true, fileType: true } }),
      this.prisma.lead.findMany({ where: { organizationId: orgId, OR: [{ companyName: { contains: search, mode: 'insensitive' } }, { contactName: { contains: search, mode: 'insensitive' } }] }, take: limit, select: { id: true, companyName: true, contactName: true, stage: true } }),
    ]);

    return { clients, projects, tasks, invoices, quotations, documents, leads };
  }
}

@ApiTags('Search') @ApiBearerAuth() @ApiHeader({ name: 'x-organization-id', required: true })
@UseGuards(TenantGuard)
@Controller('api/search')
export class SearchController {
  constructor(private readonly service: SearchService) {}

  @Get() @ApiOperation({ summary: 'Global search across all entities' })
  search(@OrgId() orgId: string, @Query('q') query: string, @Query('limit') limit?: number) {
    return this.service.globalSearch(orgId, query, limit);
  }
}

@Module({ controllers: [SearchController], providers: [SearchService], exports: [SearchService] })
export class SearchModule {}
