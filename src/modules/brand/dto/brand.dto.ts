import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class ImportBrandFromWebsiteDto {
  @ApiProperty({ description: 'Company website. Scheme optional — "acme.com" works.', example: 'https://acme.com' })
  @IsString()
  @IsNotEmpty()
  websiteUrl: string;

  @ApiPropertyOptional({
    description: 'Set false to preview the extraction without writing it to the profile.',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  save?: boolean;

  @ApiPropertyOptional({
    description: 'Replace fields that are already filled in. Off by default so human edits survive a re-import.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  overwrite?: boolean;
}

export class UpsertBrandProfileDto {
  @ApiProperty() @IsString() @IsNotEmpty() companyName: string;
  @ApiPropertyOptional() @IsOptional() @IsString() tagline?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() mission?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() industry?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() targetAudience?: string;
  @ApiPropertyOptional({ description: 'e.g. "professional but friendly, no jargon"' })
  @IsOptional() @IsString() toneOfVoice?: string;
  @ApiPropertyOptional({ description: "Do's and don'ts for generated content" })
  @IsOptional() @IsString() contentGuidelines?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() emailSignature?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() websiteUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() instagramHandle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() linkedinPage?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() brandColors?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() logoUrl?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() assetUrls?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() hashtagDefaults?: string[];
  @ApiPropertyOptional({ description: '{ "instagram": "daily", "linkedin": "weekdays", "blog": "weekly" }' })
  @IsOptional() @IsObject() postingCadence?: Record<string, string>;
}

export class UpdateBrandProfileDto extends PartialType(UpsertBrandProfileDto) {}
