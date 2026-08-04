// ================ DOCUMENTS MODULE ================
import {
  Module,
  Injectable,
  Controller,
  NotFoundException,
  BadRequestException,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Inject,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsNotEmpty, IsOptional, IsString, IsBooleanString } from 'class-validator';
import { Get, Post, Delete, Body, Param, Query } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { PaginationDto } from '../../common/dto';
import { CurrentUser, OrgId } from '../../common/decorators';
import { TenantGuard } from '../../common/guards';
import { paginate } from '../../common/utils';
import { FileType } from '@prisma/client';
import { LocalStorageDriver } from './storage/local-storage.driver';
import {
  StorageDriver,
  STORAGE_DRIVER,
  MAX_FILE_SIZE_BYTES,
  ALLOWED_MIME_TYPES,
  mimeToFileType,
} from './storage/storage.types';

export class CreateFolderDto {
  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() parentId?: string;
}

/**
 * Metadata accompanying a multipart upload.
 *
 * Everything about the *file itself* (size, MIME type, URL) is derived
 * server-side from the actual bytes received — the client only supplies
 * descriptive fields. Previously the client sent `fileUrl` and `fileSize`
 * directly, which meant "upload" was really "assert that a file exists
 * somewhere", with no validation possible.
 *
 * Note the fields are strings: multipart form fields always arrive as strings,
 * so a plain @IsBoolean() here would reject the literal "true" a browser sends.
 */
export class UploadDocumentMetaDto {
  @ApiPropertyOptional({ description: 'Defaults to the uploaded filename' })
  @IsOptional() @IsString() name?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() folderId?: string;

  @ApiPropertyOptional({ enum: ['true', 'false'] })
  @IsOptional() @IsBooleanString() isPublic?: string;
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
  ) {}

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

  /**
   * Persists an actual uploaded file, then records it.
   *
   * If the DB write fails after the bytes have landed, the stored object is
   * removed — otherwise every failed upload would leak an orphaned file that
   * nothing references and nothing ever cleans up.
   */
  async uploadFile(
    orgId: string,
    userId: string,
    file: Express.Multer.File,
    meta: UploadDocumentMetaDto,
  ) {
    if (meta.folderId) {
      const folder = await this.prisma.folder.findFirst({
        where: { id: meta.folderId, organizationId: orgId },
      });
      // Without this check a caller could file a document into another
      // organization's folder by guessing an ID.
      if (!folder) throw new NotFoundException('Folder not found');
    }

    const stored = await this.storage.save(file, { organizationId: orgId });

    try {
      return await this.prisma.document.create({
        data: {
          organizationId: orgId,
          uploadedById: userId,
          name: meta.name?.trim() || stored.originalName,
          description: meta.description,
          folderId: meta.folderId || undefined,
          isPublic: meta.isPublic === 'true',
          fileUrl: stored.url,
          fileSize: stored.size,
          mimeType: stored.mimeType,
          fileType: mimeToFileType(stored.mimeType) as FileType,
        },
      });
    } catch (err) {
      await this.storage.delete(stored.key);
      throw err;
    }
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

  /** Uploads a replacement file and bumps the version, keeping history. */
  async createVersion(
    orgId: string,
    id: string,
    file: Express.Multer.File,
    changeNote?: string,
  ) {
    const doc = await this.findOne(orgId, id);
    const stored = await this.storage.save(file, { organizationId: orgId });
    const newVersion = doc.version + 1;

    try {
      await this.prisma.documentVersion.create({
        data: {
          documentId: id,
          version: newVersion,
          fileUrl: stored.url,
          fileSize: stored.size,
          changeNote,
        },
      });
      return await this.prisma.document.update({
        where: { id },
        data: {
          fileUrl: stored.url,
          fileSize: stored.size,
          mimeType: stored.mimeType,
          version: newVersion,
        },
      });
    } catch (err) {
      await this.storage.delete(stored.key);
      throw err;
    }
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

  @Post()
  @ApiOperation({ summary: 'Upload a document (multipart/form-data)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        name: { type: 'string' },
        description: { type: 'string' },
        folderId: { type: 'string' },
        isPublic: { type: 'string', enum: ['true', 'false'] },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 },
      fileFilter: (_req, file, cb) => {
        // Rejected at the stream level so a disallowed type never gets fully
        // buffered into memory.
        if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
          return cb(
            new BadRequestException(`Unsupported file type: ${file.mimetype}`),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  upload(
    @OrgId() orgId: string,
    @CurrentUser('id') userId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() meta: UploadDocumentMetaDto,
  ) {
    if (!file) throw new BadRequestException('No file was uploaded');
    return this.service.uploadFile(orgId, userId, file, meta);
  }

  @Post(':id/versions')
  @ApiOperation({ summary: 'Upload a new version of an existing document' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        changeNote: { type: 'string' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
          return cb(
            new BadRequestException(`Unsupported file type: ${file.mimetype}`),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  createVersion(
    @OrgId() orgId: string,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('changeNote') changeNote?: string,
  ) {
    if (!file) throw new BadRequestException('No file was uploaded');
    return this.service.createVersion(orgId, id, file, changeNote);
  }

  @Get() @ApiOperation({ summary: 'List documents' })
  findAll(@OrgId() orgId: string, @Query() query: PaginationDto) { return this.service.findAll(orgId, query); }

  @Get(':id') @ApiOperation({ summary: 'Get document with versions' })
  findOne(@OrgId() orgId: string, @Param('id') id: string) { return this.service.findOne(orgId, id); }

  @Delete(':id') @ApiOperation({ summary: 'Delete document' })
  delete(@OrgId() orgId: string, @Param('id') id: string) { return this.service.delete(orgId, id); }
}

@Module({
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    // Swap this binding for an S3 driver in production — nothing else in the
    // module needs to change (see storage/storage.types.ts).
    { provide: STORAGE_DRIVER, useClass: LocalStorageDriver },
  ],
  exports: [DocumentsService],
})
export class DocumentsModule {}
