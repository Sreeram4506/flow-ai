/**
 * Storage abstraction for uploaded files.
 *
 * The app previously had no server-side file handling at all — the "upload"
 * endpoint took a `fileUrl` string from the client and trusted it. This
 * interface is the seam that lets the local-disk driver (works out of the box,
 * good for dev and single-node deploys) and an S3 driver (for real
 * deployments) be swapped without the documents module knowing which is live.
 */
export interface StoredFile {
  /** Key/path used to retrieve or delete the object later. */
  key: string;
  /** URL the client can fetch. Absolute for S3, app-relative for local disk. */
  url: string;
  size: number;
  mimeType: string;
  originalName: string;
}

export interface StorageDriver {
  save(file: Express.Multer.File, scope: { organizationId: string }): Promise<StoredFile>;
  delete(key: string): Promise<void>;
}

export const STORAGE_DRIVER = Symbol('STORAGE_DRIVER');

/**
 * Upload constraints.
 *
 * MIME types are allow-listed rather than deny-listed: a deny-list is a
 * losing game (svg carries script, html carries script, and browsers sniff
 * aggressively). Anything not on this list is refused.
 */
export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

export const ALLOWED_MIME_TYPES: readonly string[] = [
  // Images — note: image/svg+xml is deliberately excluded. SVG is an XML
  // document that can carry <script>, so serving one from our own origin is
  // a stored-XSS vector.
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  // Archives
  'application/zip',
  'application/x-zip-compressed',
];

/** Maps a MIME type onto the Prisma FileType enum for display/filtering. */
export function mimeToFileType(mime: string):
  | 'IMAGE'
  | 'PDF'
  | 'SPREADSHEET'
  | 'PRESENTATION'
  | 'DOCUMENT'
  | 'ARCHIVE'
  | 'VIDEO'
  | 'AUDIO'
  | 'OTHER' {
  if (mime.startsWith('image/')) return 'IMAGE';
  if (mime.startsWith('video/')) return 'VIDEO';
  if (mime.startsWith('audio/')) return 'AUDIO';
  if (mime === 'application/pdf') return 'PDF';
  if (mime.includes('spreadsheet') || mime.includes('excel') || mime === 'text/csv') {
    return 'SPREADSHEET';
  }
  if (mime.includes('presentation') || mime.includes('powerpoint')) return 'PRESENTATION';
  if (mime.includes('word') || mime === 'text/plain') return 'DOCUMENT';
  if (mime.includes('zip')) return 'ARCHIVE';
  return 'OTHER';
}
