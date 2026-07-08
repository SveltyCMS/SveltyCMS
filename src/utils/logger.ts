/**
 * @file src/utils/logger.ts
 * @description Shared logger core — masking, formatting, levels. Works everywhere.
 *
 * For server features (file logging, rotation, audit chaining), import from
 * `@utils/logger.server` which wraps this logger with SvelteKit .server.ts protection.
 */

import { pc } from "./native-utils";

// ── Types ──
export type LogLevel = "none" | "fatal" | "error" | "warn" | "info" | "debug" | "trace";
export type LoggableValue = string | number | boolean | null | undefined | object | Date | Error;

// ── Priorities ──
const PRIORITY: Record<LogLevel, number> = {
  none: 0, fatal: 1, error: 2, warn: 3, info: 4, debug: 5, trace: 6,
};

const ICONS: Record<string, string> = {
  FATAL: "\u{1F480}", ERROR: "\u274C", WARN: "\u26A0\uFE0F",
  INFO: "\u2139\uFE0F", DEBUG: "\u{1F41B}", TRACE: "\u{1F50D}", NONE: "",
};

// ── Sensitive data masking ──
const SENSITIVE = ["password", "passwd", "pwd", "token", "secret", "key", "authorization", "auth", "api_key", "apikey"];
const EMAILS = ["email", "mail", "userid", "username"];

function mask(v: unknown, depth = 0): unknown {
  if (depth > 10) return "[Depth]";
  if (v === null || typeof v !== "object") return v;
  if (v instanceof Date || v instanceof RegExp || v instanceof Error) return v;
  if (Array.isArray(v)) return v.map((i) => mask(i, depth + 1));
  const o: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v)) {
    const low = k.toLowerCase();
    if (SENSITIVE.some((s) => low.includes(s))) o[k] = "[REDACTED]";
    else if (EMAILS.some((e) => low.includes(e)) && typeof val === "string") {
      const [local, domain] = val.split("@");
      o[k] = domain ? `${local.slice(0, 2)}***@${domain}` : "***";
    } else o[k] = mask(val, depth + 1);
  }
  return o;
}

// ── Formatting ──
const HIGHLIGHTS = [
  { re: /\b\d+(\.\d+)?(ms|s)\b/g, color: pc.green, css: "color:#22c55e" },
  { re: /([a-f0-9]{24}|[a-f0-9]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi, color: pc.yellow, css: "color:#f59e0b" },
  { re: /\/api\/[^\s]+/g, color: pc.cyan, css: "color:#06b6d4" },
  { re: /\b(true)\b/g, color: pc.green, css: "color:#22c55e" },
  { re: /\b(false)\b/g, color: pc.red, css: "color:#ef4444" },
  { re: /\b-?\d+\.?\d*\b/g, color: pc.blue, css: "color:#3b82f6" },
];

function formatAnsi(msg: string): string {
  let out = msg;
  for (const { re, color } of HIGHLIGHTS) out = out.replace(re, (m) => color(m));
  return out;
}

// ── Environment ──
const IS_BROWSER = typeof window !== "undefined";

function getLogLevel(): LogLevel {
  const raw = (
    (typeof process !== "undefined" ? process.env?.LOG_LEVELS || process.env?.LOG_LEVEL : undefined) ??
    (import.meta as any).env?.VITE_LOG_LEVELS ??
    ((typeof process !== "undefined" && process.env?.NODE_ENV === "production") ? "error" : "info")
  ).split(",")[0].trim().toLowerCase() as LogLevel;
  return PRIORITY[raw] !== undefined ? raw : "info";
}

// ── Core log function ──
function log(level: LogLevel, msg: string, args: unknown[]) {
  const currentPrio = PRIORITY[getLogLevel()] ?? PRIORITY.info;
  if (PRIORITY[level] > currentPrio) return;

  // Quiet mode
  if (
    typeof process !== "undefined" &&
    (process.env?.QUIET === "true" || process.env?.BENCHMARK === "true") &&
    process.env?.BENCHMARK_DEBUG !== "true" &&
    PRIORITY[level] > PRIORITY.warn
  ) return;

  const ts = new Date().toISOString().slice(0, 19).replace("T", " ");
  const icon = ICONS[level.toUpperCase()] || "\u25CF";
  const maskedArgs = args.map((a) => mask(a));
  const method = level === "fatal" || level === "error" ? "error" : level === "warn" ? "warn" : "log";

  if (IS_BROWSER) {
    const styles: string[] = [];
    const formatted = msg.replace(
      new RegExp(HIGHLIGHTS.map((p) => p.re.source).join("|"), "gi"),
      (m) => {
        const pattern = HIGHLIGHTS.find((p) => m.match(p.re));
        styles.push(pattern?.css || "color:inherit", "color:inherit");
        return `%c${m}%c`;
      },
    );
    console[method](`%c${ts}%c ${icon} [${level.toUpperCase()}] %c${formatted}`, "color:#9ca3af", "", "color:inherit", ...styles, ...maskedArgs);
  } else {
    const colored = formatAnsi(msg).replace(/\n/g, " ");
    const argsStr = maskedArgs.map((a) => {
      if (a instanceof Error) return `\n${pc.red(a.stack || a.message)}`;
      if (typeof a === "object" && a !== null) return JSON.stringify(a).replace(/\n/g, " ");
      return String(a);
    }).join(" ");
    console[method](`${pc.dim(ts)} ${pc.bold(icon)} [${level.toUpperCase().padEnd(5)}] ${colored} ${argsStr}`);
  }
}

// ── Public API ──
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
    if (PRIORITY.trace > (PRIORITY[getLogLevel()] ?? PRIORITY.info)) return;
    const prefix = label ? `DUMP[${label}]` : "DUMP";
    if (IS_BROWSER) { console.group(`\u{1F50D} ${prefix}`); console.dir(mask(data), { depth: null }); console.groupEnd(); }
    else log("trace", prefix, [data]);
  },
};
