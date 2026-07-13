import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsDateString, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { ProjectStatus, ProjectPriority, Currency } from '@prisma/client';

export class CreateProjectDto {
  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ enum: ProjectStatus }) @IsOptional() @IsEnum(ProjectStatus) status?: ProjectStatus;
  @ApiPropertyOptional({ enum: ProjectPriority }) @IsOptional() @IsEnum(ProjectPriority) priority?: ProjectPriority;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() budget?: number;
  @ApiPropertyOptional({ enum: Currency }) @IsOptional() @IsEnum(Currency) currency?: Currency;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() deadline?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() clientId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() teamId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isRecurring?: boolean;
}
export class UpdateProjectDto extends PartialType(CreateProjectDto) {
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() progress?: number;
}
export class AddProjectMemberDto {
  @ApiProperty() @IsString() @IsNotEmpty() userId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() role?: string;
}
export class CreateMilestoneDto {
  @ApiProperty() @IsString() @IsNotEmpty() title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dueDate?: string;
}
