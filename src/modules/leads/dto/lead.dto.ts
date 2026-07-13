import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { LeadStage, LeadSource, Currency } from '@prisma/client';

export class CreateLeadDto {
  @ApiProperty() @IsString() @IsNotEmpty() companyName: string;
  @ApiProperty() @IsString() @IsNotEmpty() contactName: string;
  @ApiPropertyOptional() @IsOptional() @IsString() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() website?: string;
  @ApiPropertyOptional({ enum: LeadSource }) @IsOptional() @IsEnum(LeadSource) source?: LeadSource;
  @ApiPropertyOptional({ enum: LeadStage }) @IsOptional() @IsEnum(LeadStage) stage?: LeadStage;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() value?: number;
  @ApiPropertyOptional({ enum: Currency }) @IsOptional() @IsEnum(Currency) currency?: Currency;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() probability?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() expectedCloseDate?: string;
}
export class UpdateLeadDto extends PartialType(CreateLeadDto) {
  @ApiPropertyOptional() @IsOptional() @IsString() lostReason?: string;
}
export class CreateLeadActivityDto {
  @ApiProperty() @IsString() @IsNotEmpty() type: string;
  @ApiProperty() @IsString() @IsNotEmpty() title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() scheduledAt?: string;
}
