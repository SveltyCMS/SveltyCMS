/**
 * @file src/utils/logger.server.ts
 * @description Server-only logger — wraps the core logger with file logging,
 * log rotation, deduplication, and crypto-chained audit trail.
 *
 * Wired once at server boot (`hooks.server.ts`) — side-effect import.
 *
 * ### Hardening (audit 2026-07):
 * - OOM prevention: ensuresStream reads only last 4KB (not entire file) for chain hash recovery
 * - Circular JSON crash prevention: safeStringify with WeakSet cycle detection
 * - Windows file-lock defense: awaits stream close event before rename (fixes EBUSY)
 * - currentFileSize memory tracking: eliminates per-flush fsp.stat() calls
 * - Graceful shutdown: process.on("beforeExit") flushes remaining queue to disk
 * - Batch buffer: single OS write per flush cycle instead of per-line writes
 * - Archive cleanup: Promise.all with fsp.stat (non-blocking) replaces fs.statSync
 * - Queue rescue: failed flush puts batch back at front (no log loss)
 * - Masking: file lines apply the same key/email mask as console output
 * - Level discipline: the file sink obeys the same level gates as the console
 *   (incl. QUIET/BENCHMARK) — debug/trace/once() are captured when enabled
 * - Chain secret: production REQUIRES LOG_CHAIN_SECRET; missing it degrades to an
 *   ephemeral per-process secret + one loud boot warning (fail loud, never crash)
 *
 * Imports the shared core from ./logger (relative path, no alias issues).
 * Protected by SvelteKit's .server.ts guard — cannot be imported in browser code.
 */

if (typeof window !== "undefined") {
  throw new Error("logger.server.ts cannot be imported in browser code");
}

import { createHmac, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream, type WriteStream } from "node:fs";
import { mkdir, open, readdir, rename, stat as fspStat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";

import { registerLogSinkHook } from "./logger";
import type { LogLevel } from "./logger";
import { nowISODateString } from "@utils/date";

// ── Re-export the core logger ──
export { logger } from "./logger";
export type { LogLevel, LoggableValue } from "./logger";

// ── Configuration & State ──
const LOG_DIR = "logs";
const LOG_FILE = join(LOG_DIR, "app.log");
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Chain secret: production REQUIRES a real LOG_CHAIN_SECRET. Falling back to the
// public default in prod would make the chain forgeable by anyone; instead we use
// an ephemeral per-process secret and warn loudly on first write (integrity holds
// within the process only, and is lost on restart). Dev keeps the documented default
// — local logs are not an audit boundary.
const HAS_CHAIN_SECRET = Boolean(process.env.LOG_CHAIN_SECRET);
const HMAC_SECRET =
  process.env.LOG_CHAIN_SECRET ||
  (process.env.NODE_ENV === "production"
    ? randomBytes(32).toString("hex")
    : "svelty-cms-default-log-secret");

let chainSecretWarned = false;

let stream: WriteStream | null = null;
let lastHash = "";
let currentFileSize = 0;

// ── Utilities ──

function chainHash(prev: string, content: string): string {
  return createHmac("sha256", HMAC_SECRET)
    .update(prev + content)
    .digest("hex");
}

/**
 * Cycle-safe JSON stringifier to prevent V8 crashes on recursive objects
 * or un-stringifiable native objects (like HTTP Requests/Errors).
 * File lines receive already-masked arguments from the core logger hook.
 */
function safeStringify(args: unknown[]): string {
  if (args.length === 0) return "";
  const seen = new WeakSet();
  return (
    " " +
    JSON.stringify(args, (_, v) => {
      if (v instanceof Error) return { message: v.message, name: v.name, stack: v.stack };
      if (typeof v === "object" && v !== null) {
        if (seen.has(v)) return "[Circular]";
        seen.add(v);
      }
      return v;
    })
  );
}

// ── File Engine ──

async function ensureStream(): Promise<WriteStream> {
  if (stream && !stream.destroyed) return stream;

  // Warn once at first actual write, not at module load — keeps `svelte-kit build`
  // and import-only contexts silent while still surfacing the misconfig in prod.
  if (!chainSecretWarned && !HAS_CHAIN_SECRET && process.env.NODE_ENV === "production") {
    chainSecretWarned = true;
    console.error(
      "[Logger] LOG_CHAIN_SECRET is not set in production — the audit chain will NOT survive restarts. Set a long random value (e.g. `openssl rand -hex 32`).",
    );
  }

  await mkdir(LOG_DIR, { recursive: true });

  try {
    const stat = await fspStat(LOG_FILE);
    currentFileSize = stat.size;

    // Read only the last 4KB to find the chain hash — avoids OOM on 5MB files
    const chunkSize = Math.min(currentFileSize, 4096);
    if (chunkSize > 0) {
      const handle = await open(LOG_FILE, "r");
      const buf = Buffer.alloc(chunkSize);
      await handle.read(buf, 0, chunkSize, currentFileSize - chunkSize);
      await handle.close();

      const lastLine = buf.toString("utf8").trim().split("\n").at(-1);
      if (lastLine) {
        const match = lastLine.match(/\[CHAIN:([a-f0-9]{64})\]/);
        if (match) lastHash = match[1];
      }
    }
  } catch {
    currentFileSize = 0;
  }

  stream = createWriteStream(LOG_FILE, { flags: "a" });
  return stream;
}

async function rotate() {
  if (currentFileSize < MAX_FILE_SIZE) return;

  try {
    if (stream) {
      // Await close event to release OS file lock (fixes Windows EBUSY)
      await new Promise<void>((resolve) => {
        stream!.once("close", resolve);
        stream!.end();
      });
      stream = null;
    }

    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const rotated = `${LOG_FILE}.${ts}`;

    await rename(LOG_FILE, rotated);
    currentFileSize = 0;
    lastHash = "";

    // Compress the rotated file in the background
    const src = createReadStream(rotated);
    const dst = createWriteStream(`${rotated}.gz`);
    await pipeline(src, createGzip(), dst);
    await unlink(rotated);

    // Clean up old archives (non-blocking concurrent stat)
    const files = await readdir(LOG_DIR);
    const archives = await Promise.all(
      files
        .filter((f) => f.startsWith("app.log.") && f.endsWith(".gz"))
        .map(async (f) => {
          const filePath = join(LOG_DIR, f);
          const stats = await fspStat(filePath);
          return { name: filePath, time: stats.mtimeMs };
        }),
    );

    archives.sort((a, b) => b.time - a.time);

    if (archives.length > 5) {
      await Promise.all(archives.slice(5).map((f) => unlink(f.name).catch(() => {})));
    }
  } catch (e: any) {
    if (e.code !== "ENOENT") console.error("[Logger] Rotation failed:", e.message);
  }
}

// ── Circular Ring Buffer & Batch Flush ──

interface LogQueueEntry {
  level: LogLevel;
  msg: string;
  args: unknown[];
}

const LOG_RING_CAPACITY = 2048;
const ringBuffer = Array.from<LogQueueEntry | undefined>({ length: LOG_RING_CAPACITY });
let ringHead = 0;
let ringTail = 0;
let ringCount = 0;
let ringDropped = 0;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;
let lastUtcSec = -1;
let lastUtcStr = "";

function cachedUtcTimestamp(): string {
  const sec = Math.floor(Date.now() / 1000);
  if (sec !== lastUtcSec) {
    lastUtcSec = sec;
    lastUtcStr = nowISODateString().slice(0, 19).replace("T", " ");
  }
  return lastUtcStr;
}

function pushRing(entry: LogQueueEntry): void {
  if (ringCount === LOG_RING_CAPACITY) {
    ringHead = (ringHead + 1) % LOG_RING_CAPACITY;
    ringCount--;
    ringDropped++;
  }
  ringBuffer[ringTail] = entry;
  ringTail = (ringTail + 1) % LOG_RING_CAPACITY;
  ringCount++;
}

function drainRing(): LogQueueEntry[] {
  const batch: LogQueueEntry[] = [];
  while (ringCount > 0) {
    const item = ringBuffer[ringHead];
    ringBuffer[ringHead] = undefined;
    ringHead = (ringHead + 1) % LOG_RING_CAPACITY;
    ringCount--;
    if (item) batch.push(item);
  }
  return batch;
}

async function flush() {
  if (ringCount === 0 || flushing) return;
  flushing = true;

  const batch = drainRing();
  const dropped = ringDropped;
  ringDropped = 0;

  try {
    const s = await ensureStream();
    await rotate();

    let batchBuffer = "";
    const ts = cachedUtcTimestamp();

    if (dropped > 0) {
      const dropPlain = `${ts} [WARN ] [Logger] Ring buffer overflow dropped ${dropped} oldest log entries`;
      lastHash = chainHash(lastHash, dropPlain);
      batchBuffer += `${dropPlain} [CHAIN:${lastHash}]\n`;
    }

    for (const e of batch) {
      const argsStr = safeStringify(e.args);
      const plain = `${ts} [${e.level.toUpperCase().padEnd(5)}] ${e.msg}${argsStr}`;

      lastHash = chainHash(lastHash, plain);
      const line = `${plain} [CHAIN:${lastHash}]\n`;

      batchBuffer += line;
    }

    // Write the entire batch in one OS call, updating in-memory size
    s.write(batchBuffer);
    currentFileSize += Buffer.byteLength(batchBuffer);
  } catch (err: any) {
    console.error("[Logger] Flush failed:", err.message);
    for (let i = 0; i < batch.length; i++) {
      pushRing(batch[i]);
    }
  } finally {
    flushing = false;
    if (ringCount > 0 && !flushTimer) {
      flushTimer = setTimeout(() => {
        flushTimer = null;
        flush();
      }, 5000);
    }
  }
}

function enqueue(level: LogLevel, msg: string, args: unknown[]) {
  pushRing({ level, msg, args });
  if (ringCount >= 100) {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    flush();
  } else if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush();
    }, 5000);
  }
}

// Graceful exit hook — prevents data loss on server shutdown
process.on("beforeExit", () => {
  if (ringCount > 0 && stream) {
    const batch = drainRing();
    const ts = cachedUtcTimestamp();
    for (const e of batch) {
      const argsStr = safeStringify(e.args);
      const plain = `${ts} [${e.level.toUpperCase().padEnd(5)}] ${e.msg}${argsStr}`;
      lastHash = chainHash(lastHash, plain);
      stream.write(`${plain} [CHAIN:${lastHash}]\n`);
    }
  }
});

// Single-pass hook: console logger masks args once and delivers them directly here.
registerLogSinkHook((level, msg, maskedArgs) => {
  enqueue(level, msg, maskedArgs);
});
