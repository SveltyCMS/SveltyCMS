/**
 * @file src/utils/logger.server.ts
 * @description Server-only logger — wraps the core logger with file logging,
 * log rotation, deduplication, and crypto-chained audit trail.
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

// ── File engine ──
let stream: fs.WriteStream | null = null;
let lastHash = "";
const HMAC_SECRET = process.env.LOG_CHAIN_SECRET || "svelty-cms-default-log-secret";

function chainHash(prev: string, content: string): string {
  return crypto.createHmac("sha256", HMAC_SECRET).update(prev + content).digest("hex");
}

async function ensureStream(): Promise<fs.WriteStream> {
  const dir = "logs";
  const file = path.join(dir, "app.log");
  if (!stream || stream.destroyed) {
    await fsp.mkdir(dir, { recursive: true });
    try {
      const content = await fsp.readFile(file, "utf8");
      const lastLine = content.trim().split("\n").at(-1);
      if (lastLine) {
        const match = lastLine.match(/\[CHAIN:([a-f0-9]{64})\]/);
        if (match) lastHash = match[1];
      }
    } catch { /* fresh log */ }
    stream = fs.createWriteStream(file, { flags: "a" });
  }
  return stream;
}

async function rotate() {
  const dir = "logs";
  const file = path.join(dir, "app.log");
  try {
    const stat = await fsp.stat(file);
    if (stat.size < 5 * 1024 * 1024) return;
    if (stream) stream.end();
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const rotated = `${file}.${ts}`;
    await fsp.rename(file, rotated);
    lastHash = "";
    const src = fs.createReadStream(rotated);
    const dst = fs.createWriteStream(`${rotated}.gz`);
    await sp.pipeline(src, zlib.createGzip(), dst);
    await fsp.unlink(rotated);
    const files = (await fsp.readdir(dir))
      .filter((f) => f.startsWith("app.log.") && f.endsWith(".gz"))
      .map((f) => ({ name: f, time: fs.statSync(path.join(dir, f)).mtime.getTime() }))
      .sort((a, b) => b.time - a.time);
    if (files.length > 5) {
      for (const f of files.slice(5)) await fsp.unlink(path.join(dir, f.name));
    }
  } catch (e: any) {
    if (e.code !== "ENOENT") console.error("[Logger] Rotation failed:", e.message);
  }
}

// ── Queue & flush ──
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
    for (const e of batch) {
      const ts = new Date().toISOString().slice(0, 19).replace("T", " ");
      const plain = `${ts} [${e.level.toUpperCase().padEnd(5)}] ${e.msg} ${JSON.stringify(e.args)}`;
      lastHash = chainHash(lastHash, plain);
      s.write(`${ts} [${e.level.toUpperCase().padEnd(5)}] ${e.msg} ${JSON.stringify(e.args)} [CHAIN:${lastHash}]\n`);
    }
  } catch (err: any) {
    console.error("[Logger] Flush failed:", err.message);
  } finally {
    flushing = false;
    if (queue.length > 0 && !flushTimer) {
      flushTimer = setTimeout(() => { flushTimer = null; flush(); }, 5000);
    }
  }
}

function enqueue(level: LogLevel, msg: string, args: unknown[]) {
  queue.push({ level, msg, args });
  if (queue.length >= 100) flush();
  else if (!flushTimer) {
    flushTimer = setTimeout(() => { flushTimer = null; flush(); }, 5000);
  }
}

// ── Patch core logger to also write to file ──
const _fatal = coreLogger.fatal;
const _error = coreLogger.error;
const _warn = coreLogger.warn;
const _info = coreLogger.info;

coreLogger.fatal = (m: string, ...a: unknown[]) => { _fatal(m, ...a); enqueue("fatal", m, a); };
coreLogger.error = (m: string, ...a: unknown[]) => { _error(m, ...a); enqueue("error", m, a); };
coreLogger.warn  = (m: string, ...a: unknown[]) => { _warn(m, ...a); enqueue("warn", m, a); };
coreLogger.info  = (m: string, ...a: unknown[]) => { _info(m, ...a); enqueue("info", m, a); };
