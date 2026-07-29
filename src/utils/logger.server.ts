/**
 * @file src/utils/logger.server.ts
 * @description Server-only logger — wraps the core logger with file logging,
 * log rotation, deduplication, and crypto-chained audit trail.
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
 *
 * Imports the shared core from ./logger (relative path, no alias issues).
 * Protected by SvelteKit's .server.ts guard — cannot be imported in browser code.
 */

if (typeof window !== "undefined") {
  throw new Error("logger.server.ts cannot be imported in browser code");
}

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import * as sp from "node:stream/promises";
import * as zlib from "node:zlib";

import { logger as coreLogger } from "./logger";
import type { LogLevel } from "./logger";

// ── Re-export the core logger ──
export { logger } from "./logger";
export type { LogLevel, LoggableValue } from "./logger";

// ── Configuration & State ──
const LOG_DIR = "logs";
const LOG_FILE = path.join(LOG_DIR, "app.log");
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const HMAC_SECRET = process.env.LOG_CHAIN_SECRET || "svelty-cms-default-log-secret";

let stream: fs.WriteStream | null = null;
let lastHash = "";
let currentFileSize = 0;

// ── Utilities ──

function chainHash(prev: string, content: string): string {
  return crypto
    .createHmac("sha256", HMAC_SECRET)
    .update(prev + content)
    .digest("hex");
}

/**
 * Cycle-safe JSON stringifier to prevent V8 crashes on recursive objects
 * or un-stringifiable native objects (like HTTP Requests/Errors).
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

async function ensureStream(): Promise<fs.WriteStream> {
  if (stream && !stream.destroyed) return stream;

  await fsp.mkdir(LOG_DIR, { recursive: true });

  try {
    const stat = await fsp.stat(LOG_FILE);
    currentFileSize = stat.size;

    // Read only the last 4KB to find the chain hash — avoids OOM on 5MB files
    const chunkSize = Math.min(currentFileSize, 4096);
    if (chunkSize > 0) {
      const handle = await fsp.open(LOG_FILE, "r");
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

  stream = fs.createWriteStream(LOG_FILE, { flags: "a" });
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

    await fsp.rename(LOG_FILE, rotated);
    currentFileSize = 0;
    lastHash = "";

    // Compress the rotated file in the background
    const src = fs.createReadStream(rotated);
    const dst = fs.createWriteStream(`${rotated}.gz`);
    await sp.pipeline(src, zlib.createGzip(), dst);
    await fsp.unlink(rotated);

    // Clean up old archives (non-blocking concurrent stat)
    const files = await fsp.readdir(LOG_DIR);
    const archives = await Promise.all(
      files
        .filter((f) => f.startsWith("app.log.") && f.endsWith(".gz"))
        .map(async (f) => {
          const filePath = path.join(LOG_DIR, f);
          const stats = await fsp.stat(filePath);
          return { name: filePath, time: stats.mtimeMs };
        }),
    );

    archives.sort((a, b) => b.time - a.time);

    if (archives.length > 5) {
      await Promise.all(archives.slice(5).map((f) => fsp.unlink(f.name).catch(() => {})));
    }
  } catch (e: any) {
    if (e.code !== "ENOENT") console.error("[Logger] Rotation failed:", e.message);
  }
}

// ── Queue & Flush ──

const queue: { level: LogLevel; msg: string; args: unknown[] }[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;

async function flush() {
  if (!queue.length || flushing) return;
  flushing = true;

  const batch = queue.splice(0, queue.length);

  try {
    const s = await ensureStream();
    await rotate();

    let batchBuffer = "";

    for (const e of batch) {
      const ts = new Date().toISOString().slice(0, 19).replace("T", " ");
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
    // Rescue lost logs on failure — put batch back at front
    queue.unshift(...batch);
  } finally {
    flushing = false;
    if (queue.length > 0 && !flushTimer) {
      flushTimer = setTimeout(() => {
        flushTimer = null;
        flush();
      }, 5000);
    }
  }
}

function enqueue(level: LogLevel, msg: string, args: unknown[]) {
  queue.push({ level, msg, args });
  if (queue.length >= 100) {
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
  if (queue.length > 0 && stream) {
    for (const e of queue) {
      const ts = new Date().toISOString().slice(0, 19).replace("T", " ");
      const argsStr = safeStringify(e.args);
      const plain = `${ts} [${e.level.toUpperCase().padEnd(5)}] ${e.msg}${argsStr}`;
      lastHash = chainHash(lastHash, plain);
      stream.write(`${plain} [CHAIN:${lastHash}]\n`);
    }
    queue.length = 0;
  }
});

// ── Patch core logger to also write to file ──

const _fatal = coreLogger.fatal;
const _error = coreLogger.error;
const _warn = coreLogger.warn;
const _info = coreLogger.info;

coreLogger.fatal = (m: string, ...a: unknown[]) => {
  _fatal(m, ...a);
  enqueue("fatal", m, a);
};
coreLogger.error = (m: string, ...a: unknown[]) => {
  _error(m, ...a);
  enqueue("error", m, a);
};
coreLogger.warn = (m: string, ...a: unknown[]) => {
  _warn(m, ...a);
  enqueue("warn", m, a);
};
coreLogger.info = (m: string, ...a: unknown[]) => {
  _info(m, ...a);
  enqueue("info", m, a);
};
