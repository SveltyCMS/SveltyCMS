/**
 * @file src/services/media/tus-upload.server.ts
 * @description Durable, resumable upload sessions implementing the TUS 1.0.0
 * creation + termination extensions for the media pipeline.
 *
 * ### Design
 * - **Durable spool, storage-agnostic.** Chunks append to a local spool file and
 *   session metadata is written atomically (`*.json.tmp` → rename). The
 *   completed spool is handed to the normal `MediaService` ingestion path, so
 *   dedupe, MIME sniffing, derivative ladders and tenant scoping all still run
 *   exactly once — TUS only changes how bytes reach the server.
 * - **No client-chosen paths.** The session id is server-generated CSPRNG; the
 *   spool never participates in storage paths, so traversal is impossible.
 * - **Ownership-bound continuation.** `HEAD`/`PATCH`/`DELETE` require an
 *   HMAC-signed token covering `(sessionId, tenantId, userId)` plus an
 *   authenticated caller. A leaked Location cannot be replayed by another user
 *   or tenant.
 * - **Per-session serialization.** Concurrent PATCHes for one upload are
 *   serialized in-process; a mismatched `Upload-Offset` returns `409` with the
 *   expected offset instead of corrupting the spool.
 * - **Bounded.** `Upload-Length` is capped at `API_MAX_BODY_SIZE_BYTES` (the
 *   same ceiling every other upload path obeys); sessions expire after 24 h.
 *
 * Features:
 * - `createTusSession()` / `getTusSession()` / `appendTusChunk()`
 * - `finalizeTusSession()` / `deleteTusSession()` / `cleanupExpiredTusSessions()`
 * - `parseTusMetadata()` / `serializeTusMetadata()`
 * - `signTusToken()` / `verifyTusToken()`
 */

import { randomUUID } from "node:crypto";
import {
  appendFile,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { API_MAX_BODY_SIZE_BYTES } from "@utils/api-body-limits";
import { raise } from "@utils/error-handling";
import { getPrivateSettingSync } from "@src/services/core/settings-service";
import { signHmacToken, verifyHmacToken } from "@utils/server/hmac-token.server";
import { isAllowedUploadMime } from "@utils/media/media-utils";
import { dateToISODateString, nowISODateString } from "@utils/date";
import type { ISODateString } from "@src/content/types";

export const TUS_VERSION = "1.0.0";
export const TUS_EXTENSIONS = ["creation", "termination"] as const;
export const TUS_MAX_BYTES = API_MAX_BODY_SIZE_BYTES;
export const TUS_PATCH_CONTENT_TYPE = "application/offset+octet-stream";
export const TUS_DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const TUS_TOKEN_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_METADATA_BYTES = 8 * 1024;
const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TusSession {
  id: string;
  tenantId: string;
  userId: string;
  filename: string;
  mimeType: string;
  size: number;
  offset: number;
  folder: string;
  access: "public" | "private";
  createdAt: ISODateString;
  updatedAt: ISODateString;
  expiresAt: ISODateString;
  finalized: boolean;
  mediaId?: string;
}

export interface TusCreateInput {
  tenantId: string;
  userId: string;
  filename: string;
  mimeType: string;
  size: number;
  folder?: string;
  access?: "public" | "private";
}

export class TusError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = "TUS_ERROR",
    public readonly expectedOffset?: number,
  ) {
    super(message);
    this.name = "TusError";
  }
}

// ─── Spool ────────────────────────────────────────────────────────────────

function spoolDir(): string {
  return process.env.TUS_SPOOL_DIR || path.join(os.tmpdir(), "sveltycms-tus");
}

async function ensureSpoolDir(): Promise<string> {
  const dir = spoolDir();
  await mkdir(dir, { recursive: true });
  return dir;
}

function assertSessionId(id: string): void {
  if (!SESSION_ID_RE.test(id)) {
    raise(400, "Invalid upload id", "TUS_INVALID_ID");
  }
}

function sessionPath(id: string): string {
  return path.join(spoolDir(), `${id}.json`);
}

function partPath(id: string): string {
  return path.join(spoolDir(), `${id}.part`);
}

async function writeSession(session: TusSession): Promise<void> {
  const target = sessionPath(session.id);
  const tmp = `${target}.tmp`;
  await writeFile(tmp, JSON.stringify(session), "utf8");
  await rename(tmp, target);
}

async function readSessionFile(id: string): Promise<TusSession | null> {
  try {
    const raw = await readFile(sessionPath(id), "utf8");
    return JSON.parse(raw) as TusSession;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw err;
  }
}

// ─── Metadata ─────────────────────────────────────────────────────────────

/** Decode a TUS `Upload-Metadata` header (`key base64value,key base64value`). */
export function parseTusMetadata(header: string | null): Record<string, string> {
  if (!header) return {};
  if (Buffer.byteLength(header, "utf8") > MAX_METADATA_BYTES) {
    throw new TusError(413, "Upload-Metadata header is too large", "TUS_METADATA_TOO_LARGE");
  }
  const out: Record<string, string> = {};
  for (const entry of header.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const space = trimmed.indexOf(" ");
    const key = space === -1 ? trimmed : trimmed.slice(0, space);
    if (!key || !/^[a-zA-Z0-9_.-]{1,64}$/.test(key)) continue;
    if (space === -1) {
      out[key] = "";
      continue;
    }
    try {
      out[key] = Buffer.from(trimmed.slice(space + 1), "base64").toString("utf8");
    } catch {
      out[key] = "";
    }
  }
  return out;
}

/** Encode a metadata map for a client-side TUS creation request. */
export function serializeTusMetadata(metadata: Record<string, string>): string {
  return Object.entries(metadata)
    .map(([key, value]) =>
      value ? `${key} ${Buffer.from(value, "utf8").toString("base64")}` : key,
    )
    .join(",");
}

/**
 * Strip path separators, control characters, and Windows reserved names. The
 * filename is display data only (the spool uses the session id), but it is
 * forwarded to `MediaService`, so it must already be safe at creation time.
 */
export function sanitizeTusFilename(raw: string | undefined): string {
  const base = (raw ?? "upload")
    .replace(/\\/g, "/")
    .split("/")
    .pop()!
    // eslint-disable-next-line no-control-regex -- strip control characters from user filenames
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>:"|?*]/g, "_")
    .trim();
  const safe = base && base !== "." && base !== ".." ? base : "upload";
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(safe)) return `file-${safe}`;
  return safe.slice(0, 200);
}

// ─── Tokens ───────────────────────────────────────────────────────────────

function tokenSecret(): string {
  const secret = getPrivateSettingSync("JWT_SECRET_KEY") || process.env.JWT_SECRET_KEY;
  if (!secret) {
    raise(503, "Resumable uploads are unavailable: signing secret missing", "TUS_SECRET_MISSING");
  }
  return String(secret);
}

export function signTusToken(sessionId: string, tenantId: string, userId: string): string {
  return signHmacToken(
    "tus",
    [sessionId, tenantId, userId],
    Date.now() + TUS_TOKEN_TTL_MS,
    tokenSecret(),
  );
}

export function verifyTusToken(
  sessionId: string,
  tenantId: string,
  userId: string,
  token: string | null,
): boolean {
  return verifyHmacToken(
    token,
    "tus",
    [sessionId, tenantId, userId],
    TUS_TOKEN_TTL_MS,
    tokenSecret(),
  );
}

// ─── Session lifecycle ────────────────────────────────────────────────────

const sessionTails = new Map<string, Promise<unknown>>();

/** Serialize work for one upload id (in-process). */
async function withSessionLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const previous = sessionTails.get(id) ?? Promise.resolve();
  const run = previous.then(fn, fn);
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  sessionTails.set(id, tail);
  try {
    return await run;
  } finally {
    if (sessionTails.get(id) === tail) sessionTails.delete(id);
  }
}

/** Delete expired sessions and their spools. Best-effort; never throws. */
export async function cleanupExpiredTusSessions(now = nowISODateString()): Promise<number> {
  let removed = 0;
  try {
    const dir = await ensureSpoolDir();
    for (const entry of await readdir(dir)) {
      if (!entry.endsWith(".json")) continue;
      const id = entry.slice(0, -5);
      if (!SESSION_ID_RE.test(id)) continue;
      try {
        const session = await readSessionFile(id);
        if (!session || session.expiresAt <= now) {
          await rm(sessionPath(id), { force: true });
          await rm(partPath(id), { force: true });
          removed++;
        }
      } catch {
        // A concurrent request may have removed it already.
      }
    }
  } catch {
    // Spool may not exist yet.
  }
  return removed;
}

export async function createTusSession(input: TusCreateInput): Promise<TusSession> {
  const filename = sanitizeTusFilename(input.filename);
  if (!Number.isInteger(input.size) || input.size <= 0) {
    throw new TusError(400, "Upload-Length must be a positive integer", "TUS_INVALID_LENGTH");
  }
  if (input.size > TUS_MAX_BYTES) {
    throw new TusError(413, `Upload exceeds the ${TUS_MAX_BYTES} byte limit`, "TUS_TOO_LARGE");
  }
  const mimeType = (input.mimeType || "application/octet-stream").split(";")[0]!.trim();
  if (mimeType !== "application/octet-stream" && !isAllowedUploadMime(mimeType)) {
    throw new TusError(415, `MIME not allowed: ${mimeType}`, "TUS_MIME_NOT_ALLOWED");
  }

  await ensureSpoolDir();
  void cleanupExpiredTusSessions();

  const now = nowISODateString();
  const session: TusSession = {
    id: randomUUID(),
    tenantId: input.tenantId,
    userId: input.userId,
    filename,
    mimeType,
    size: input.size,
    offset: 0,
    folder: input.folder || "global",
    access: input.access === "public" ? "public" : "private",
    createdAt: now,
    updatedAt: now,
    expiresAt: dateToISODateString(new Date(Date.now() + TUS_DEFAULT_TTL_MS)),
    finalized: false,
  };

  await writeFile(partPath(session.id), Buffer.alloc(0));
  await writeSession(session);
  return session;
}

/** Load an owned, non-expired session. Returns `null` when it does not exist. */
export async function getTusSession(
  id: string,
  token: string | null,
  tenantId: string,
  userId: string,
): Promise<TusSession | null> {
  assertSessionId(id);
  const session = await readSessionFile(id);
  if (!session) return null;
  if (session.expiresAt <= nowISODateString()) {
    await deleteTusSession(id);
    return null;
  }
  if (session.tenantId !== tenantId || session.userId !== userId) {
    throw new TusError(403, "Upload belongs to another owner", "TUS_FORBIDDEN");
  }
  if (!verifyTusToken(id, tenantId, userId, token)) {
    throw new TusError(403, "Invalid upload token", "TUS_INVALID_TOKEN");
  }
  return session;
}

export interface TusFinalizeResult {
  mediaId?: string;
  result?: unknown;
}

/**
 * Append one chunk and, when the declared length is reached, hand the spool to
 * `finalize`. A zero-byte PATCH at `offset === size` retries finalization, which
 * makes the operation idempotent after a transient ingestion failure.
 */
export async function appendTusChunk(
  id: string,
  token: string | null,
  tenantId: string,
  userId: string,
  offset: number,
  chunk: Buffer,
  finalize: (session: TusSession, filePath: string) => Promise<TusFinalizeResult>,
): Promise<TusSession> {
  return withSessionLock(id, async () => {
    const session = await getTusSession(id, token, tenantId, userId);
    if (!session) throw new TusError(404, "Upload not found", "TUS_NOT_FOUND");

    if (session.finalized) return session;
    if (offset !== session.offset) {
      throw new TusError(
        409,
        `Upload offset mismatch: expected ${session.offset}`,
        "TUS_OFFSET_MISMATCH",
        session.offset,
      );
    }
    if (session.offset + chunk.length > session.size) {
      throw new TusError(413, "Chunk exceeds Upload-Length", "TUS_OVERSIZE_CHUNK");
    }

    if (chunk.length > 0) {
      await appendFile(partPath(id), chunk);
      session.offset += chunk.length;
      session.updatedAt = nowISODateString();
      await writeSession(session);
    }

    if (session.offset === session.size) {
      const finalized = await finalize(session, partPath(id));
      session.finalized = true;
      session.mediaId = finalized.mediaId;
      session.updatedAt = nowISODateString();
      await writeSession(session);
      await unlink(partPath(id)).catch(() => {});
    }

    return session;
  });
}

export async function deleteTusSession(id: string): Promise<void> {
  if (!SESSION_ID_RE.test(id)) return;
  await Promise.all([rm(sessionPath(id), { force: true }), rm(partPath(id), { force: true })]);
}
