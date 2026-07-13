import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { QuotationsService } from './quotations.service';
import { CreateQuotationDto, UpdateQuotationDto } from './dto/quotation.dto';
import { PaginationDto } from '../../common/dto';
import { CurrentUser, OrgId } from '../../common/decorators';
import { TenantGuard } from '../../common/guards';

@ApiTags('Quotations') @ApiBearerAuth() @ApiHeader({ name: 'x-organization-id', required: true })
@UseGuards(TenantGuard)
@Controller('api/quotations')
export class QuotationsController {
  constructor(private readonly service: QuotationsService) {}

  @Post() @ApiOperation({ summary: 'Create quotation' })
  create(@OrgId() orgId: string, @CurrentUser('id') userId: string, @Body() dto: CreateQuotationDto) { return this.service.create(orgId, userId, dto); }

  @Get() @ApiOperation({ summary: 'List quotations' })
  findAll(@OrgId() orgId: string, @Query() query: PaginationDto) { return this.service.findAll(orgId, query); }

  @Get(':id') @ApiOperation({ summary: 'Get quotation' })
  findOne(@OrgId() orgId: string, @Param('id') id: string) { return this.service.findOne(orgId, id); }

  @Patch(':id') @ApiOperation({ summary: 'Update quotation' })
  update(@OrgId() orgId: string, @Param('id') id: string, @Body() dto: UpdateQuotationDto) { return this.service.update(orgId, id, dto); }

  @Delete(':id') @ApiOperation({ summary: 'Delete quotation' })
  delete(@OrgId() orgId: string, @Param('id') id: string) { return this.service.delete(orgId, id); }

  @Post(':id/convert-to-invoice') @ApiOperation({ summary: 'Convert quotation to invoice' })
  toInvoice(@OrgId() orgId: string, @Param('id') id: string, @CurrentUser('id') userId: string) { return this.service.convertToInvoice(orgId, id, userId); }

  @Post(':id/convert-to-project') @ApiOperation({ summary: 'Convert quotation to project' })
  toProject(@OrgId() orgId: string, @Param('id') id: string, @CurrentUser('id') userId: string) { return this.service.convertToProject(orgId, id, userId); }
}
