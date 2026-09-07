import { StorageProvider } from "./StorageProvider.interface";
import { LocalStorageProvider, defaultStorageProvider } from "./LocalStorageProvider";
import { R2StorageProvider } from "./R2StorageProvider";
import { config } from "../../config/env";

export * from "./StorageProvider.interface";
export { LocalStorageProvider, defaultStorageProvider } from "./LocalStorageProvider";
export { R2StorageProvider } from "./R2StorageProvider";

let r2Instance: R2StorageProvider | null = null;

export function getR2StorageProvider(): R2StorageProvider {
  if (!r2Instance) {
    r2Instance = new R2StorageProvider();
  }
  return r2Instance;
}

export function getStorageProvider(providerType?: string): StorageProvider {
  const activeType = (providerType || config.photo.storageProvider || "local").toLowerCase();
  if (activeType === "r2") {
    return getR2StorageProvider();
  }
  return defaultStorageProvider;
}

/**
 * Resolves a public URL for a photo record based on its storage provider.
 * If stored in R2 and CDN base URL is configured, returns direct CDN URL.
 * Otherwise, returns the backend endpoint `/api/profile/photos/:id/file`.
 */
export function resolvePhotoPublicUrl(
  storageKey: string,
  photoId: string,
  storageProviderType: string = "local"
): string {
  if (storageProviderType === "r2" && config.photo.r2.publicBaseUrl) {
    return `${config.photo.r2.publicBaseUrl}/${storageKey}`;
  }

  const baseUrl = config.photo.storagePublicBaseUrl
    ? config.photo.storagePublicBaseUrl.replace(/\/+$/, "")
    : "";
  return `${baseUrl}/api/profile/photos/${photoId}/file`;
}
