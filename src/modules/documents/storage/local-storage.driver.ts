import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { StorageDriver, StoredFile } from './storage.types';

/**
 * Writes uploads to local disk under `uploads/<organizationId>/`.
 *
 * Suitable for development and single-node deployments. For multi-instance
 * production you want the S3 driver instead — local disk isn't shared between
 * containers and doesn't survive a redeploy.
 */
@Injectable()
export class LocalStorageDriver implements StorageDriver {
  private readonly logger = new Logger(LocalStorageDriver.name);
  private readonly uploadRoot: string;

  constructor(private readonly config: ConfigService) {
    this.uploadRoot = path.resolve(process.cwd(), 'uploads');
  }

  async save(
    file: Express.Multer.File,
    scope: { organizationId: string },
  ): Promise<StoredFile> {
    // The organizationId comes from the validated JWT/tenant context, not from
    // user input, but it's still normalised here so it can never contribute a
    // traversal segment to the path.
    const safeOrg = path.basename(scope.organizationId);

    // The client's filename is never used as the stored name — it's attacker
    // controlled and can contain traversal sequences, null bytes, or a
    // misleading double extension. We keep only the extension (validated
    // against a conservative pattern) and generate the name ourselves.
    const rawExt = path.extname(file.originalname).toLowerCase();
    const ext = /^\.[a-z0-9]{1,8}$/.test(rawExt) ? rawExt : '';
    const key = path.join(safeOrg, `${randomUUID()}${ext}`);
    const absolutePath = path.join(this.uploadRoot, key);

    // Defence in depth: confirm the resolved path is still inside uploadRoot.
    if (!absolutePath.startsWith(this.uploadRoot + path.sep)) {
      throw new InternalServerErrorException('Resolved upload path escaped the storage root');
    }

    try {
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, file.buffer);
    } catch (err) {
      this.logger.error(
        `Failed writing upload: ${err instanceof Error ? err.message : err}`,
      );
      throw new InternalServerErrorException('Could not store the uploaded file');
    }

    // PUBLIC_ASSETS_BASE_URL is the externally reachable origin (set when the
    // app sits behind a CDN/proxy); APP_URL is the fallback for local dev.
    const baseUrl =
      this.config.get<string>('agents.publicAssetsBaseUrl') ||
      this.config.get<string>('app.url') ||
      '';

    return {
      key,
      // Forward slashes regardless of platform — this becomes a URL.
      url: `${baseUrl}/uploads/${key.split(path.sep).join('/')}`,
      size: file.size,
      mimeType: file.mimetype,
      originalName: file.originalname,
    };
  }

  async delete(key: string): Promise<void> {
    const absolutePath = path.join(this.uploadRoot, key);
    if (!absolutePath.startsWith(this.uploadRoot + path.sep)) return;

    try {
      await fs.unlink(absolutePath);
    } catch (err: any) {
      // Already gone is a success from the caller's point of view.
      if (err?.code !== 'ENOENT') {
        this.logger.warn(`Failed deleting ${key}: ${err?.message ?? err}`);
      }
    }
  }
}
