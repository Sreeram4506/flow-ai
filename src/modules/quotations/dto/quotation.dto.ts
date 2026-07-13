import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsArray, IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { Currency, QuotationStatus } from '@prisma/client';

export class QuotationItemDto {
  @ApiProperty() @IsString() @IsNotEmpty() description: string;
  @ApiProperty() @Type(() => Number) @IsNumber() quantity: number;
  @ApiProperty() @Type(() => Number) @IsNumber() unitPrice: number;
}
export class CreateQuotationDto {
  @ApiProperty() @IsString() @IsNotEmpty() clientId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() projectId?: string;
  @ApiPropertyOptional({ enum: Currency }) @IsOptional() @IsEnum(Currency) currency?: Currency;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() taxRate?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() discountRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() validUntil?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() terms?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiProperty({ type: [QuotationItemDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => QuotationItemDto) items: QuotationItemDto[];
}
export class UpdateQuotationDto extends PartialType(CreateQuotationDto) {
  @ApiPropertyOptional({ enum: QuotationStatus }) @IsOptional() @IsEnum(QuotationStatus) status?: QuotationStatus;
}
