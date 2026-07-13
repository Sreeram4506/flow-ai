import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateClientDto, UpdateClientDto, CreateClientContactDto } from './dto/client.dto';
import { PaginationDto } from '../../common/dto';
import { paginate } from '../../common/utils';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(orgId: string, userId: string, dto: CreateClientDto) {
    return this.prisma.client.create({ data: { ...dto, organizationId: orgId, createdById: userId } });
  }

  async findAll(orgId: string, query: PaginationDto) {
    const where: any = { organizationId: orgId };
    if (query.search) {
      where.OR = [
        { companyName: { contains: query.search, mode: 'insensitive' } },
        { contactPerson: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    const [clients, total] = await Promise.all([
      this.prisma.client.findMany({
        where, skip: query.skip, take: query.take,
        include: {
          contacts: { where: { isPrimary: true }, take: 1 },
          _count: { select: { projects: true, invoices: true, payments: true } },
        },
        orderBy: { [query.sortBy || 'createdAt']: query.sortOrder || 'desc' },
      }),
      this.prisma.client.count({ where }),
    ]);
    return paginate(clients, total, query.page!, query.limit!);
  }

  async findOne(orgId: string, id: string) {
    const client = await this.prisma.client.findFirst({
      where: { id, organizationId: orgId },
      include: {
        contacts: true,
        projects: { select: { id: true, name: true, status: true, progress: true, budget: true }, orderBy: { createdAt: 'desc' } },
        invoices: { select: { id: true, invoiceNumber: true, status: true, total: true, dueDate: true }, orderBy: { createdAt: 'desc' }, take: 10 },
        payments: { select: { id: true, amount: true, status: true, paidAt: true }, orderBy: { createdAt: 'desc' }, take: 10 },
        quotations: { select: { id: true, quotationNumber: true, status: true, total: true }, orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }

  async update(orgId: string, id: string, dto: UpdateClientDto) {
    await this.findOne(orgId, id);
    return this.prisma.client.update({ where: { id }, data: dto });
  }

  async delete(orgId: string, id: string) {
    await this.findOne(orgId, id);
    await this.prisma.client.update({ where: { id }, data: { isActive: false } });
    return { message: 'Client archived' };
  }

  // ---- Contacts ----
  async addContact(orgId: string, clientId: string, dto: CreateClientContactDto) {
    await this.findOne(orgId, clientId);
    if (dto.isPrimary) {
      await this.prisma.clientContact.updateMany({ where: { clientId }, data: { isPrimary: false } });
    }
    return this.prisma.clientContact.create({ data: { ...dto, clientId } });
  }

  async removeContact(orgId: string, clientId: string, contactId: string) {
    await this.findOne(orgId, clientId);
    await this.prisma.clientContact.delete({ where: { id: contactId } });
    return { message: 'Contact removed' };
  }

  // ---- Analytics ----
  async getClientStats(orgId: string, clientId: string) {
    const [totalInvoiced, totalPaid, projectCount] = await Promise.all([
      this.prisma.invoice.aggregate({ where: { clientId, organizationId: orgId }, _sum: { total: true } }),
      this.prisma.payment.aggregate({ where: { clientId, organizationId: orgId, status: 'PAID' }, _sum: { amount: true } }),
      this.prisma.project.count({ where: { clientId, organizationId: orgId } }),
    ]);
    return {
      totalInvoiced: totalInvoiced._sum.total || 0,
      totalPaid: totalPaid._sum.amount || 0,
      totalOutstanding: Number(totalInvoiced._sum.total || 0) - Number(totalPaid._sum.amount || 0),
      projectCount,
    };
  }
}
