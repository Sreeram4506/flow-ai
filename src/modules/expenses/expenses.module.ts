// ================ EXPENSES MODULE ================
import { Module, Injectable, Controller, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { Get, Post, Body, Param, Query } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { PaginationDto } from '../../common/dto';
import { CurrentUser, OrgId } from '../../common/decorators';
import { TenantGuard } from '../../common/guards';
import { paginate } from '../../common/utils';
import { ExpenseStatus, Currency } from '@prisma/client';

export class CreateExpenseDto {
  @ApiProperty() @IsString() @IsNotEmpty() title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @Type(() => Number) @IsNumber() amount: number;
  @ApiPropertyOptional({ enum: Currency }) @IsOptional() @IsEnum(Currency) currency?: Currency;
  @ApiProperty() @IsDateString() date: string;
  @ApiPropertyOptional() @IsOptional() @IsString() categoryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() receiptUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() vendorName?: string;
}
export class UpdateExpenseDto {
  @ApiPropertyOptional({ enum: ExpenseStatus }) @IsOptional() @IsEnum(ExpenseStatus) status?: ExpenseStatus;
}
export class CreateExpenseCategoryDto {
  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() color?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() icon?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() budgetLimit?: number;
}

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(orgId: string, userId: string, dto: CreateExpenseDto) {
    return this.prisma.expense.create({ data: { ...dto, date: new Date(dto.date), organizationId: orgId, submittedById: userId } });
  }

  async findAll(orgId: string, query: PaginationDto & { status?: ExpenseStatus; categoryId?: string }) {
    const where: any = { organizationId: orgId };
    if (query.search) where.title = { contains: query.search, mode: 'insensitive' };
    if (query.status) where.status = query.status;
    if (query.categoryId) where.categoryId = query.categoryId;
    const [expenses, total] = await Promise.all([
      this.prisma.expense.findMany({ where, skip: query.skip, take: query.take, include: { category: true, submittedBy: { select: { id: true, firstName: true, lastName: true } } }, orderBy: { date: 'desc' } }),
      this.prisma.expense.count({ where }),
    ]);
    return paginate(expenses, total, query.page!, query.limit!);
  }

  async approve(orgId: string, id: string, userId: string) {
    return this.prisma.expense.update({ where: { id }, data: { status: ExpenseStatus.APPROVED, approvedById: userId, approvedAt: new Date() } });
  }

  async reject(orgId: string, id: string, userId: string) {
    return this.prisma.expense.update({ where: { id }, data: { status: ExpenseStatus.REJECTED, approvedById: userId, approvedAt: new Date() } });
  }

  async getCategories(orgId: string) {
    return this.prisma.expenseCategory.findMany({ where: { organizationId: orgId }, include: { _count: { select: { expenses: true } } } });
  }

  async createCategory(orgId: string, dto: CreateExpenseCategoryDto) {
    return this.prisma.expenseCategory.create({ data: { ...dto, organizationId: orgId } });
  }

  async getExpenseStats(orgId: string) {
    const [total, byCategory] = await Promise.all([
      this.prisma.expense.aggregate({ where: { organizationId: orgId, status: ExpenseStatus.APPROVED }, _sum: { amount: true }, _count: true }),
      this.prisma.expense.groupBy({ by: ['categoryId'], where: { organizationId: orgId, status: ExpenseStatus.APPROVED }, _sum: { amount: true }, _count: true }),
    ]);
    return { totalApproved: total._sum.amount || 0, totalCount: total._count, byCategory };
  }
}

@ApiTags('Expenses') @ApiBearerAuth() @ApiHeader({ name: 'x-organization-id', required: true })
@UseGuards(TenantGuard)
@Controller('api/expenses')
export class ExpensesController {
  constructor(private readonly service: ExpensesService) {}

  @Post() @ApiOperation({ summary: 'Submit expense' })
  create(@OrgId() orgId: string, @CurrentUser('id') userId: string, @Body() dto: CreateExpenseDto) { return this.service.create(orgId, userId, dto); }

  @Get() @ApiOperation({ summary: 'List expenses' })
  findAll(@OrgId() orgId: string, @Query() query: PaginationDto) { return this.service.findAll(orgId, query); }

  @Post(':id/approve') @ApiOperation({ summary: 'Approve expense' })
  approve(@OrgId() orgId: string, @Param('id') id: string, @CurrentUser('id') userId: string) { return this.service.approve(orgId, id, userId); }

  @Post(':id/reject') @ApiOperation({ summary: 'Reject expense' })
  reject(@OrgId() orgId: string, @Param('id') id: string, @CurrentUser('id') userId: string) { return this.service.reject(orgId, id, userId); }

  @Get('categories') @ApiOperation({ summary: 'List expense categories' })
  getCategories(@OrgId() orgId: string) { return this.service.getCategories(orgId); }

  @Post('categories') @ApiOperation({ summary: 'Create expense category' })
  createCategory(@OrgId() orgId: string, @Body() dto: CreateExpenseCategoryDto) { return this.service.createCategory(orgId, dto); }

  @Get('stats') @ApiOperation({ summary: 'Get expense statistics' })
  getStats(@OrgId() orgId: string) { return this.service.getExpenseStats(orgId); }
}

@Module({ controllers: [ExpensesController], providers: [ExpensesService], exports: [ExpensesService] })
export class ExpensesModule {}
