/**
 * @file src/utils/atomic-write.ts
 * @description Windows-safe atomic file writes (temp file + rename with retries).
 *
 * On Windows, `fs.rename(tmp, dest)` throws EPERM/EACCES/ENOENT when:
 * - dest is open by another process (AV, parallel Playwright workers)
 * - dest already exists and is locked
 * - concurrent renames race on the same path
 *
 * ### Features:
 * - unique temp filename (crypto.randomUUID)
 * - retry with backoff on EPERM/EACCES/EBUSY/ENOENT
 * - Windows fallback: unlink dest then rename, or copyFile + unlink tmp
 */

import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const RETRY_CODES = new Set(["EPERM", "EACCES", "EBUSY", "ENOENT", "EEXIST"]);

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * Atomically write UTF-8 content to `filePath`.
 * Creates parent directories as needed.
 */
export async function atomicWriteFile(
  filePath: string,
  content: string,
  options: { retries?: number } = {},
): Promise<void> {
  const retries = options.retries ?? 8;
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  const tmp = `${filePath}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, content, "utf-8");

  let lastErr: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    const outcome = await tryReplaceFile(tmp, filePath);
    if (outcome.kind === "ok") return;
    if (outcome.kind === "fatal") {
      await fs.unlink(tmp).catch(() => undefined);
      throw outcome.err;
    }
    lastErr = outcome.err;
    // Retryable failure — back off then continue loop
    await sleep(25 * (attempt + 1) + Math.floor(Math.random() * 20));
  }

  await fs.unlink(tmp).catch(() => undefined);
  throw lastErr instanceof Error ? lastErr : new Error(`atomicWriteFile failed for ${filePath}`);
}

type ReplaceOutcome =
  | { kind: "ok" }
  | { kind: "fatal"; err: unknown }
  | { kind: "retry"; err: unknown };

/** Single attempt: rename → unlink+rename → copyFile. */
async function tryReplaceFile(tmp: string, filePath: string): Promise<ReplaceOutcome> {
  try {
    await fs.rename(tmp, filePath);
    return { kind: "ok" };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (!code || !RETRY_CODES.has(code)) {
      return { kind: "fatal", err };
    }
  }

  try {
    await fs.unlink(filePath).catch(() => undefined);
    await fs.rename(tmp, filePath);
    return { kind: "ok" };
  } catch {
    /* try copy */
  }

  try {
    await fs.copyFile(tmp, filePath);
    await fs.unlink(tmp).catch(() => undefined);
    return { kind: "ok" };
  } catch (err) {
    return { kind: "retry", err };
  }
}

/** JSON.stringify + atomicWriteFile with pretty indent 2 by default. */
export async function atomicWriteJson(
  filePath: string,
  data: unknown,
  space: number | string = 2,
): Promise<void> {
  await atomicWriteFile(filePath, JSON.stringify(data, null, space));
}
