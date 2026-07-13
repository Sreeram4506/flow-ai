import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto, UpdateInvoiceDto } from './dto/invoice.dto';
import { PaginationDto } from '../../common/dto';
import { CurrentUser, OrgId } from '../../common/decorators';
import { TenantGuard } from '../../common/guards';

@ApiTags('Invoices') @ApiBearerAuth() @ApiHeader({ name: 'x-organization-id', required: true })
@UseGuards(TenantGuard)
@Controller('api/invoices')
export class InvoicesController {
  constructor(private readonly service: InvoicesService) {}

  @Post() @ApiOperation({ summary: 'Create invoice' })
  create(@OrgId() orgId: string, @CurrentUser('id') userId: string, @Body() dto: CreateInvoiceDto) { return this.service.create(orgId, userId, dto); }

  @Get() @ApiOperation({ summary: 'List invoices' })
  findAll(@OrgId() orgId: string, @Query() query: PaginationDto) { return this.service.findAll(orgId, query); }

  @Get('stats') @ApiOperation({ summary: 'Get invoice statistics' })
  getStats(@OrgId() orgId: string) { return this.service.getInvoiceStats(orgId); }

  @Get(':id') @ApiOperation({ summary: 'Get invoice' })
  findOne(@OrgId() orgId: string, @Param('id') id: string) { return this.service.findOne(orgId, id); }

  @Patch(':id') @ApiOperation({ summary: 'Update invoice' })
  update(@OrgId() orgId: string, @Param('id') id: string, @Body() dto: UpdateInvoiceDto) { return this.service.update(orgId, id, dto); }

  @Delete(':id') @ApiOperation({ summary: 'Cancel invoice' })
  delete(@OrgId() orgId: string, @Param('id') id: string) { return this.service.delete(orgId, id); }

  @Post(':id/send') @ApiOperation({ summary: 'Mark invoice as sent' })
  send(@OrgId() orgId: string, @Param('id') id: string) { return this.service.markAsSent(orgId, id); }
}
