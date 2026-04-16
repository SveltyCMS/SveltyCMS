/**
 * @file src/utils/logger.server.ts
 * @description Server-only logger with formatting, batching, rotation & masking
 */

if (typeof window !== "undefined" && typeof Bun === "undefined") {
  throw new Error("logger.server.ts cannot be imported in browser code");
}

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as promises from "node:fs/promises";
import * as path from "node:path";
import * as sp from "node:stream/promises";
import * as zlib from "node:zlib";
import { pc } from "@utils/native-utils";

// Log levels
export type LogLevel = "none" | "silent" | "fatal" | "error" | "warn" | "info" | "debug" | "trace";
const LEVELS: Record<LogLevel, { prio: number; color: (s: string) => string }> = {
  none: { prio: 0, color: (s) => s },
  silent: { prio: 0, color: (s) => s },
  fatal: { prio: 1, color: pc.magenta },
  error: { prio: 2, color: pc.red },
  warn: { prio: 3, color: pc.yellow },
  info: { prio: 4, color: pc.green },
  debug: { prio: 5, color: pc.blue },
  trace: { prio: 6, color: pc.cyan },
};

export type LoggableValue = string | number | boolean | null | undefined | object | Date | Error;

// Icons
const ICONS: Record<string, string> = {
  FATAL: "✗",
  ERROR: "✗",
  WARN: "⚠",
  INFO: "●",
  DEBUG: "◆",
  TRACE: "○",
};

// Message token highlighting
const patterns = [
  { re: /\b\d+(\.\d+)?(ms|s)\b/g, color: pc.green },
  {
    re: /([a-f0-9]{24}|[a-f0-9]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi,
    color: pc.yellow,
  },
  { re: /\/api\/[^\s]+/g, color: pc.cyan },
  { re: /\b(true)\b/g, color: pc.green },
  { re: /\b(false)\b/g, color: pc.red },
  { re: /\b-?\d+\.?\d*\b/g, color: pc.blue },
];

function colorMessage(msg: string): string {
  let out = msg;
  for (const { re, color } of patterns) {
    out = out.replace(re, (m) => color(m));
  }
  return out;
}

function formatValue(v: unknown): string {
  if (v === null) return pc.magenta("null");
  if (v === undefined) return pc.gray("undefined");
  if (typeof v === "boolean") return v ? pc.green("true") : pc.red("false");
  if (typeof v === "number") return pc.blue(String(v));
  if (typeof v === "string") return colorMessage(v);
  if (v instanceof Date) return pc.cyan(v.toISOString());
  if (Array.isArray(v)) return pc.yellow(`[${v.map(formatValue).join(", ")}]`);
  if (v instanceof Error) {
    const parts = [`message: ${pc.red(v.message)}`, `name: ${pc.red(v.name)}`];
    if ("code" in v) parts.push(`code: ${pc.red(String((v as any).code))}`);
    return pc.yellow(`{${parts.join(", ")}}`);
  }
  if (typeof v === "object") {
    const entries = Object.entries(v as object)
      .map(([k, val]) => `${k}: ${formatValue(val)}`)
      .join(", ");
    return pc.yellow(`{${entries}}`);
  }
  return String(v);
}

const SENSITIVE = ["password", "token", "secret", "key", "authorization"];
const EMAILS = ["email", "mail"];

function mask(v: unknown, depth = 0): unknown {
  if (depth > 10) return "[Depth]";
  if (v === null || typeof v !== "object") return v;
  if (v instanceof Date || v instanceof RegExp) return v;
  if (v instanceof Error) {
    const plain: Record<string, unknown> = { message: v.message, name: v.name };
    if (v.stack) plain.stack = v.stack;
    if ("code" in v) plain.code = (v as any).code;
    return mask(plain, depth + 1);
  }
  if (Array.isArray(v)) return v.map((item) => mask(item, depth + 1));

  const masked: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v)) {
    const low = k.toLowerCase();
    if (SENSITIVE.some((s) => low.includes(s))) {
      masked[k] = "[REDACTED]";
    } else if (EMAILS.some((e) => low.includes(e)) && typeof val === "string") {
      const [local, domain] = val.split("@");
      masked[k] = domain ? `${local.slice(0, 2)}***@${domain}` : "***";
    } else {
      masked[k] = mask(val, depth + 1);
    }
  }
  return masked;
}

let stream: fs.WriteStream | null = null;
let lastHash = "";
const HMAC_SECRET = process.env.LOG_CHAIN_SECRET || "svelty-cms-default-log-secret";

function calculateHash(prevHash: string, content: string): string {
  return crypto
    .createHmac("sha256", HMAC_SECRET)
    .update(prevHash + content)
    .digest("hex");
}

async function ensureStream() {
  const dir = "logs";
  const file = path.join(dir, "app.log");
  if (!stream || stream.destroyed) {
    await promises.mkdir(dir, { recursive: true });
    try {
      const content = await promises.readFile(file, "utf8");
      const lines = content.trim().split("\n");
      if (lines.length > 0) {
        const lastLine = lines.at(-1);
        if (lastLine) {
          const match = lastLine.match(/\[CHAIN:([a-f0-9]{64})\]/);
          if (match) lastHash = match[1];
        }
      }
    } catch {}
    stream = fs.createWriteStream(file, { flags: "a" });
  }
  return stream;
}

async function rotate() {
  const dir = "logs";
  const file = path.join(dir, "app.log");
  try {
    const stat = await promises.stat(file);
    if (stat.size < 5 * 1024 * 1024) return;
    if (stream) stream.end();
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const rotated = `${file}.${ts}`;
    await promises.rename(file, rotated);
    await promises.writeFile(file, "");
    lastHash = "";
    const src = fs.createReadStream(rotated);
    const dst = fs.createWriteStream(`${rotated}.gz`);
    await sp.pipeline(src, zlib.createGzip(), dst);
    await promises.unlink(rotated);
    const files = await promises.readdir(dir);
    const logFiles = files
      .filter((f) => f.startsWith("app.log.") && f.endsWith(".gz"))
      .map((f) => ({ name: f, time: fs.statSync(path.join(dir, f)).mtime.getTime() }))
      .sort((a, b) => b.time - a.time);
    if (logFiles.length > 5) {
      for (const f of logFiles.slice(5)) await promises.unlink(path.join(dir, f.name));
    }
  } catch (e: any) {
    if (e.code !== "ENOENT") console.error("Rotation failed:", e);
  }
}

const queue: { level: LogLevel; msg: string; args: unknown[] }[] = [];
let timeout: NodeJS.Timeout | null = null;
let isFlushing = false;

async function flush() {
  if (!queue.length || isFlushing) return;
  isFlushing = true;
  const batch = queue.splice(0, queue.length);
  try {
    const s = await ensureStream();
    if (s) {
      await rotate();
      for (const e of batch) {
        const ts = new Date().toISOString().slice(0, 19).replace("T", " ");
        const icon = ICONS[e.level.toUpperCase()] ?? "●";
        const color = LEVELS[e.level].color;
        const masked = e.args.map((a) => mask(a));
        const args = masked.map(formatValue).join(" ");
        const msg = colorMessage(e.msg);
        const plainText = `${ts} [${e.level.toUpperCase().padEnd(5)}] ${e.msg} ${JSON.stringify(masked)}`;
        lastHash = calculateHash(lastHash, plainText);
        const logLine = `${ts} ${color(`${icon} [${e.level.toUpperCase().padEnd(5)}]`)} ${msg} ${args} [CHAIN:${lastHash}]\n`;
        s.write(logLine);
      }
    }
  } catch (err) {
    console.error("Log write failed:", err);
  } finally {
    isFlushing = false;
    if (queue.length > 0 && !timeout) {
      timeout = setTimeout(() => {
        timeout = null;
        flush();
      }, 5000);
    }
  }
}

const dedupCache = new Map<string, { count: number; lastTs: number; lastLevel: LogLevel }>();
const DEDUP_WINDOW_MS = 5000;

function enqueue(level: LogLevel, msg: string, args: unknown[]) {
  // Runtime priority check against dynamic logger.level
  const currentPrio = LEVELS[logger.level]?.prio ?? 4;
  const msgPrio = LEVELS[level]?.prio ?? 4;
  if (msgPrio > currentPrio || currentPrio === 0) return;

  const dedupKey = `${level}:${msg}:${JSON.stringify(args)}`;
  const now = Date.now();
  const cached = dedupCache.get(dedupKey);

  if (cached && now - cached.lastTs < DEDUP_WINDOW_MS) {
    cached.count++;
    if (
      cached.count === 10 ||
      cached.count === 100 ||
      cached.count === 1000 ||
      cached.count % 2500 === 0
    ) {
      const ts = pc.gray(new Date(now).toISOString().slice(0, 19).replace("T", " "));
      const color = LEVELS[level].color;
      process.stdout.write(
        `${ts} ${color(`[SUPPRESSED]`)} Suppressed ${cached.count} repeats of: ${msg}\n`,
      );
    }
    return;
  }

  if (cached && cached.count > 0) {
    const ts = pc.gray(new Date(now).toISOString().slice(0, 19).replace("T", " "));
    const color = LEVELS[level].color;
    process.stdout.write(
      `${ts} ${color(`[SUMMARY]`)} Previously suppressed ${cached.count} repeats of: ${msg}\n`,
    );
  }

  dedupCache.set(dedupKey, { count: 0, lastTs: now, lastLevel: level });
  const masked = args.map(mask);
  const isHighPriority = LEVELS[level].prio <= LEVELS.warn.prio;
  const forceStdout =
    process.env.VERBOSE_STDOUT === "true" || process.env.NODE_ENV === "development";

  if (isHighPriority || forceStdout) {
    const color = LEVELS[level].color;
    const icon = ICONS[level.toUpperCase()] ?? "●";
    const argsStr = masked.map(formatValue).join(" ");
    const pretty = colorMessage(msg);
    const ts = pc.gray(new Date().toISOString().slice(0, 19).replace("T", " "));
    process.stdout.write(
      `${ts} ${color(`${icon} [${level.toUpperCase().padEnd(5)}]`)} ${pretty.replace(/\r?\n/g, " ")} ${argsStr.replace(/\r?\n/g, " ")}\n`,
    );
  }

  queue.push({ level, msg, args: masked });
  if (queue.length >= 100) flush();
  else if (!timeout)
    timeout = setTimeout(() => {
      timeout = null;
      flush();
    }, 5000);
}

// Initial Level from Environment
const initialLevel = (process.env.LOG_LEVEL as LogLevel) || "info";

export const logger = {
  _level: initialLevel,
  get level(): LogLevel {
    return this._level;
  },
  set level(val: LogLevel) {
    if (LEVELS[val]) this._level = val;
  },
  fatal: (m: string, ...a: unknown[]) => enqueue("fatal", m, a),
  error: (m: string, ...a: unknown[]) => enqueue("error", m, a),
  warn: (m: string, ...a: unknown[]) => enqueue("warn", m, a),
  info: (m: string, ...a: unknown[]) => enqueue("info", m, a),
  debug: (m: string, ...a: unknown[]) => enqueue("debug", m, a),
  trace: (m: string, ...a: unknown[]) => enqueue("trace", m, a),
};
