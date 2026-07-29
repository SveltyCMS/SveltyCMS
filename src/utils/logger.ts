/**
 * @file src/utils/logger.ts
 * @description Shared logger core — masking, formatting, levels. Works everywhere.
 *
 * ### Hardening (audit 2026-07):
 * - C++ boundary bottleneck: env vars cached at module load (IIFE), not per-call
 * - O(n×m) redaction: arrays replaced with pre-compiled RegExp patterns
 * - Cyclic reference protection: WeakSet tracker prevents infinite recursion
 * - Error objects: extract {name, message, stack} instead of raw (prevents API key leaks)
 * - Browser regex: pre-compiled once at module root, not per-message
 * - Masking: lazy — only called when args are present
 */

import { pc } from "./native-utils";

// ── Types ──
export type LogLevel = "none" | "fatal" | "error" | "warn" | "info" | "debug" | "trace";
export type LoggableValue = string | number | boolean | null | undefined | object | Date | Error;

// ── Priorities ──
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
  FATAL: "\u{1F480}",
  ERROR: "\u274C",
  WARN: "\u26A0\uFE0F",
  INFO: "\u2139\uFE0F",
  DEBUG: "\u{1F41B}",
  TRACE: "\u{1F50D}",
  NONE: "",
};

// ── Environment flags (IIFE — cached at module load) ──────────────────────
const IS_BROWSER = typeof window !== "undefined";
const ENV = IS_BROWSER ? (import.meta as any).env : process?.env;
const IS_QUIET = ENV?.QUIET === "true" || ENV?.BENCHMARK === "true";
const IS_BENCHMARK_DEBUG = ENV?.BENCHMARK_DEBUG === "true";

const CURRENT_LOG_LEVEL = (() => {
  const raw = (
    ENV?.LOG_LEVELS ??
    ENV?.LOG_LEVEL ??
    ENV?.VITE_LOG_LEVELS ??
    (ENV?.NODE_ENV === "production" ? "error" : "info")
  )
    .split(",")[0]
    .trim()
    .toLowerCase() as LogLevel;
  return PRIORITY[raw] !== undefined ? raw : "info";
})();

const CURRENT_PRIORITY = PRIORITY[CURRENT_LOG_LEVEL];

// ── Sensitive data masking (compiled regex — C++ native matching) ──────────
const SENSITIVE_REGEX = /(password|passwd|pwd|token|secret|key|authorization|auth|api_key|apikey)/i;
const EMAIL_REGEX = /(email|mail|userid|username)/i;

function mask(v: unknown, depth = 0, seen = new WeakSet()): unknown {
  if (depth > 10) return "[Max Depth Exceeded]";
  if (v === null || typeof v !== "object") return v;
  if (v instanceof Date || v instanceof RegExp) return v;
  if (v instanceof Error) {
    return { name: v.name, message: v.message, stack: v.stack };
  }
  if (seen.has(v)) return "[Circular]";
  seen.add(v);
  if (Array.isArray(v)) return v.map((i) => mask(i, depth + 1, seen));
  const o: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v)) {
    if (SENSITIVE_REGEX.test(k)) {
      o[k] = "[REDACTED]";
    } else if (typeof val === "string" && EMAIL_REGEX.test(k)) {
      const idx = val.indexOf("@");
      o[k] = idx > -1 ? `${val.slice(0, 2)}***${val.slice(idx)}` : "***";
    } else {
      o[k] = mask(val, depth + 1, seen);
    }
  }
  return o;
}

// ── Formatting ─────────────────────────────────────────────────────────────
const HIGHLIGHTS = [
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

const BROWSER_HIGHLIGHT_REGEX = IS_BROWSER
  ? new RegExp(HIGHLIGHTS.map((p) => p.re.source).join("|"), "gi")
  : null;

function formatAnsi(msg: string): string {
  let out = msg;
  for (let i = 0; i < HIGHLIGHTS.length; i++) {
    out = out.replace(HIGHLIGHTS[i].re, (m) => HIGHLIGHTS[i].color(m));
  }
  return out;
}

// ── Core log function ──────────────────────────────────────────────────────
function log(level: LogLevel, msg: string, args: unknown[]) {
  if (PRIORITY[level] > CURRENT_PRIORITY) return;
  if (!IS_BROWSER && IS_QUIET && !IS_BENCHMARK_DEBUG && PRIORITY[level] > PRIORITY.warn) return;

  const ts = new Date().toISOString().slice(0, 19).replace("T", " ");
  const icon = ICONS[level.toUpperCase()] || "\u25CF";
  const method =
    level === "fatal" || level === "error" ? "error" : level === "warn" ? "warn" : "log";

  if (IS_BROWSER) {
    const styles: string[] = [];
    const formatted = msg.replace(BROWSER_HIGHLIGHT_REGEX!, (m) => {
      const pattern = HIGHLIGHTS.find((p) => m.match(p.re));
      styles.push(pattern?.css || "color:inherit", "color:inherit");
      return `%c${m}%c`;
    });
    const maskedArgs = args.length > 0 ? args.map((a) => mask(a)) : args;
    console[method](
      `%c${ts}%c ${icon} [${level.toUpperCase()}] %c${formatted}`,
      "color:#9ca3af",
      "",
      "color:inherit",
      ...styles,
      ...maskedArgs,
    );
  } else {
    const maskedArgs = args.length > 0 ? args.map((a) => mask(a)) : args;
    const colored = formatAnsi(msg).replace(/\n/g, " ");
    let argsStr = "";
    if (maskedArgs.length > 0) {
      argsStr =
        " " +
        maskedArgs
          .map((a) => {
            if (a instanceof Error) return `\n${pc.red(a.stack || a.message)}`;
            if (typeof a === "object" && a !== null) return JSON.stringify(a).replace(/\n/g, " ");
            return String(a);
          })
          .join(" ");
    }
    console[method](
      `${pc.dim(ts)} ${pc.bold(icon)} [${level.toUpperCase().padEnd(5)}] ${colored}${argsStr}`,
    );
  }
}

// ── Public API ─────────────────────────────────────────────────────────────
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
      console.group(`\u{1F50D} ${prefix}`);
      console.dir(mask(data), { depth: null });
      console.groupEnd();
    } else {
      log("trace", prefix, [data]);
    }
  },
};
