// ================ DOCUMENTS MODULE ================
import { Module, Injectable, Controller, NotFoundException, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsBoolean } from 'class-validator';
import { Get, Post, Delete, Body, Param, Query } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { PaginationDto } from '../../common/dto';
import { CurrentUser, OrgId } from '../../common/decorators';
import { TenantGuard } from '../../common/guards';
import { paginate } from '../../common/utils';
import { FileType } from '@prisma/client';

export class CreateFolderDto {
  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() parentId?: string;
}
export class UploadDocumentDto {
  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @IsString() @IsNotEmpty() fileUrl: string;
  @ApiProperty() fileSize: number;
  @ApiPropertyOptional({ enum: FileType }) @IsOptional() @IsEnum(FileType) fileType?: FileType;
  @ApiPropertyOptional() @IsOptional() @IsString() mimeType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() folderId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPublic?: boolean;
}

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async createFolder(orgId: string, dto: CreateFolderDto) {
    return this.prisma.folder.create({ data: { ...dto, organizationId: orgId } });
  }

  async getFolders(orgId: string, parentId?: string) {
    return this.prisma.folder.findMany({
      where: { organizationId: orgId, parentId: parentId || null },
      include: { _count: { select: { documents: true, subFolders: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async upload(orgId: string, userId: string, dto: UploadDocumentDto) {
    return this.prisma.document.create({ data: { ...dto, organizationId: orgId, uploadedById: userId } });
  }

  async findAll(orgId: string, query: PaginationDto & { folderId?: string }) {
    const where: any = { organizationId: orgId };
    if (query.search) where.name = { contains: query.search, mode: 'insensitive' };
    if (query.folderId) where.folderId = query.folderId;
    const [docs, total] = await Promise.all([
      this.prisma.document.findMany({ where, skip: query.skip, take: query.take, include: { uploadedBy: { select: { id: true, firstName: true, lastName: true } }, folder: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' } }),
      this.prisma.document.count({ where }),
    ]);
    return paginate(docs, total, query.page!, query.limit!);
  }

  async findOne(orgId: string, id: string) {
    const doc = await this.prisma.document.findFirst({ where: { id, organizationId: orgId }, include: { versions: { orderBy: { version: 'desc' } }, uploadedBy: { select: { id: true, firstName: true, lastName: true } }, folder: true } });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  async createVersion(orgId: string, id: string, fileUrl: string, fileSize: number, changeNote?: string) {
    const doc = await this.findOne(orgId, id);
    const newVersion = doc.version + 1;
    await this.prisma.documentVersion.create({ data: { documentId: id, version: newVersion, fileUrl, fileSize, changeNote } });
    return this.prisma.document.update({ where: { id }, data: { fileUrl, fileSize, version: newVersion } });
  }

  async delete(orgId: string, id: string) {
    await this.findOne(orgId, id);
    await this.prisma.document.delete({ where: { id } });
    return { message: 'Document deleted' };
  }
}

@ApiTags('Documents') @ApiBearerAuth()
@UseGuards(TenantGuard)
@Controller('api/documents')
export class DocumentsController {
  constructor(private readonly service: DocumentsService) {}

  @Post('folders') @ApiOperation({ summary: 'Create folder' })
  createFolder(@OrgId() orgId: string, @Body() dto: CreateFolderDto) { return this.service.createFolder(orgId, dto); }

  @Get('folders') @ApiOperation({ summary: 'List folders' })
  getFolders(@OrgId() orgId: string, @Query('parentId') parentId?: string) { return this.service.getFolders(orgId, parentId); }

  @Post() @ApiOperation({ summary: 'Upload document' })
  upload(@OrgId() orgId: string, @CurrentUser('id') userId: string, @Body() dto: UploadDocumentDto) { return this.service.upload(orgId, userId, dto); }

  @Get() @ApiOperation({ summary: 'List documents' })
  findAll(@OrgId() orgId: string, @Query() query: PaginationDto) { return this.service.findAll(orgId, query); }

  @Get(':id') @ApiOperation({ summary: 'Get document with versions' })
  findOne(@OrgId() orgId: string, @Param('id') id: string) { return this.service.findOne(orgId, id); }

  @Delete(':id') @ApiOperation({ summary: 'Delete document' })
  delete(@OrgId() orgId: string, @Param('id') id: string) { return this.service.delete(orgId, id); }
}

@Module({ controllers: [DocumentsController], providers: [DocumentsService], exports: [DocumentsService] })
export class DocumentsModule {}
