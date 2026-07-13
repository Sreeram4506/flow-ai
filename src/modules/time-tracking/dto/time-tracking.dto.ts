import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class StartTimerDto {
  @ApiPropertyOptional() @IsOptional() @IsString() taskId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() projectId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isBillable?: boolean;
}
export class StopTimerDto {
  @ApiProperty() @IsString() @IsNotEmpty() entryId: string;
}
export class ManualTimeEntryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() taskId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() projectId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @IsDateString() startTime: string;
  @ApiProperty() @IsDateString() endTime: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isBillable?: boolean;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() hourlyRate?: number;
}
