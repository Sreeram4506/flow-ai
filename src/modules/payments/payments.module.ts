// ================ PAYMENTS MODULE ================
import { Module, Injectable, Controller, NotFoundException, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { PaginationDto } from '../../common/dto';
import { paginate } from '../../common/utils';
import { OrgId } from '../../common/decorators';
import { TenantGuard } from '../../common/guards';
import { PaymentStatus, PaymentMethod, Currency, InvoiceStatus } from '@prisma/client';

// ---- DTO ----
export class CreatePaymentDto {
  @ApiPropertyOptional() @IsOptional() @IsString() invoiceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() clientId?: string;
  @ApiProperty() @Type(() => Number) @IsNumber() amount: number;
  @ApiPropertyOptional({ enum: Currency }) @IsOptional() @IsEnum(Currency) currency?: Currency;
  @ApiPropertyOptional({ enum: PaymentMethod }) @IsOptional() @IsEnum(PaymentMethod) method?: PaymentMethod;
  @ApiPropertyOptional() @IsOptional() @IsString() transactionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
export class UpdatePaymentStatusDto {
  @ApiProperty({ enum: PaymentStatus }) @IsEnum(PaymentStatus) status: PaymentStatus;
}

// ---- SERVICE ----
@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(orgId: string, dto: CreatePaymentDto) {
    const payment = await this.prisma.payment.create({
      data: { organizationId: orgId, invoiceId: dto.invoiceId, clientId: dto.clientId, amount: dto.amount, currency: dto.currency, method: dto.method, transactionId: dto.transactionId, notes: dto.notes, status: PaymentStatus.PAID, paidAt: new Date() },
    });

    // Update invoice if linked
    if (dto.invoiceId) {
      const invoice = await this.prisma.invoice.findUnique({ where: { id: dto.invoiceId } });
      if (invoice) {
        const newAmountPaid = Number(invoice.amountPaid) + dto.amount;
        const newAmountDue = Number(invoice.total) - newAmountPaid;
        const status = newAmountDue <= 0 ? InvoiceStatus.PAID : InvoiceStatus.PARTIAL;
        await this.prisma.invoice.update({
          where: { id: dto.invoiceId },
          data: { amountPaid: newAmountPaid, amountDue: Math.max(0, newAmountDue), status, paidAt: newAmountDue <= 0 ? new Date() : undefined },
        });
      }
    }
    return payment;
  }

  async findAll(orgId: string, query: PaginationDto & { status?: PaymentStatus }) {
    const where: any = { organizationId: orgId };
    if (query.status) where.status = query.status;
    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({ where, skip: query.skip, take: query.take, include: { invoice: { select: { id: true, invoiceNumber: true } }, client: { select: { id: true, companyName: true } } }, orderBy: { createdAt: 'desc' } }),
      this.prisma.payment.count({ where }),
    ]);
    return paginate(payments, total, query.page!, query.limit!);
  }

  async findOne(orgId: string, id: string) {
    const p = await this.prisma.payment.findFirst({ where: { id, organizationId: orgId }, include: { invoice: true, client: true } });
    if (!p) throw new NotFoundException('Payment not found');
    return p;
  }

  async updateStatus(orgId: string, id: string, dto: UpdatePaymentStatusDto) {
    await this.findOne(orgId, id);
    const data: any = { status: dto.status };
    if (dto.status === PaymentStatus.REFUNDED) data.refundedAt = new Date();
    return this.prisma.payment.update({ where: { id }, data });
  }
}

// ---- CONTROLLER ----
@ApiTags('Payments') @ApiBearerAuth() @ApiHeader({ name: 'x-organization-id', required: true })
@UseGuards(TenantGuard)
@Controller('api/payments')
export class PaymentsController {
  constructor(private readonly service: PaymentsService) {}

  @Post() @ApiOperation({ summary: 'Record payment' })
  create(@OrgId() orgId: string, @Body() dto: CreatePaymentDto) { return this.service.create(orgId, dto); }

  @Get() @ApiOperation({ summary: 'List payments' })
  findAll(@OrgId() orgId: string, @Query() query: PaginationDto) { return this.service.findAll(orgId, query); }

  @Get(':id') @ApiOperation({ summary: 'Get payment' })
  findOne(@OrgId() orgId: string, @Param('id') id: string) { return this.service.findOne(orgId, id); }

  @Patch(':id/status') @ApiOperation({ summary: 'Update payment status' })
  updateStatus(@OrgId() orgId: string, @Param('id') id: string, @Body() dto: UpdatePaymentStatusDto) { return this.service.updateStatus(orgId, id, dto); }
}

// ---- MODULE ----
@Module({ controllers: [PaymentsController], providers: [PaymentsService], exports: [PaymentsService] })
export class PaymentsModule {}
