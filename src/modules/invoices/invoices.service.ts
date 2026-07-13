import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateInvoiceDto, UpdateInvoiceDto } from './dto/invoice.dto';
import { PaginationDto } from '../../common/dto';
import { paginate, formatDocumentNumber } from '../../common/utils';
import { InvoiceStatus } from '@prisma/client';

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(orgId: string, userId: string, dto: CreateInvoiceDto) {
    const org = await this.prisma.organization.update({
      where: { id: orgId },
      data: { invoiceCounter: { increment: 1 } },
    });

    const invoiceNumber = formatDocumentNumber('INV', org.invoiceCounter + 1);

    // Calculate totals
    const subtotal = dto.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const taxAmount = dto.taxRate ? (subtotal * dto.taxRate) / 100 : 0;
    const discountAmount = dto.discountRate ? (subtotal * dto.discountRate) / 100 : 0;
    const total = subtotal + taxAmount - discountAmount;

    return this.prisma.invoice.create({
      data: {
        organizationId: orgId,
        invoiceNumber,
        clientId: dto.clientId,
        projectId: dto.projectId,
        currency: dto.currency,
        subtotal,
        taxRate: dto.taxRate,
        taxAmount,
        discountRate: dto.discountRate,
        discountAmount,
        total,
        amountDue: total,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        terms: dto.terms,
        notes: dto.notes,
        createdById: userId,
        items: {
          create: dto.items.map((item, i) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            amount: item.quantity * item.unitPrice,
            sortOrder: i,
          })),
        },
      },
      include: { items: true, client: { select: { id: true, companyName: true } } },
    });
  }

  async findAll(orgId: string, query: PaginationDto & { status?: InvoiceStatus; clientId?: string }) {
    const where: any = { organizationId: orgId };
    if (query.search) where.OR = [
      { invoiceNumber: { contains: query.search, mode: 'insensitive' } },
      { client: { companyName: { contains: query.search, mode: 'insensitive' } } },
    ];
    if (query.status) where.status = query.status;
    if (query.clientId) where.clientId = query.clientId;

    const [invoices, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where, skip: query.skip, take: query.take,
        include: { client: { select: { id: true, companyName: true } }, _count: { select: { payments: true } } },
        orderBy: { [query.sortBy || 'createdAt']: query.sortOrder || 'desc' },
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return paginate(invoices, total, query.page!, query.limit!);
  }

  async findOne(orgId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, organizationId: orgId },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        client: true,
        project: { select: { id: true, name: true } },
        payments: { orderBy: { createdAt: 'desc' } },
        fromQuotation: { select: { id: true, quotationNumber: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async update(orgId: string, id: string, dto: UpdateInvoiceDto) {
    await this.findOne(orgId, id);
    const data: any = {};
    if (dto.status) {
      data.status = dto.status;
      if (dto.status === InvoiceStatus.SENT) data.sentAt = new Date();
      if (dto.status === InvoiceStatus.VIEWED) data.viewedAt = new Date();
      if (dto.status === InvoiceStatus.PAID) data.paidAt = new Date();
    }
    if (dto.dueDate) data.dueDate = new Date(dto.dueDate);
    if (dto.terms !== undefined) data.terms = dto.terms;
    if (dto.notes !== undefined) data.notes = dto.notes;
    return this.prisma.invoice.update({ where: { id }, data });
  }

  async delete(orgId: string, id: string) {
    await this.findOne(orgId, id);
    await this.prisma.invoice.update({ where: { id }, data: { status: InvoiceStatus.CANCELLED } });
    return { message: 'Invoice cancelled' };
  }

  async markAsSent(orgId: string, id: string) {
    await this.findOne(orgId, id);
    return this.prisma.invoice.update({ where: { id }, data: { status: InvoiceStatus.SENT, sentAt: new Date() } });
  }

  async getInvoiceStats(orgId: string) {
    const [total, paid, overdue, pending] = await Promise.all([
      this.prisma.invoice.aggregate({ where: { organizationId: orgId }, _sum: { total: true }, _count: true }),
      this.prisma.invoice.aggregate({ where: { organizationId: orgId, status: InvoiceStatus.PAID }, _sum: { total: true }, _count: true }),
      this.prisma.invoice.aggregate({ where: { organizationId: orgId, status: InvoiceStatus.OVERDUE }, _sum: { total: true }, _count: true }),
      this.prisma.invoice.aggregate({ where: { organizationId: orgId, status: { in: [InvoiceStatus.SENT, InvoiceStatus.VIEWED] } }, _sum: { total: true }, _count: true }),
    ]);
    return {
      totalAmount: total._sum.total || 0, totalCount: total._count,
      paidAmount: paid._sum.total || 0, paidCount: paid._count,
      overdueAmount: overdue._sum.total || 0, overdueCount: overdue._count,
      pendingAmount: pending._sum.total || 0, pendingCount: pending._count,
    };
  }
}
