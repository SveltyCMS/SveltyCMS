/**
 * @file src/utils/media/cloud-storage.ts
 * @description Facade layer for cloud storage abstraction, delegating to StorageAdapter implementations.
 */

import { getPublicSettingSync } from "@src/services/core/settings-service";
import { getStorageAdapter, getPath as adapterGetPath, getConfig } from "./storage-adapters";
import type { CloudStorageConfig } from "./storage-adapters";

export type { CloudStorageConfig };

export function isCloud(): boolean {
  const type = getPublicSettingSync("MEDIA_STORAGE_TYPE");
  return type !== "local";
}

export function getPath(relativePath: string, prefix?: string): string {
  return adapterGetPath(getConfig(), relativePath, prefix);
}

export function getUrl(relativePath: string, prefix?: string): string {
  return getStorageAdapter().getUrl(relativePath, prefix);
}
