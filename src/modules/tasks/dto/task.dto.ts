import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsDateString, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { TaskStatus, TaskPriority } from '@prisma/client';

export class CreateTaskDto {
  @ApiProperty() @IsString() @IsNotEmpty() title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @IsString() @IsNotEmpty() projectId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() milestoneId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() parentTaskId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() assigneeId?: string;
  @ApiPropertyOptional({ enum: TaskStatus }) @IsOptional() @IsEnum(TaskStatus) status?: TaskStatus;
  @ApiPropertyOptional({ enum: TaskPriority }) @IsOptional() @IsEnum(TaskPriority) priority?: TaskPriority;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dueDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startDate?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() estimatedHours?: number;
}
export class UpdateTaskDto extends PartialType(CreateTaskDto) {
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() position?: number;
}
export class CreateTaskCommentDto {
  @ApiProperty() @IsString() @IsNotEmpty() content: string;
}
export class CreateChecklistItemDto {
  @ApiProperty() @IsString() @IsNotEmpty() title: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isCompleted?: boolean;
}
export class CreateTaskDependencyDto {
  @ApiProperty() @IsString() @IsNotEmpty() dependencyTaskId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() type?: string;
}
export class BulkUpdateTasksDto {
  @ApiProperty() taskIds: string[];
  @ApiPropertyOptional({ enum: TaskStatus }) @IsOptional() @IsEnum(TaskStatus) status?: TaskStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() assigneeId?: string;
  @ApiPropertyOptional({ enum: TaskPriority }) @IsOptional() @IsEnum(TaskPriority) priority?: TaskPriority;
}

import { PaginationDto } from '../../../common/dto';

export class TaskQueryDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiPropertyOptional({ enum: TaskStatus })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assigneeId?: string;
}

