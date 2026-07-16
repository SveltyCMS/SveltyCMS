/**
 * @file src/utils/file-uploading.ts
 * @description File upload and directory management utilities.
 *
 * ### Features:
 * - Path traversal prevention via `path.resolve` + `startsWith` jail
 * - Streaming upload (Web Streams API + createWriteStream) for low memory usage
 * - Real progress tracking with incremental callbacks
 * - Safe filename sanitization with fallback for edge cases
 * - Idempotent directory creation and safe deletion with root guard
 */

import * as fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { publicEnv } from "@src/stores/global-settings.svelte.ts";
import { logger } from "@utils/logger";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

/**
 * Resolves a target directory against the base media folder and ensures
 * it does not escape the root directory (prevents path traversal attacks).
 */
function getSafeJailedPath(subFolder?: string): string {
  const baseMediaDir = path.resolve(process.cwd(), publicEnv.MEDIA_FOLDER);

  if (!subFolder || !subFolder.trim()) {
    return baseMediaDir;
  }

  // Resolve the target path and check if it starts with the base directory
  const targetPath = path.resolve(baseMediaDir, subFolder.trim());
  if (!targetPath.startsWith(baseMediaDir)) {
    throw new Error("Security Violation: Path traversal detected.");
  }

  return targetPath;
}

export async function uploadFile(
  file: File,
  folder?: string,
  onProgress?: (progress: number) => void,
) {
  if (!file || file.size === 0) {
    throw new Error("Invalid file provided.");
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File size exceeds maximum limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB.`);
  }

  try {
    const directoryPath = getSafeJailedPath(folder);
    await fs.mkdir(directoryPath, { recursive: true });

    // Sanitize filename and prevent entirely empty or dot-only filenames
    let safeFilename = file.name.replace(/[^a-zA-Z0-9\-_.]/g, "_");
    if (!safeFilename || /^\.+$/.test(safeFilename)) {
      safeFilename = `upload_${Date.now()}`;
    }

    const filePath = path.join(directoryPath, safeFilename);

    // Check if file exists without relying on throwing an error for control flow
    try {
      await fs.access(filePath);
      throw new Error(`File "${safeFilename}" already exists.`);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }

    // Stream the file instead of loading it entirely into RAM
    const writeStream = createWriteStream(filePath);
    const reader = file.stream().getReader();
    let bytesWritten = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      writeStream.write(value);
      bytesWritten += value.length;

      if (onProgress) {
        onProgress(Math.round((bytesWritten / file.size) * 100));
      }
    }

    // Ensure the stream is fully flushed and closed
    await new Promise<void>((resolve, reject) => {
      writeStream.end((err?: Error) => (err ? reject(err) : resolve()));
    });

    logger.info(`File saved successfully: ${filePath}`);
    return { success: true, path: filePath, filename: safeFilename };
  } catch (err) {
    logger.error("Error uploading file:", err);
    throw err;
  }
}

export async function createDirectory(relativePath: string) {
  if (typeof relativePath !== "string") {
    throw new Error("Folder path must be a string.");
  }

  try {
    const directoryPath = getSafeJailedPath(relativePath);

    // recursive: true makes this idempotent (won't fail if exists)
    await fs.mkdir(directoryPath, { recursive: true });

    logger.info(`Directory ensured: ${directoryPath}`);
    return { success: true, path: directoryPath };
  } catch (err) {
    logger.error("Error creating directory:", err);
    throw err;
  }
}

export async function deleteDirectory(folder: string, force = false) {
  if (!folder || !folder.trim()) {
    throw new Error("Folder name cannot be empty.");
  }

  try {
    const directoryPath = getSafeJailedPath(folder);

    // Optional guard: Prevent accidental deletion of the root media folder itself
    if (directoryPath === path.resolve(process.cwd(), publicEnv.MEDIA_FOLDER)) {
      throw new Error("Cannot delete the root media directory.");
    }

    await fs.access(directoryPath);
    await fs.rm(directoryPath, { recursive: force, force });

    logger.info(`Directory deleted: ${directoryPath}`);
    return { success: true, path: directoryPath };
  } catch (err) {
    logger.error("Error deleting directory:", err);
    throw err;
  }
}
