import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { LeadsService } from './leads.service';
import { CreateLeadDto, UpdateLeadDto, CreateLeadActivityDto } from './dto/lead.dto';
import { PaginationDto } from '../../common/dto';
import { CurrentUser, OrgId } from '../../common/decorators';
import { TenantGuard } from '../../common/guards';

@ApiTags('Leads')
@ApiBearerAuth()
@ApiHeader({ name: 'x-organization-id', required: true })
@UseGuards(TenantGuard)
@Controller('api/leads')
export class LeadsController {
  constructor(private readonly service: LeadsService) {}

  @Post() @ApiOperation({ summary: 'Create lead' })
  create(@OrgId() orgId: string, @CurrentUser('id') userId: string, @Body() dto: CreateLeadDto) { return this.service.create(orgId, userId, dto); }

  @Get() @ApiOperation({ summary: 'List leads' })
  findAll(@OrgId() orgId: string, @Query() query: PaginationDto) { return this.service.findAll(orgId, query); }

  @Get('pipeline') @ApiOperation({ summary: 'Get pipeline statistics' })
  getPipeline(@OrgId() orgId: string) { return this.service.getPipelineStats(orgId); }

  @Get(':id') @ApiOperation({ summary: 'Get lead' })
  findOne(@OrgId() orgId: string, @Param('id') id: string) { return this.service.findOne(orgId, id); }

  @Patch(':id') @ApiOperation({ summary: 'Update lead' })
  update(@OrgId() orgId: string, @Param('id') id: string, @Body() dto: UpdateLeadDto) { return this.service.update(orgId, id, dto); }

  @Delete(':id') @ApiOperation({ summary: 'Delete lead' })
  delete(@OrgId() orgId: string, @Param('id') id: string) { return this.service.delete(orgId, id); }

  @Post(':id/activities') @ApiOperation({ summary: 'Add activity to lead' })
  addActivity(@OrgId() orgId: string, @Param('id') id: string, @CurrentUser('id') userId: string, @Body() dto: CreateLeadActivityDto) { return this.service.addActivity(orgId, id, userId, dto); }
}
