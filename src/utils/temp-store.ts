/**
 * @file src/utils/temp-store.ts
 * @description Simple file-based temporary store for large job payloads with TTL cleanup.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { generateUUID } from "@utils/native-utils";
import { logger } from "./logger.server";

const TEMP_DIR = path.join(process.cwd(), "tmp", "job-payloads");

/**
 * Ensures the temporary directory exists.
 */
async function ensureDir() {
  try {
    await fs.mkdir(TEMP_DIR, { recursive: true });
  } catch {
    // Ignore
  }
}

/**
 * Saves a payload to a temporary file and returns its ID.
 */
export async function saveTempPayload(data: any): Promise<string> {
  await ensureDir();
  const id = generateUUID();
  const filePath = path.join(TEMP_DIR, `${id}.json`);
  await fs.writeFile(filePath, JSON.stringify(data));
  return id;
}

/**
 * Retrieves a payload from the temporary store.
 */
export async function getTempPayload(id: string): Promise<any | null> {
  const filePath = path.join(TEMP_DIR, `${id}.json`);
  try {
    const data = await fs.readFile(filePath, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    logger.error(`[TempStore] Failed to read payload ${id}:`, err);
    return null;
  }
}

/**
 * Deletes a payload from the temporary store.
 */
export async function deleteTempPayload(id: string): Promise<void> {
  const filePath = path.join(TEMP_DIR, `${id}.json`);
  try {
    await fs.unlink(filePath);
  } catch {
    // Ignore
  }
}

/**
 * Cleans up payloads older than the specified TTL (default 1 hour).
 */
export async function cleanupTempStore(ttlMs = 3600000) {
  await ensureDir();
  const now = Date.now();
  try {
    const files = await fs.readdir(TEMP_DIR);
    for (const file of files) {
      const filePath = path.join(TEMP_DIR, file);
      const stats = await fs.stat(filePath);
      if (now - stats.mtimeMs > ttlMs) {
        await fs.unlink(filePath);
        logger.debug(`[TempStore] Cleaned up expired payload: ${file}`);
      }
    }
  } catch (err) {
    logger.error("[TempStore] Cleanup error:", err);
  }
}
