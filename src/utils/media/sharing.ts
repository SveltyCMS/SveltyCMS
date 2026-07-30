/**
 * @file src/utils/media/sharing.ts
 * @description Secure file sharing with expiring links & access controls
 *
 * Features:
 * - Token generation
 * - Expiring links
 * - Password & IP restrictions
 * - Download limits
 * - Access logging
 * - Revoke/extend
 * - Stats & cleanup
 */

import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import type { DatabaseId, ISODateString } from "@src/content/types";
import { nowISODateString } from "@src/utils/date";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import { join, resolve, normalize } from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { logger } from "@utils/logger";
import type { StoredMedia } from "./media-models";

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Constant-time buffer comparison that pads shorter inputs to the length
 * of the longer one — prevents timing leaks from length short-circuiting.
 */
function constantTimeBufferEqual(a: Buffer, b: Buffer): boolean {
  const maxLen = Math.max(a.length, b.length);
  const paddedA = Buffer.alloc(maxLen, 0);
  const paddedB = Buffer.alloc(maxLen, 0);
  a.copy(paddedA);
  b.copy(paddedB);
  return timingSafeEqual(paddedA, paddedB);
}

export interface ShareLink {
  _id?: DatabaseId;
  active: boolean;
  allowedIPs?: string[];
  createdAt: ISODateString;
  createdBy: DatabaseId;
  downloadCount: number;
  expiresAt: ISODateString;
  fileId: DatabaseId;
  logs: ShareLog[];
  maxDownloads?: number;
  meta?: {
    requireEmail?: boolean;
    message?: string;
    notify?: boolean;
  };
  passwordHash?: string; // Store hashed
  token: string;
}

export interface ShareLog {
  action: "view" | "download";
  at: ISODateString;
  ip: string;
  ok: boolean;
  ua: string;
}

/** Secure token (base64url, 32 bytes) */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Create share link */
export function createLink(
  fileId: DatabaseId,
  userId: DatabaseId,
  opts: {
    hours?: number;
    maxDownloads?: number;
    passwordHash?: string;
    ips?: string[];
    requireEmail?: boolean;
    message?: string;
    notify?: boolean;
  } = {},
): ShareLink & { rawToken: string } {
  const hours = opts.hours ?? 24;
  const now = nowISODateString();

  // Compute expiry: now + hours. The returned `expiresAt` is an ISODateString.
  // We add milliseconds in UTC then convert back to ISO for correctness.
  const expiresDate = new Date(now);
  expiresDate.setTime(expiresDate.getTime() + hours * 3_600_000);

  const rawToken = newToken();
  return {
    token: hashToken(rawToken),
    rawToken,
    fileId,
    createdBy: userId,
    createdAt: now as ISODateString,
    expiresAt: expiresDate.toISOString() as ISODateString,
    maxDownloads: opts.maxDownloads,
    downloadCount: 0,
    passwordHash: opts.passwordHash,
    allowedIPs: opts.ips,
    logs: [],
    active: true,
    meta: {
      requireEmail: opts.requireEmail,
      message: opts.message,
      notify: opts.notify,
    },
  };
}

/** Validate access */
export function validateLink(
  link: ShareLink,
  ip?: string,
  passwordHash?: string,
): { ok: boolean; reason?: string } {
  if (!link.active) {
    return { ok: false, reason: "inactive" };
  }
  if (new Date() > new Date(link.expiresAt)) {
    return { ok: false, reason: "expired" };
  }
  if (link.maxDownloads != null && link.downloadCount >= link.maxDownloads) {
    return { ok: false, reason: "limit" };
  }
  if (link.allowedIPs?.length && ip && !link.allowedIPs.includes(ip)) {
    return { ok: false, reason: "ip" };
  }

  // Password-protected links: caller MUST supply the correct hash
  if (link.passwordHash) {
    if (!passwordHash) {
      return { ok: false, reason: "password_required" };
    }
    const a = Buffer.from(link.passwordHash);
    const b = Buffer.from(passwordHash);
    // Use constant-time comparison with length padding to avoid timing leaks
    if (!constantTimeBufferEqual(a, b)) {
      return { ok: false, reason: "security" };
    }
  }
  // Link has no password — always allow, ignore any passwordHash param

  return { ok: true };
}

/**
 * Log access — returns a **new** `ShareLink` object (immutable update).
 * The original link is NOT mutated.
 */
export function logAccess(
  link: ShareLink,
  action: "view" | "download",
  ip: string,
  ua: string,
  ok: boolean,
): ShareLink {
  return {
    ...link,
    logs: [
      ...link.logs,
      {
        at: nowISODateString() as ISODateString,
        ip,
        ua,
        action,
        ok,
      },
    ],
    downloadCount: action === "download" && ok ? link.downloadCount + 1 : link.downloadCount,
  };
}

/**
 * Revoke link — returns a **new** `ShareLink` object (immutable update).
 * The original link is NOT mutated.
 */
export function revoke(link: ShareLink): ShareLink {
  return { ...link, active: false };
}

/**
 * Extend expiration — returns a **new** `ShareLink` object (immutable update).
 * The original link is NOT mutated.
 * Hours are clamped to a minimum of 0 (no negative extension).
 */
export function extend(link: ShareLink, hours: number): ShareLink {
  const clamped = Math.max(0, hours);
  const expires = new Date(link.expiresAt);
  expires.setHours(expires.getHours() + clamped);
  return { ...link, expiresAt: expires.toISOString() as ISODateString };
}

/** Link statistics */
export function stats(link: ShareLink) {
  const views = link.logs.filter((l) => l.action === "view" && l.ok).length;
  const downloads = link.logs.filter((l) => l.action === "download" && l.ok).length;
  const ips = new Set(link.logs.map((l) => l.ip)).size;
  const last = link.logs.at(-1)?.at;

  const remainingHours = Math.max(0, (new Date(link.expiresAt).getTime() - Date.now()) / 3_600_000);
  const remainingDownloads =
    link.maxDownloads != null ? link.maxDownloads - link.downloadCount : undefined;

  return {
    total: link.logs.length,
    views,
    downloads,
    uniqueIPs: ips,
    lastAccess: last,
    hoursLeft: Math.round(remainingHours),
    downloadsLeft: remainingDownloads,
  };
}

/** Filter active/expired links */
export function filterLinks(links: ShareLink[]): {
  active: ShareLink[];
  expired: ShareLink[];
} {
  const now = Date.now();
  const active: ShareLink[] = [];
  const expired: ShareLink[] = [];

  for (const l of links) {
    (l.active && now <= new Date(l.expiresAt).getTime() ? active : expired).push(l);
  }

  return { active, expired };
}

// ─── Bulk download (TAR.GZ archive) ───────────────────────────────────────────

/** Resolve the canonical media storage root (defense-in-depth). */
function _resolveMediaRoot(): string {
  return resolve(process.cwd(), process.env.MEDIA_FOLDER || "uploads");
}

/** 🔒 Validate a stored path doesn't escape the media root. */
function _safeResolve(storedPath: string): string | null {
  const resolved = normalize(resolve(_resolveMediaRoot(), storedPath));
  const root = resolve(_resolveMediaRoot()) + "/";
  return resolved.startsWith(root) ? resolved : null;
}

/** Minimal TAR creator */
class TarBuilder {
  entries: { name: string; path: string; size: number }[] = [];

  add(name: string, path: string, size: number) {
    this.entries.push({ name, path, size });
  }

  async write(outputPath: string): Promise<void> {
    const out = createWriteStream(outputPath);

    for (const e of this.entries) {
      const header = Buffer.alloc(512, 0);
      Buffer.from(e.name.slice(0, 99)).copy(header, 0);

      for (const [i, c] of "0000644 \0".split("").entries()) {
        header.writeUInt8(c.charCodeAt(0), 100 + i);
      }
      for (const [i, c] of "0000000 \0".split("").entries()) {
        header.writeUInt8(c.charCodeAt(0), 108 + i);
      }
      for (const [i, c] of "0000000 \0".split("").entries()) {
        header.writeUInt8(c.charCodeAt(0), 116 + i);
      }

      const sizeOct = `${e.size.toString(8).padStart(11, "0")}\0`;
      Buffer.from(sizeOct).copy(header, 124);

      const mtimeOct = `${Math.floor(Date.now() / 1000)
        .toString(8)
        .padStart(11, "0")}\0`;
      Buffer.from(mtimeOct).copy(header, 136);

      for (const [i, c] of "        ".split("").entries()) {
        header.writeUInt8(c.charCodeAt(0), 148 + i);
      }

      header[156] = 48;

      let sum = 0;
      for (let i = 0; i < 512; i++) sum += header[i];
      const chksum = `${sum.toString(8).padStart(6, "0")}\0 `;
      Buffer.from(chksum).copy(header, 148);

      out.write(header);

      const inStream = createReadStream(e.path);
      await new Promise((res, rej) => {
        inStream.on("error", rej);
        inStream.on("end", res);
        inStream.pipe(out, { end: false });
      });

      const pad = 512 - (e.size % 512);
      if (pad < 512) out.write(Buffer.alloc(pad));
    }

    out.write(Buffer.alloc(1024));
    out.end();
    await new Promise((res, rej) => {
      out.on("finish", res);
      out.on("error", rej);
    });
  }
}

/** Create TAR.GZ archive — only StoredMedia (remote videos excluded at type level). */
export async function createBulkArchive(
  files: StoredMedia[],
  outputDir: string,
): Promise<{ path: string; size: number; filename: string }> {
  const ts = Date.now();
  const tarPath = join(outputDir, `bulk-${ts}.tar`);
  const gzPath = join(outputDir, `bulk-${ts}.tar.gz`);
  let blocked = 0;

  try {
    await mkdir(outputDir, { recursive: true });

    const tar = new TarBuilder();
    for (const f of files) {
      if (!(f.path && f.size)) continue;

      const safePath = _safeResolve(f.path);
      if (!safePath) {
        logger.warn(`[BulkDownload] Blocked path traversal: ${f.path}`);
        blocked++;
        continue;
      }

      const name = f.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
      tar.add(name, safePath, f.size);
    }

    if (tar.entries.length === 0) {
      throw new Error(`No valid files to archive${blocked ? ` (${blocked} blocked)` : ""}`);
    }

    await tar.write(tarPath);
    await pipeline(createReadStream(tarPath), createGzip({ level: 6 }), createWriteStream(gzPath));
    await unlink(tarPath);

    const { size } = await stat(gzPath);
    return { path: gzPath, size, filename: `media-bulk-${ts}.tar.gz` };
  } catch (err) {
    logger.error("Bulk archive creation failed", err);
    await Promise.allSettled([unlink(tarPath), unlink(gzPath)]);
    throw err;
  }
}

/** Stream archive to response */
export function streamArchive(
  archivePath: string,
  filename: string,
  setHeader: (name: string, value: string) => void,
): ReadableStream {
  setHeader("Content-Type", "application/gzip");
  setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  const nodeStream = createReadStream(archivePath);
  return new ReadableStream({
    start(controller) {
      nodeStream.on("data", (chunk) => controller.enqueue(chunk));
      nodeStream.on("end", () => controller.close());
      nodeStream.on("error", (err) => controller.error(err));
    },
    cancel() {
      nodeStream.destroy();
    },
  });
}

/** Cleanup archive file */
export async function cleanupArchive(archivePath: string): Promise<void> {
  try {
    await unlink(archivePath);
  } catch (err) {
    logger.warn("Archive cleanup failed", { path: archivePath, error: err });
  }
}

/** Aliases for backward compatibility */
export const createBulkDownloadArchive = createBulkArchive;
export const streamArchiveToResponse = streamArchive;
