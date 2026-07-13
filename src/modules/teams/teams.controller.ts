import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { TeamsService } from './teams.service';
import { CreateTeamDto, UpdateTeamDto, AddTeamMemberDto } from './dto/team.dto';
import { PaginationDto } from '../../common/dto';
import { OrgId } from '../../common/decorators';
import { TenantGuard } from '../../common/guards';

@ApiTags('Teams')
@ApiBearerAuth()
@ApiHeader({ name: 'x-organization-id', required: true })
@UseGuards(TenantGuard)
@Controller('api/teams')
export class TeamsController {
  constructor(private readonly service: TeamsService) {}

  @Post()
  @ApiOperation({ summary: 'Create team' })
  create(@OrgId() orgId: string, @Body() dto: CreateTeamDto) { return this.service.create(orgId, dto); }

  @Get()
  @ApiOperation({ summary: 'List teams' })
  findAll(@OrgId() orgId: string, @Query() query: PaginationDto) { return this.service.findAll(orgId, query); }

  @Get(':id')
  @ApiOperation({ summary: 'Get team' })
  findOne(@OrgId() orgId: string, @Param('id') id: string) { return this.service.findOne(orgId, id); }

  @Patch(':id')
  @ApiOperation({ summary: 'Update team' })
  update(@OrgId() orgId: string, @Param('id') id: string, @Body() dto: UpdateTeamDto) { return this.service.update(orgId, id, dto); }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete team' })
  delete(@OrgId() orgId: string, @Param('id') id: string) { return this.service.delete(orgId, id); }

  @Post(':id/members')
  @ApiOperation({ summary: 'Add team member' })
  addMember(@OrgId() orgId: string, @Param('id') id: string, @Body() dto: AddTeamMemberDto) { return this.service.addMember(orgId, id, dto); }

  @Delete(':id/members/:userId')
  @ApiOperation({ summary: 'Remove team member' })
  removeMember(@OrgId() orgId: string, @Param('id') id: string, @Param('userId') userId: string) { return this.service.removeMember(orgId, id, userId); }
}
