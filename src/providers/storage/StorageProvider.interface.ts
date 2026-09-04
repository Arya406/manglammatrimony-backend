import { Readable } from "stream";

export interface UploadOptions {
  profileId: string;
  photoId: string;
  originalFileName: string;
  mimeType: string;
}

export interface StoredFileMetadata {
  storageKey: string;
  url: string;
  fileSize: number;
  mimeType: string;
}

export interface FileStreamResult {
  stream: Readable;
  mimeType: string;
  fileSize: number;
}

export interface StorageProvider {
  /**
   * Uploads raw file buffer into the underlying storage target.
   */
  upload(fileBuffer: Buffer, options: UploadOptions): Promise<StoredFileMetadata>;

  /**
   * Permanently removes the stored file identified by storageKey.
   */
  delete(storageKey: string): Promise<boolean>;

  /**
   * Resolves the access URL for the given photo storage key.
   */
  getUrl(storageKey: string, photoId?: string): string;

  /**
   * Checks if a file exists in the storage provider.
   */
  exists(storageKey: string): Promise<boolean>;

  /**
   * Retrieves a readable stream to securely serve the file.
   */
  getFileStream(storageKey: string): Promise<FileStreamResult | null>;
}
