import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateQuotationDto, UpdateQuotationDto } from './dto/quotation.dto';
import { PaginationDto } from '../../common/dto';
import { paginate, formatDocumentNumber } from '../../common/utils';
import { QuotationStatus } from '@prisma/client';

@Injectable()
export class QuotationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(orgId: string, userId: string, dto: CreateQuotationDto) {
    const org = await this.prisma.organization.update({ where: { id: orgId }, data: { quotationCounter: { increment: 1 } } });
    const quotationNumber = formatDocumentNumber('QUO', org.quotationCounter + 1);
    const subtotal = dto.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    const taxAmount = dto.taxRate ? (subtotal * dto.taxRate) / 100 : 0;
    const discountAmount = dto.discountRate ? (subtotal * dto.discountRate) / 100 : 0;
    const total = subtotal + taxAmount - discountAmount;

    return this.prisma.quotation.create({
      data: {
        organizationId: orgId, quotationNumber, clientId: dto.clientId, projectId: dto.projectId,
        currency: dto.currency, subtotal, taxRate: dto.taxRate, taxAmount, discountRate: dto.discountRate,
        discountAmount, total, validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
        terms: dto.terms, notes: dto.notes, createdById: userId,
        items: { create: dto.items.map((item, i) => ({ description: item.description, quantity: item.quantity, unitPrice: item.unitPrice, amount: item.quantity * item.unitPrice, sortOrder: i })) },
      },
      include: { items: true, client: { select: { id: true, companyName: true } } },
    });
  }

  async findAll(orgId: string, query: PaginationDto & { status?: QuotationStatus }) {
    const where: any = { organizationId: orgId };
    if (query.search) where.OR = [{ quotationNumber: { contains: query.search, mode: 'insensitive' } }, { client: { companyName: { contains: query.search, mode: 'insensitive' } } }];
    if (query.status) where.status = query.status;
    const [quotations, total] = await Promise.all([
      this.prisma.quotation.findMany({ where, skip: query.skip, take: query.take, include: { client: { select: { id: true, companyName: true } } }, orderBy: { createdAt: 'desc' } }),
      this.prisma.quotation.count({ where }),
    ]);
    return paginate(quotations, total, query.page!, query.limit!);
  }

  async findOne(orgId: string, id: string) {
    const q = await this.prisma.quotation.findFirst({ where: { id, organizationId: orgId }, include: { items: { orderBy: { sortOrder: 'asc' } }, client: true, project: { select: { id: true, name: true } }, createdBy: { select: { id: true, firstName: true, lastName: true } } } });
    if (!q) throw new NotFoundException('Quotation not found');
    return q;
  }

  async update(orgId: string, id: string, dto: UpdateQuotationDto) {
    await this.findOne(orgId, id);
    const data: any = {};
    if (dto.status) {
      data.status = dto.status;
      if (dto.status === QuotationStatus.SENT) data.sentAt = new Date();
      if (dto.status === QuotationStatus.APPROVED) data.approvedAt = new Date();
      if (dto.status === QuotationStatus.REJECTED) data.rejectedAt = new Date();
    }
    if (dto.terms !== undefined) data.terms = dto.terms;
    if (dto.notes !== undefined) data.notes = dto.notes;
    return this.prisma.quotation.update({ where: { id }, data });
  }

  async convertToInvoice(orgId: string, id: string, userId: string) {
    const quotation = await this.findOne(orgId, id);
    const org = await this.prisma.organization.update({ where: { id: orgId }, data: { invoiceCounter: { increment: 1 } } });
    const invoiceNumber = formatDocumentNumber('INV', org.invoiceCounter + 1);

    const invoice = await this.prisma.invoice.create({
      data: {
        organizationId: orgId, invoiceNumber, clientId: quotation.clientId, projectId: quotation.projectId,
        quotationId: id, currency: quotation.currency, subtotal: quotation.subtotal, taxRate: quotation.taxRate,
        taxAmount: quotation.taxAmount, discountRate: quotation.discountRate, discountAmount: quotation.discountAmount,
        total: quotation.total, amountDue: quotation.total, terms: quotation.terms, notes: quotation.notes, createdById: userId,
        items: { create: quotation.items.map((item: any) => ({ description: item.description, quantity: item.quantity, unitPrice: item.unitPrice, amount: item.amount, sortOrder: item.sortOrder })) },
      },
      include: { items: true },
    });

    return invoice;
  }

  async convertToProject(orgId: string, id: string, userId: string) {
    const quotation = await this.findOne(orgId, id);
    const slug = `project-${Date.now().toString(36)}`;
    const project = await this.prisma.project.create({
      data: {
        organizationId: orgId, name: `Project for ${quotation.client?.companyName || 'Client'}`,
        slug, budget: quotation.total, currency: quotation.currency, clientId: quotation.clientId,
        createdById: userId, members: { create: { userId, role: 'lead' } },
      },
    });
    return project;
  }

  async delete(orgId: string, id: string) {
    await this.findOne(orgId, id);
    await this.prisma.quotation.delete({ where: { id } });
    return { message: 'Quotation deleted' };
  }
}
