import fs from "fs";
import path from "path";
import { Readable } from "stream";
import {
  StorageProvider,
  UploadOptions,
  StoredFileMetadata,
  FileStreamResult,
} from "./StorageProvider.interface";
import { config } from "../../config/env";

export class LocalStorageProvider implements StorageProvider {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = path.resolve(
      process.cwd(),
      baseDir || config.photo.storageBasePath
    );
    this.ensureDirectoryExists(this.baseDir);
  }

  private ensureDirectoryExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  private getExtensionFromMime(mimeType: string): string {
    switch (mimeType) {
      case "image/jpeg":
        return ".jpg";
      case "image/png":
        return ".png";
      case "image/webp":
        return ".webp";
      default:
        return ".bin";
    }
  }

  private sanitizeFilename(fileName: string): string {
    return fileName
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/\.\.+/g, "_"); // prevent ..
  }

  private getSafeFilePath(storageKey: string): string {
    const normalizedKey = path.normalize(storageKey).replace(/^(\.\.(\/|\\|$))+/, "");
    const fullPath = path.resolve(this.baseDir, normalizedKey);

    // Guard against path traversal out of base directory
    if (!fullPath.startsWith(this.baseDir)) {
      throw new Error("Security violation: Attempted path traversal out of storage root.");
    }

    return fullPath;
  }

  async upload(
    fileBuffer: Buffer,
    options: UploadOptions
  ): Promise<StoredFileMetadata> {
    const { profileId, photoId, originalFileName, mimeType } = options;

    // Sanitize profileId and photoId
    const safeProfileId = this.sanitizeFilename(profileId);
    const safePhotoId = this.sanitizeFilename(photoId);
    const ext = this.getExtensionFromMime(mimeType);

    const relativeKey = path.join("profiles", safeProfileId, safePhotoId, `photo${ext}`).replace(/\\/g, "/");
    const targetFilePath = this.getSafeFilePath(relativeKey);
    const targetDir = path.dirname(targetFilePath);

    this.ensureDirectoryExists(targetDir);
    await fs.promises.writeFile(targetFilePath, fileBuffer);

    const url = this.getUrl(relativeKey, photoId);

    return {
      storageKey: relativeKey,
      url,
      fileSize: fileBuffer.length,
      mimeType,
    };
  }

  async delete(storageKey: string): Promise<boolean> {
    try {
      const filePath = this.getSafeFilePath(storageKey);
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);

        // Clean up empty parent directories up to profiles folder
        const photoDir = path.dirname(filePath);
        if (fs.existsSync(photoDir) && fs.readdirSync(photoDir).length === 0) {
          fs.rmdirSync(photoDir);
        }
        return true;
      }
      return false;
    } catch (error) {
      console.error("[LOCAL STORAGE DELETE ERROR]:", error);
      return false;
    }
  }

  getUrl(_storageKey: string, photoId?: string): string {
    const baseUrl = config.photo.storagePublicBaseUrl
      ? config.photo.storagePublicBaseUrl.replace(/\/+$/, "")
      : "";
    if (photoId) {
      return `${baseUrl}/api/profile/photos/${photoId}/file`;
    }
    return `${baseUrl}/api/profile/photos/file?key=${encodeURIComponent(_storageKey)}`;
  }

  async exists(storageKey: string): Promise<boolean> {
    try {
      const filePath = this.getSafeFilePath(storageKey);
      return fs.existsSync(filePath);
    } catch {
      return false;
    }
  }

  async getFileStream(storageKey: string): Promise<FileStreamResult | null> {
    try {
      const filePath = this.getSafeFilePath(storageKey);
      if (!fs.existsSync(filePath)) {
        return null;
      }

      const stat = await fs.promises.stat(filePath);
      const ext = path.extname(filePath).toLowerCase();
      let mimeType = "image/jpeg";
      if (ext === ".png") mimeType = "image/png";
      else if (ext === ".webp") mimeType = "image/webp";

      const stream = fs.createReadStream(filePath);

      return {
        stream,
        mimeType,
        fileSize: stat.size,
      };
    } catch (error) {
      console.error("[LOCAL STORAGE GET STREAM ERROR]:", error);
      return null;
    }
  }
}

export const defaultStorageProvider = new LocalStorageProvider();
