/**
 * @file src/utils/logger.ts
 * @description Universal isomorphic logger (Client + Server) with enterprise audit features.
 *
 * Features:
 * - Isomorphic: Works in Browser, Node.js, and Bun.
 * - Server-side Audit: Tamper-evident SHA-256 HMAC log chaining (server-only).
 * - Automatic Rotation: Gzip compression and rotation for server logs.
 * - Smart Formatting: ANSI colors for terminal, CSS styles for browser.
 * - Sensitive Masking: Redacts passwords, tokens, and PII automatically.
 * - Performance: Batching and deduplication to prevent console/disk bottleneck.
 */

import { pc } from "./native-utils";
import type { WriteStream } from "node:fs";

// --- Types & Constants ---

export type LogLevel = "none" | "fatal" | "error" | "warn" | "info" | "debug" | "trace";
export type LoggableValue = string | number | boolean | null | undefined | object | Date | Error;

const PRIORITY: Record<LogLevel, number> = {
  none: 0,
  fatal: 1,
  error: 2,
  warn: 3,
  info: 4,
  debug: 5,
  trace: 6,
};

const ICONS: Record<string, string> = {
  FATAL: "💀",
  ERROR: "❌",
  WARN: "⚠️",
  INFO: "ℹ️",
  DEBUG: "🐛",
  TRACE: "🔍",
  NONE: "",
};

const SENSITIVE = [
  "security",
  "passwd",
  "pwd",
  "token",
  "secret",
  "key",
  "authorization",
  "auth",
  "api_key",
  "apikey",
];
const EMAILS = ["email", "mail"];

const IS_BROWSER = typeof window !== "undefined";

// --- Configuration ---

const LOG_LEVEL_STR = (
  import.meta.env?.VITE_LOG_LEVELS ??
  (typeof process !== "undefined" ? process.env?.LOG_LEVELS : undefined) ??
  "info"
)
  .split(",")[0]
  .trim()
  .toLowerCase() as LogLevel;

const CURRENT_PRIORITY = PRIORITY[LOG_LEVEL_STR] ?? PRIORITY.info;

// --- Masking Logic ---

function mask(v: unknown, depth = 0): unknown {
  if (depth > 10) return "[Depth]";
  if (v === null || typeof v !== "object") return v;
  if (v instanceof Date || v instanceof RegExp || v instanceof Error) return v;
  if (Array.isArray(v)) return v.map((i) => mask(i, depth + 1));

  const o: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v)) {
    const low = k.toLowerCase();
    if (SENSITIVE.some((s) => low.includes(s))) {
      o[k] = "[REDACTED]";
    } else if (EMAILS.some((e) => low.includes(e)) && typeof val === "string") {
      const [local, domain] = val.split("@");
      o[k] = domain ? `${local.slice(0, 2)}***@${domain}` : "***";
    } else {
      o[k] = mask(val, depth + 1);
    }
  }
  return o;
}

// --- Formatting Logic ---

const highlightPatterns = [
  { re: /\b\d+(\.\d+)?(ms|s)\b/g, color: pc.green, css: "color:#22c55e" },
  {
    re: /([a-f0-9]{24}|[a-f0-9]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi,
    color: pc.yellow,
    css: "color:#f59e0b",
  },
  { re: /\/api\/[^\s]+/g, color: pc.cyan, css: "color:#06b6d4" },
  { re: /\b(true)\b/g, color: pc.green, css: "color:#22c55e" },
  { re: /\b(false)\b/g, color: pc.red, css: "color:#ef4444" },
  { re: /\b-?\d+\.?\d*\b/g, color: pc.blue, css: "color:#3b82f6" },
];

function formatMessage(msg: string): string {
  let out = msg;
  for (const { re, color } of highlightPatterns) {
    out = out.replace(re, (m) => color(m));
  }
  return out;
}

// --- Server-Side Engine (Lazy & Gated) ---

let serverEngine: {
  enqueue: (level: LogLevel, msg: string, args: unknown[]) => void;
} | null = null;

if (!IS_BROWSER) {
  // Use a self-invoking async function to initialize server-side deps
  (async () => {
    try {
      const crypto = await import("node:crypto");
      const fs = await import("node:fs");
      const promises = await import("node:fs/promises");
      const path = await import("node:path");
      const sp = await import("node:stream/promises");
      const zlib = await import("node:zlib");

      let stream: WriteStream | null = null;
      let lastHash = "";
      const HMAC_SECRET = process.env.LOG_CHAIN_SECRET || "svelty-cms-default-log-secret";
      const logQueue: { level: LogLevel; msg: string; args: unknown[] }[] = [];
      let isFlushing = false;

      const ensureStream = async () => {
        const dir = "logs";
        const file = path.join(dir, "app.log");
        if (!stream || stream.destroyed) {
          await promises.mkdir(dir, { recursive: true });
          try {
            const content = await promises.readFile(file, "utf8");
            const lastLine = content.trim().split("\n").at(-1);
            if (lastLine) {
              const match = lastLine.match(/\[CHAIN:([a-f0-9]{64})\]/);
              if (match) lastHash = match[1];
            }
          } catch {}
          stream = fs.createWriteStream(file, { flags: "a" });
        }
        return stream;
      };

      const rotate = async () => {
        const dir = "logs";
        const file = path.join(dir, "app.log");
        try {
          const stat = await promises.stat(file);
          if (stat.size < 5 * 1024 * 1024) return;
          if (stream) stream.end();
          const ts = new Date().toISOString().replace(/[:.]/g, "-");
          const rotated = `${file}.${ts}`;
          await promises.rename(file, rotated);
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
        } catch {}
      };

      const flush = async () => {
        if (!logQueue.length || isFlushing) return;
        isFlushing = true;
        const batch = logQueue.splice(0, logQueue.length);
        try {
          const s = await ensureStream();
          await rotate();
          for (const e of batch) {
            const ts = new Date().toISOString().slice(0, 19).replace("T", " ");
            const plainText = `${ts} [${e.level.toUpperCase().padEnd(5)}] ${e.msg} ${JSON.stringify(e.args)}`;
            lastHash = crypto
              .createHmac("sha256", HMAC_SECRET)
              .update(lastHash + plainText)
              .digest("hex");
            const logLine = `${ts} [${e.level.toUpperCase().padEnd(5)}] ${e.msg} ${JSON.stringify(e.args)} [CHAIN:${lastHash}]\n`;
            s.write(logLine);
          }
        } catch (err) {
          console.error("[Logger] Server flush failed", err);
        } finally {
          isFlushing = false;
        }
      };

      serverEngine = {
        enqueue: (level, msg, args) => {
          // Hard cap on log queue to prevent OOM during massive bursts
          if (logQueue.length < 5000) {
            logQueue.push({ level, msg, args });
          }
          if (logQueue.length >= 100) flush();
          else setTimeout(flush, 5000);
        },
      };
    } catch (e) {
      console.error("[Logger] Failed to initialize server engine", e);
    }
  })();
}

// --- Core Logging Implementation ---

function log(level: LogLevel, msg: string, args: unknown[]) {
  if (PRIORITY[level] > CURRENT_PRIORITY) return;

  const ts = new Date().toISOString().slice(0, 19).replace("T", " ");
  const icon = ICONS[level.toUpperCase()] || "●";
  const maskedArgs = args.map((a) => mask(a));
  const method =
    level === "fatal" || level === "error" ? "error" : level === "warn" ? "warn" : "log";

  if (IS_BROWSER) {
    const styles: string[] = [];
    const formattedMsg = msg.replace(
      new RegExp(highlightPatterns.map((p) => p.re.source).join("|"), "gi"),
      (m) => {
        const pattern = highlightPatterns.find((p) => m.match(p.re));
        styles.push(pattern?.css || "color:inherit", "color:inherit");
        return `%c${m}%c`;
      },
    );
    console[method](
      `%c${ts}%c ${icon} [${level.toUpperCase()}] %c${formattedMsg}`,
      "color:#9ca3af",
      "",
      "color:inherit",
      ...styles,
      ...maskedArgs,
    );
  } else {
    const coloredMsg = formatMessage(msg).replace(/\n/g, " ");
    const argsStr = maskedArgs
      .map((a) => {
        if (a instanceof Error) return `\n${pc.red(a.stack || a.message)}`;
        if (typeof a === "object") return JSON.stringify(a).replace(/\n/g, " ");
        return String(a);
      })
      .join(" ");

    console[method](
      `${pc.dim(ts)} ${pc.bold(icon)} [${level.toUpperCase().padEnd(5)}] ${coloredMsg} ${argsStr}`,
    );

    // Send to server audit engine
    serverEngine?.enqueue(level, msg, maskedArgs);
  }
}

// --- Public API ---

export const logger = {
  fatal: (m: string, ...a: unknown[]) => log("fatal", m, a),
  error: (m: string, ...a: unknown[]) => log("error", m, a),
  warn: (m: string, ...a: unknown[]) => log("warn", m, a),
  info: (m: string, ...a: unknown[]) => log("info", m, a),
  debug: (m: string, ...a: unknown[]) => log("debug", m, a),
  trace: (m: string, ...a: unknown[]) => log("trace", m, a),

  channel: (name: string) => ({
    fatal: (m: string, ...a: unknown[]) => log("fatal", `[${name}] ${m}`, a),
    error: (m: string, ...a: unknown[]) => log("error", `[${name}] ${m}`, a),
    warn: (m: string, ...a: unknown[]) => log("warn", `[${name}] ${m}`, a),
    info: (m: string, ...a: unknown[]) => log("info", `[${name}] ${m}`, a),
    debug: (m: string, ...a: unknown[]) => log("debug", `[${name}] ${m}`, a),
    trace: (m: string, ...a: unknown[]) => log("trace", `[${name}] ${m}`, a),
  }),

  dump: (data: unknown, label?: string) => {
    if (PRIORITY.trace > CURRENT_PRIORITY) return;
    const prefix = label ? `DUMP[${label}]` : "DUMP";
    if (IS_BROWSER) {
      console.group(`🔍 ${prefix}`);
      console.dir(mask(data), { depth: null });
      console.groupEnd();
    } else {
      log("trace", prefix, [data]);
    }
  },
};
