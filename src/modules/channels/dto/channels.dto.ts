import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { PublishChannel } from '@prisma/client';

export class ConnectAccountDto {
  @ApiProperty({ enum: PublishChannel }) @IsEnum(PublishChannel) platform: PublishChannel;
  @ApiProperty({ description: 'Display name, e.g. @mycompany or company page name' })
  @IsString() @IsNotEmpty() accountName: string;
  @ApiPropertyOptional({ description: 'IG user id / LinkedIn org URN (urn:li:organization:123) / from-address' })
  @IsOptional() @IsString() externalId?: string;
  @ApiPropertyOptional({ description: 'OAuth access token (stored encrypted)' })
  @IsOptional() @IsString() accessToken?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() refreshToken?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() tokenExpiresAt?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() scopes?: string[];
}
