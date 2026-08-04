import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ContentType, PublishChannel } from '@prisma/client';

export class CreateContentDto {
  @ApiProperty({ enum: PublishChannel }) @IsEnum(PublishChannel) channel: PublishChannel;
  @ApiProperty({ enum: ContentType }) @IsEnum(ContentType) type: ContentType;
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() caption?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() body?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() imageUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() imagePrompt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() videoUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() videoPrompt?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() hashtags?: string[];
  @ApiPropertyOptional() @IsOptional() @IsDateString() scheduledFor?: string;
}

export class UpdateContentDto extends PartialType(CreateContentDto) {}

export class GenerateContentDto {
  @ApiProperty({ enum: PublishChannel }) @IsEnum(PublishChannel) channel: PublishChannel;
  @ApiProperty({ description: 'Topic or theme for the post' }) @IsString() @IsNotEmpty() topic: string;
  @ApiPropertyOptional({ description: 'Generate an image too (default true for Instagram)' })
  @IsOptional() @IsBoolean() withImage?: boolean;
  @ApiPropertyOptional({ description: 'Generate a video via Veo instead of a still image. Slower (1-3 min).' })
  @IsOptional() @IsBoolean() withVideo?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsDateString() scheduledFor?: string;
}
