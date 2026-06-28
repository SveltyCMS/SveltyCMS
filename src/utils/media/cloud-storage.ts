/**
 * @file src/utils/media/cloud-storage.ts
 * @description Facade layer for cloud storage abstraction, delegating to StorageAdapter implementations.
 */

import { getPublicSettingSync } from "@src/services/core/settings-service";
import { getStorageAdapter, getConfig as getAdapterConfig } from "./storage-adapters";
import type { CloudStorageConfig } from "./storage-adapters";

export type { CloudStorageConfig };

export function getConfig(): CloudStorageConfig {
  return getAdapterConfig();
}

export function isCloud(): boolean {
  const type = getPublicSettingSync("MEDIA_STORAGE_TYPE");
  return type === "s3" || type === "r2" || type === "cloudinary";
}

export function getPath(relativePath: string, prefix?: string): string {
  const config = getConfig();
  const clean = relativePath.replace(/^\/+/, "");
  const p = prefix ? `${prefix}/${clean}` : clean;
  return config.mediaFolder ? `${config.mediaFolder}/${p}` : p;
}

export function getUrl(relativePath: string, prefix?: string): string {
  return getStorageAdapter().getUrl(relativePath, prefix);
}

export async function upload(
  data: Buffer | ReadableStream | import("node:stream").Readable,
  relativePath: string,
): Promise<string> {
  return getStorageAdapter().upload(data, relativePath);
}

export async function getMetadata(
  relativePath: string,
): Promise<{ etag?: string; size?: number; lastModified?: Date } | null> {
  return getStorageAdapter().getMetadata(relativePath);
}

export async function remove(relativePath: string): Promise<void> {
  return getStorageAdapter().remove(relativePath);
}

export async function exists(relativePath: string): Promise<boolean> {
  return getStorageAdapter().exists(relativePath);
}

export async function download(relativePath: string): Promise<Buffer> {
  return getStorageAdapter().download(relativePath);
}
