/**
 * @file src/utils/server/export-utils.ts
 * @description Shared utilities for data export and encryption, supporting multi-tenancy and security standards.
 */

import type { CollectionExport, ExportMetadata, ExportOptions, Schema } from "@src/content/types";
import { dbAdapter } from "@src/databases/db";
import { getAllSettings } from "@src/services/settings-service";
import { encryptData, decryptData } from "@utils/crypto";
import { logger } from "@utils/logger.server";
import { nanoid } from "nanoid";
import { getPrivateSettingSync } from "@src/services/settings-service";

// Sensitive field patterns
export const SENSITIVE_PATTERNS: string[] = [
  "PASSWORD",
  "SECRET",
  "TOKEN",
  "KEY",
  "CLIENT_SECRET",
  "PRIVATE_KEY",
  "JWT_SECRET",
  "ENCRYPTION_KEY",
  "API_KEY",
];

/**
 * Check if a field key is sensitive
 */
export function isSensitiveField(key: string): boolean {
  const upperKey = key.toUpperCase();
  return SENSITIVE_PATTERNS.some((pattern) => upperKey.includes(pattern));
}

/**
 * Encrypt data using AES-256-GCM with Argon2-derived key
 */
export async function encryptSensitiveData(
  data: Record<string, unknown>,
  password: string,
): Promise<string> {
  return encryptData(data, password);
}

/**
 * Decrypt data using AES-256-GCM with Argon2-derived key
 */
export async function decryptSensitiveData(
  encryptedData: string,
  password: string,
): Promise<Record<string, unknown>> {
  try {
    return await decryptData(encryptedData, password);
  } catch {
    throw new Error("Failed to decrypt sensitive data. Password may be incorrect.");
  }
}

/**
 * Export all settings, separating sensitive data (tenant-scoped)
 */
export async function exportSettings(
  options: ExportOptions,
  tenantId?: string,
): Promise<{
  settings: Record<string, unknown>;
  sensitive: Record<string, unknown>;
}> {
  logger.info(`Exporting settings for tenant: ${tenantId || "global"}`, {
    options,
  });

  // Passing tenantId to getAllSettings ensures we only get settings for this tenant
  const allSettings = await getAllSettings(tenantId);
  const settings: Record<string, unknown> = {};
  const sensitive: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(allSettings)) {
    if (isSensitiveField(key)) {
      if (options.includeSensitive) {
        sensitive[key] = value;
      }
    } else {
      settings[key] = value;
    }
  }

  return { settings, sensitive };
}

/**
 * Export collection schemas and data (tenant-scoped)
 */
export async function exportCollections(
  options: ExportOptions,
  availableCollections: Record<string, Schema>,
  tenantId?: string,
): Promise<CollectionExport[]> {
  logger.info(`Exporting collections for tenant: ${tenantId || "global"}`, {
    options,
  });

  const exportedCollections: CollectionExport[] = [];
  const isMultiTenant = getPrivateSettingSync("MULTI_TENANT");

  const targetCollections = options.collections
    ? Object.values(availableCollections).filter(
        (c) => c.name && options.collections?.includes(c.name),
      )
    : Object.values(availableCollections);

  for (const collection of targetCollections) {
    const collectionExport: CollectionExport = {
      id: collection._id || "",
      name: collection.name || "",
      label: collection.label || collection.name || "",
      fields: collection.fields,
      schema: collection,
      documents: [],
    };

    if (dbAdapter) {
      try {
        // ✨ ISOLATION: Explicitly pass tenantId to findMany options
        const result = await dbAdapter.crud.findMany(
          `collection_${collection._id}`,
          {},
          {
            tenantId: isMultiTenant ? (tenantId as any) : undefined,
          },
        );

        if (result.success) {
          collectionExport.documents = result.data as unknown as Record<string, unknown>[];
        }
      } catch (error) {
        logger.error(`Failed to export documents for collection ${collection.name}`, error);
      }
    }

    exportedCollections.push(collectionExport);
  }

  return exportedCollections;
}

/**
 * Create export metadata
 */
export function createExportMetadata(userId: string): ExportMetadata {
  return {
    exported_at: new Date().toISOString(),
    cms_version: process.env.npm_package_version || "unknown",
    environment: process.env.NODE_ENV || "development",
    exported_by: userId,
    export_id: nanoid(),
  };
}
