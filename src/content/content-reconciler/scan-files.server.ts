/**
 * @file src/content/content-reconciler/scan-files.ts
 * @description
 * High-performance filesystem scanner for content collection definitions.
 * Supports both development (.ts) and production (.js) modes.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { building, dev } from "$app/environment";
import { logger } from "@utils/logger.server";
import type { Schema } from "../types";
import { processModule } from "../module-processor.server";

/**
 * Scans the configured directory for collection definition files.
 * Uses recursive scanning and parallel processing.
 */
export async function scanAndProcessFiles(): Promise<Schema[]> {
  // 1. Determine target directory
  const collectionsDir =
    dev || building
      ? path.resolve(process.cwd(), "config/collections")
      : path.resolve(process.cwd(), ".compiledCollections");

  const extension = dev || building ? ".ts" : ".js";

  logger.info(`🔍 Scanning collections in: ${collectionsDir} (ext: ${extension})`);

  try {
    await fs.access(collectionsDir);
  } catch {
    logger.warn(`Directory not found: ${collectionsDir}. Initializing with empty structure.`);
    return [];
  }

  // 2. Recursively get all collection files
  const files = await recursivelyGetFiles(collectionsDir, extension);

  // 3. Process modules in parallel
  const schemaPromises = files.map(async (filePath) => {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const moduleData = await processModule(content);

      if (!moduleData?.schema) return null;

      const schema = moduleData.schema;
      const relativePath = path.relative(collectionsDir, filePath);
      const cleanPath =
        "/" +
        relativePath
          .replace(new RegExp(`\\${extension}$`), "")
          .split(path.sep)
          .join("/");

      const name = schema.name || path.basename(filePath, extension);
      return {
        ...schema,
        _id: schema._id || name,
        path: cleanPath,
        name: name,
      } as Schema;
    } catch (error) {
      logger.warn(`Failed to process collection file: ${filePath}`, error);
      return null;
    }
  });

  const results = await Promise.all(schemaPromises);
  return results.filter((s): s is Schema => s !== null);
}

/**
 * Helper: Recursively lists files with a specific extension.
 */
async function recursivelyGetFiles(dir: string, ext: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await recursivelyGetFiles(fullPath, ext)));
      } else if (entry.isFile() && entry.name.endsWith(ext)) {
        files.push(fullPath);
      }
    }),
  );

  return files;
}

/**
 * Legacy compatibility: Proxy for scanAndProcessFiles used in setup and migrations.
 */
export async function scanCompiledCollections(): Promise<Schema[]> {
  return scanAndProcessFiles();
}
