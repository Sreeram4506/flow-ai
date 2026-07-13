import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { ProjectsService } from './projects.service';
import { CreateProjectDto, UpdateProjectDto, AddProjectMemberDto, CreateMilestoneDto } from './dto/project.dto';
import { PaginationDto } from '../../common/dto';
import { CurrentUser, OrgId } from '../../common/decorators';
import { TenantGuard } from '../../common/guards';

@ApiTags('Projects')
@ApiBearerAuth()
@ApiHeader({ name: 'x-organization-id', required: true })
@UseGuards(TenantGuard)
@Controller('api/projects')
export class ProjectsController {
  constructor(private readonly service: ProjectsService) {}

  @Post() @ApiOperation({ summary: 'Create project' })
  create(@OrgId() orgId: string, @CurrentUser('id') userId: string, @Body() dto: CreateProjectDto) { return this.service.create(orgId, userId, dto); }

  @Get() @ApiOperation({ summary: 'List projects' })
  findAll(@OrgId() orgId: string, @Query() query: PaginationDto) { return this.service.findAll(orgId, query); }

  @Get(':id') @ApiOperation({ summary: 'Get project' })
  findOne(@OrgId() orgId: string, @Param('id') id: string) { return this.service.findOne(orgId, id); }

  @Patch(':id') @ApiOperation({ summary: 'Update project' })
  update(@OrgId() orgId: string, @Param('id') id: string, @Body() dto: UpdateProjectDto) { return this.service.update(orgId, id, dto); }

  @Delete(':id') @ApiOperation({ summary: 'Archive project' })
  delete(@OrgId() orgId: string, @Param('id') id: string) { return this.service.delete(orgId, id); }

  @Get(':id/stats') @ApiOperation({ summary: 'Get project stats' })
  getStats(@OrgId() orgId: string, @Param('id') id: string) { return this.service.getProjectStats(orgId, id); }

  @Post(':id/members') @ApiOperation({ summary: 'Add project member' })
  addMember(@OrgId() orgId: string, @Param('id') id: string, @Body() dto: AddProjectMemberDto) { return this.service.addMember(orgId, id, dto); }

  @Delete(':id/members/:userId') @ApiOperation({ summary: 'Remove project member' })
  removeMember(@OrgId() orgId: string, @Param('id') id: string, @Param('userId') userId: string) { return this.service.removeMember(orgId, id, userId); }

  @Post(':id/milestones') @ApiOperation({ summary: 'Add milestone' })
  addMilestone(@OrgId() orgId: string, @Param('id') id: string, @Body() dto: CreateMilestoneDto) { return this.service.addMilestone(orgId, id, dto); }

  @Patch(':id/milestones/:milestoneId/complete') @ApiOperation({ summary: 'Complete milestone' })
  completeMilestone(@OrgId() orgId: string, @Param('id') id: string, @Param('milestoneId') mId: string) { return this.service.completeMilestone(orgId, id, mId); }

  @Delete(':id/milestones/:milestoneId') @ApiOperation({ summary: 'Delete milestone' })
  deleteMilestone(@OrgId() orgId: string, @Param('id') id: string, @Param('milestoneId') mId: string) { return this.service.deleteMilestone(orgId, id, mId); }
}
