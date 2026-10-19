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

import { randomBytes, createHash } from "node:crypto";
import type { DatabaseId, ISODateString } from "@src/content/types";
import { nowISODateString } from "@src/utils/date";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import { join, resolve, normalize } from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { logger } from "@utils/logger";
import { raise } from "@utils/error-handling";
import type { StoredMedia } from "./media-models";
import { constantTimeBufferEqual } from "@utils/security/constant-time";

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
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
  if (link.allowedIPs?.length && (!ip || !link.allowedIPs.includes(ip))) {
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

/** Largest file size representable in the 11-octal-digit TAR size field (~8 GiB). */
const TAR_MAX_SIZE = 0o77777777777;

/** Build one 512-byte POSIX ustar header block. */
function buildTarHeader(name: string, size: number, typeflag: string): Buffer {
  const header = Buffer.alloc(512, 0);

  // name — 100-byte field (zero-padded by Buffer.alloc). Truncated for the file
  // entry of a long-name record; extractors read the preceding 'L' entry data.
  const nameBytes = Buffer.from(name, "utf8");
  nameBytes.copy(header, 0, 0, Math.min(nameBytes.length, 100));

  // mode / uid / gid — 8 bytes each, 7 octal digits + NUL.
  Buffer.from("0000644\0").copy(header, 100);
  Buffer.from("0000000\0").copy(header, 108);
  Buffer.from("0000000\0").copy(header, 116);

  // size / mtime — 12 bytes each, 11 octal digits + NUL.
  Buffer.from(`${size.toString(8).padStart(11, "0")}\0`).copy(header, 124);
  Buffer.from(
    `${Math.floor(Date.now() / 1000)
      .toString(8)
      .padStart(11, "0")}\0`,
  ).copy(header, 136);

  // typeflag (regular file '0', or 'L' for a long-name record).
  header[156] = typeflag.charCodeAt(0);

  // magic + version mark this as POSIX ustar (required for 'L' long-name support).
  Buffer.from("ustar\0").copy(header, 257);
  Buffer.from("00").copy(header, 263);

  // Checksum — computed with the checksum field treated as spaces (POSIX).
  for (let i = 148; i < 156; i++) header[i] = 0x20;
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += header[i];
  Buffer.from(`${sum.toString(8).padStart(6, "0")}\0 `).copy(header, 148);

  return header;
}

/** Minimal TAR creator */
class TarBuilder {
  entries: { name: string; path: string }[] = [];

  add(name: string, path: string) {
    this.entries.push({ name, path });
  }

  async write(outputPath: string): Promise<void> {
    const out = createWriteStream(outputPath);

    // Surface any output-stream failure (disk full, closed stream) as a rejected
    // write instead of an unhandled 'error' event mid-loop.
    let outError: Error | undefined;
    out.once("error", (err) => {
      outError = err as Error;
    });

    for (const e of this.entries) {
      if (outError) throw outError;

      // Never trust the DB-recorded size — the on-disk file may differ. Stat the
      // actual file so the header size and padding match the bytes we stream.
      const st = await stat(e.path);
      if (!st.isFile()) {
        raise(500, `Archive entry is not a regular file: ${e.path}`);
      }
      const size = st.size;
      if (size > TAR_MAX_SIZE) {
        raise(413, `Archive entry exceeds the TAR size field limit: ${e.path}`);
      }

      // Names longer than the 100-byte TAR name field get a POSIX 'L' long-name
      // record (full name as entry data) preceding the truncated file entry.
      const nameBytes = Buffer.byteLength(e.name, "utf8");
      if (nameBytes > 100) {
        const nameData = Buffer.from(e.name + "\0", "utf8");
        out.write(buildTarHeader("././@LongLink", nameData.length, "L"));
        out.write(nameData);
        const longPad = 512 - (nameData.length % 512);
        if (longPad < 512) out.write(Buffer.alloc(longPad));
      }

      out.write(buildTarHeader(e.name, size, "0"));

      await pipeline(createReadStream(e.path), out, { end: false });

      const pad = 512 - (size % 512);
      if (pad < 512) out.write(Buffer.alloc(pad));
    }

    out.write(Buffer.alloc(1024));
    out.end();
    await new Promise<void>((res, rej) => {
      if (outError) return rej(outError);
      out.once("finish", res);
      out.once("error", rej);
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
    const usedNames = new Set<string>();
    for (const f of files) {
      if (!(f.path && f.size)) continue;

      const safePath = _safeResolve(f.path);
      if (!safePath) {
        logger.warn(`[BulkDownload] Blocked path traversal: ${f.path}`);
        blocked++;
        continue;
      }

      // Sanitized names can collide (e.g. `a/b.jpg` and `a?b.jpg` both → `a_b.jpg`),
      // so de-duplicate to prevent two entries sharing one archive path.
      const base = f.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
      let name = base;
      let suffix = 2;
      while (usedNames.has(name)) {
        name = `${base}_${suffix++}`;
      }
      usedNames.add(name);

      tar.add(name, safePath);
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
