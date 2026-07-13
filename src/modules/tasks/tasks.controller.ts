import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { TasksService } from './tasks.service';
import { CreateTaskDto, UpdateTaskDto, CreateTaskCommentDto, CreateChecklistItemDto, CreateTaskDependencyDto, BulkUpdateTasksDto, TaskQueryDto } from './dto/task.dto';
import { CurrentUser, OrgId } from '../../common/decorators';
import { TenantGuard } from '../../common/guards';

@ApiTags('Tasks')
@ApiBearerAuth()
@ApiHeader({ name: 'x-organization-id', required: true })
@UseGuards(TenantGuard)
@Controller('api/tasks')
export class TasksController {
  constructor(private readonly service: TasksService) {}

  @Post() @ApiOperation({ summary: 'Create task' })
  create(@OrgId() orgId: string, @CurrentUser('id') userId: string, @Body() dto: CreateTaskDto) { return this.service.create(orgId, userId, dto); }

  @Get() @ApiOperation({ summary: 'List tasks' })
  findAll(@OrgId() orgId: string, @Query() query: TaskQueryDto) { return this.service.findAll(orgId, query); }

  @Get('kanban/:projectId') @ApiOperation({ summary: 'Get Kanban board for project' })
  getKanban(@OrgId() orgId: string, @Param('projectId') projectId: string) { return this.service.getKanbanBoard(orgId, projectId); }

  @Get(':id') @ApiOperation({ summary: 'Get task with full details' })
  findOne(@OrgId() orgId: string, @Param('id') id: string) { return this.service.findOne(orgId, id); }

  @Patch(':id') @ApiOperation({ summary: 'Update task' })
  update(@OrgId() orgId: string, @Param('id') id: string, @Body() dto: UpdateTaskDto) { return this.service.update(orgId, id, dto); }

  @Delete(':id') @ApiOperation({ summary: 'Delete task' })
  delete(@OrgId() orgId: string, @Param('id') id: string) { return this.service.delete(orgId, id); }

  @Post('bulk-update') @ApiOperation({ summary: 'Bulk update tasks' })
  bulkUpdate(@OrgId() orgId: string, @Body() dto: BulkUpdateTasksDto) { return this.service.bulkUpdate(orgId, dto); }

  // ---- Comments ----
  @Post(':id/comments') @ApiOperation({ summary: 'Add comment' })
  addComment(@OrgId() orgId: string, @Param('id') id: string, @CurrentUser('id') userId: string, @Body() dto: CreateTaskCommentDto) { return this.service.addComment(orgId, id, userId, dto); }

  @Delete(':id/comments/:commentId') @ApiOperation({ summary: 'Delete comment' })
  deleteComment(@OrgId() orgId: string, @Param('id') id: string, @Param('commentId') commentId: string) { return this.service.deleteComment(orgId, id, commentId); }

  // ---- Checklist ----
  @Post(':id/checklist') @ApiOperation({ summary: 'Add checklist item' })
  addChecklist(@OrgId() orgId: string, @Param('id') id: string, @Body() dto: CreateChecklistItemDto) { return this.service.addChecklistItem(orgId, id, dto); }

  @Patch(':id/checklist/:itemId/toggle') @ApiOperation({ summary: 'Toggle checklist item' })
  toggleChecklist(@OrgId() orgId: string, @Param('id') id: string, @Param('itemId') itemId: string) { return this.service.toggleChecklistItem(orgId, id, itemId); }

  @Delete(':id/checklist/:itemId') @ApiOperation({ summary: 'Delete checklist item' })
  deleteChecklist(@OrgId() orgId: string, @Param('id') id: string, @Param('itemId') itemId: string) { return this.service.deleteChecklistItem(orgId, id, itemId); }

  // ---- Dependencies ----
  @Post(':id/dependencies') @ApiOperation({ summary: 'Add dependency' })
  addDep(@OrgId() orgId: string, @Param('id') id: string, @Body() dto: CreateTaskDependencyDto) { return this.service.addDependency(orgId, id, dto); }

  @Delete(':id/dependencies/:depId') @ApiOperation({ summary: 'Remove dependency' })
  removeDep(@OrgId() orgId: string, @Param('id') id: string, @Param('depId') depId: string) { return this.service.removeDependency(orgId, id, depId); }
}
