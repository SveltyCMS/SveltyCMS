/**
 * @file src/utils/server-utils.ts
 * @description Hardened server-side utilities for filesystem management.
 *
 * ### Hardening (audit 2026-07):
 * - Path traversal protection: resolved path must start with process.cwd()
 * - Iterative DFS: stack-based walk replaces recursion (no call stack limit)
 * - O(1) ignored file lookup: Set instead of Array.includes()
 * - Fail-safe on error: assumes conflict when fs is uncertain (prevents overwrites)
 *
 * This file contains utilities that should only be used on the server-side,
 * as they depend on Node.js modules like 'fs' and 'path'.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "@utils/logger";

interface CollectionNameCheck {
  conflictPath?: string;
  exists: boolean;
  suggestions?: string[];
}

/**
 * Checks for collection name conflicts with optimized path resolution.
 */
export async function checkCollectionNameConflict(
  name: string,
  collectionsPath: string,
): Promise<CollectionNameCheck> {
  try {
    // 🛡️ Security: Resolve to absolute path and verify no directory traversal
    const root = path.resolve(process.cwd(), collectionsPath);

    // Validate that the resolved path is actually inside the working directory
    if (!root.startsWith(process.cwd())) {
      throw new Error("Invalid path: Directory traversal attempt detected.");
    }

    const files = await getAllCollectionFiles(root);
    const existingNames = new Set<string>();
    let conflictPath: string | undefined;

    for (const file of files) {
      const fileName = path.basename(file, ".ts");
      if (fileName === name) {
        conflictPath = path.relative(process.cwd(), file);
      }
      existingNames.add(fileName);
    }

    if (conflictPath) {
      return {
        exists: true,
        suggestions: generateNameSuggestions(name, existingNames),
        conflictPath,
      };
    }

    return { exists: false };
  } catch (error) {
    logger.error("Error checking collection name:", error);
    // Fail-safe: assume conflict if filesystem state is uncertain
    return { exists: true };
  }
}

/**
 * 🚀 Performance: Iterative depth-first search avoids recursion depth limits
 * and minimizes stack overhead on large directory trees.
 */
async function getAllCollectionFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const stack = [dir];

  // O(1) lookup via Set instead of O(N) Array.includes()
  const IGNORED_FILES = new Set(["index.ts", "types.ts", "ContentManager.ts", "ContentSystem.ts"]);

  while (stack.length > 0) {
    const currentDir = stack.pop()!;
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (
        entry.isFile() &&
        entry.name.endsWith(".ts") &&
        !entry.name.startsWith("_") &&
        !IGNORED_FILES.has(entry.name)
      ) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function generateNameSuggestions(name: string, existingNames: Set<string>): string[] {
  const suggestions: string[] = [];

  // Limited search space — 3 numbered variants
  for (let i = 1; i <= 3; i++) {
    const suggestion = `${name}${i}`;
    if (!existingNames.has(suggestion)) suggestions.push(suggestion);
  }

  // Common prefixes
  const common = ["New", "Alt"];
  for (const p of common) {
    const suggestion = `${p}${name}`;
    if (!existingNames.has(suggestion)) suggestions.push(suggestion);
  }

  return suggestions.slice(0, 3);
}
