import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { Readable } from "stream";
import {
  StorageProvider,
  UploadOptions,
  StoredFileMetadata,
  FileStreamResult,
} from "./StorageProvider.interface";
import { config } from "../../config/env";

export class R2StorageProvider implements StorageProvider {
  private client: S3Client;
  private bucketName: string;
  private publicBaseUrl: string;

  constructor(client?: S3Client, bucketName?: string, publicBaseUrl?: string) {
    this.bucketName = bucketName || config.photo.r2.bucketName;
    this.publicBaseUrl = (publicBaseUrl ?? config.photo.r2.publicBaseUrl).replace(/\/+$/, "");

    if (client) {
      this.client = client;
    } else {
      const { accountId, accessKeyId, secretAccessKey } = config.photo.r2;
      this.client = new S3Client({
        region: "auto",
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
    }
  }

  private sanitizeIdentifier(id: string): string {
    return id.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/^_+|_+$/g, "");
  }

  getCanonicalKey(profileId: string, photoId: string): string {
    const safeProfileId = this.sanitizeIdentifier(profileId);
    const safePhotoId = this.sanitizeIdentifier(photoId);
    return `profiles/${safeProfileId}/photos/${safePhotoId}/display.webp`;
  }

  async upload(
    fileBuffer: Buffer,
    options: UploadOptions
  ): Promise<StoredFileMetadata> {
    const { profileId, photoId, mimeType } = options;
    const storageKey = this.getCanonicalKey(profileId, photoId);

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: storageKey,
      Body: fileBuffer,
      ContentType: mimeType,
      CacheControl: "public, max-age=31536000, immutable",
    });

    try {
      await this.client.send(command);
    } catch (err) {
      console.error(
        `[R2 UPLOAD ERROR] Failed to upload object ${storageKey} to bucket ${this.bucketName}:`,
        err instanceof Error ? err.message : err
      );
      throw err;
    }

    const url = this.getUrl(storageKey, photoId);

    return {
      storageKey,
      url,
      fileSize: fileBuffer.length,
      mimeType,
    };
  }

  async delete(storageKey: string): Promise<boolean> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: storageKey,
    });

    try {
      await this.client.send(command);
      return true;
    } catch (err) {
      console.error(
        `[R2 DELETE ERROR] Failed to delete object ${storageKey}:`,
        err instanceof Error ? err.message : err
      );
      return false;
    }
  }

  getUrl(storageKey: string, photoId?: string): string {
    if (this.publicBaseUrl) {
      return `${this.publicBaseUrl}/${storageKey}`;
    }
    if (photoId) {
      return `/api/profile/photos/${photoId}/file`;
    }
    return `/api/profile/photos/file?key=${encodeURIComponent(storageKey)}`;
  }

  async exists(storageKey: string): Promise<boolean> {
    const command = new HeadObjectCommand({
      Bucket: this.bucketName,
      Key: storageKey,
    });

    try {
      await this.client.send(command);
      return true;
    } catch (err: any) {
      if (err?.$metadata?.httpStatusCode === 404 || err?.name === "NotFound" || err?.name === "NoSuchKey") {
        return false;
      }
      // For any unexpected errors, log safely and return false
      return false;
    }
  }

  async getFileStream(storageKey: string): Promise<FileStreamResult | null> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: storageKey,
    });

    try {
      const response = await this.client.send(command);
      if (!response.Body) {
        return null;
      }

      return {
        stream: response.Body as Readable,
        mimeType: response.ContentType || "image/webp",
        fileSize: response.ContentLength || 0,
      };
    } catch (err: any) {
      if (err?.$metadata?.httpStatusCode === 404 || err?.name === "NoSuchKey" || err?.name === "NotFound") {
        return null;
      }
      console.error(
        `[R2 GET_STREAM ERROR] Failed to stream object ${storageKey}:`,
        err instanceof Error ? err.message : err
      );
      return null;
    }
  }
}
