/**
 * @file src/utils/log-export.ts
 * @description Admin log export with sensitive-field redaction for resilience diagnostics.
 *
 * ### Features:
 * - latest / all / archive export modes
 * - text and gzip response formats
 * - line-level secret redaction
 */

import { promises as fs } from "node:fs";
import path from "node:path";

const LOG_DIR = "logs";
const SENSITIVE_PATTERN =
  /(password|secret|token|api[_-]?key|authorization|smtp_pass|db_password)(\s*[:=]\s*)([^\s,}"']+)/gi;

export type LogExportType = "latest" | "all" | "archive";
export type LogExportFormat = "text" | "gzip";

export interface LogExportOptions {
  type?: LogExportType;
  format?: LogExportFormat;
  since?: string;
  level?: string;
}

export function redactLogLine(line: string): string {
  return line.replace(SENSITIVE_PATTERN, (_, key, sep) => `${key}${sep}[REDACTED]`);
}

function parseLogTimestamp(line: string): number | null {
  const match = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
  if (!match) return null;
  return Date.parse(match[1].replace(" ", "T") + "Z");
}

function matchesLevel(line: string, level?: string): boolean {
  if (!level) return true;
  const tag = level.toUpperCase();
  return line.includes(`[${tag.padEnd(5)}]`) || line.includes(`[${tag}]`);
}

async function listLogFiles(type: LogExportType): Promise<string[]> {
  const entries = await fs.readdir(LOG_DIR).catch(() => [] as string[]);
  const files = entries
    .filter((f) => f === "app.log" || (f.startsWith("app.log.") && f.endsWith(".gz")))
    .map((f) => path.join(LOG_DIR, f));

  if (type === "latest") {
    const latest = path.join(LOG_DIR, "app.log");
    try {
      await fs.access(latest);
      return [latest];
    } catch {
      return files.slice(0, 1);
    }
  }

  if (type === "archive") {
    return files.filter((f) => f.endsWith(".gz"));
  }

  return files.sort();
}

async function readLogFile(filePath: string): Promise<string> {
  if (filePath.endsWith(".gz")) {
    const { gunzipSync } = await import("node:zlib");
    const buf = await fs.readFile(filePath);
    return gunzipSync(buf).toString("utf8");
  }
  return fs.readFile(filePath, "utf8");
}

export async function buildLogExport(options: LogExportOptions = {}): Promise<{
  body: string | Buffer;
  contentType: string;
  filename: string;
}> {
  const type = options.type || "latest";
  const format = options.format || "text";
  const sinceMs = options.since ? Date.parse(options.since) : null;

  const files = await listLogFiles(type);
  if (files.length === 0) {
    const empty = "# No log files found\n";
    if (format === "gzip") {
      const { gzipSync } = await import("node:zlib");
      return {
        body: gzipSync(empty),
        contentType: "application/gzip",
        filename: "sveltycms-logs-empty.gz",
      };
    }
    return {
      body: empty,
      contentType: "text/plain; charset=utf-8",
      filename: "sveltycms-logs.txt",
    };
  }

  const chunks: string[] = [];
  for (const file of files) {
    const raw = await readLogFile(file);
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      if (sinceMs && (parseLogTimestamp(line) ?? 0) < sinceMs) continue;
      if (!matchesLevel(line, options.level)) continue;
      chunks.push(redactLogLine(line));
    }
  }

  const text = chunks.join("\n") + (chunks.length ? "\n" : "");
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "gzip") {
    const { gzipSync } = await import("node:zlib");
    return {
      body: gzipSync(text),
      contentType: "application/gzip",
      filename: `sveltycms-logs-${stamp}.gz`,
    };
  }

  return {
    body: text,
    contentType: "text/plain; charset=utf-8",
    filename: `sveltycms-logs-${stamp}.txt`,
  };
}
