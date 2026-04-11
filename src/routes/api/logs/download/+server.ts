/**
 * @file src/routes/api/logs/download/+server.ts
 * @description API endpoint to download error logs from the server
 *
 * This endpoint allows administrators to download server error logs for troubleshooting.
 * Supports filtering by date range and log level, and can return logs in plain text or compressed format.
 *
 * Query Parameters:
 * - type: 'latest' | 'all' | 'archive' (default: 'latest')
 * - format: 'text' | 'gzip' (default: 'text')
 * - since: ISO date string (optional, filter logs after this date)
 * - level: 'error' | 'warn' | 'fatal' (optional, filter by log level)
 *
 * Authorization: Requires admin role
 */

// type RequestHandler removed
// error removed
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
/**
 * Download error logs from the server
 * GET /api/logs/download
 */
// Unified Error Handling
import { apiHandler } from "@utils/api-handler";
import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger.server";

import { getPrivateSettingSync } from "@src/services/settings-service";

/**
 * Download error logs from the server
 * GET /api/logs/download
 */
export const GET = apiHandler(async ({ url, locals }) => {
  const { user, tenantId } = locals;
  const isMultiTenant = getPrivateSettingSync("MULTI_TENANT");

  try {
    // 1. Authentication & Authorization
    if (!user) {
      throw new AppError("Authentication required", 401, "UNAUTHORIZED");
    }

    const userRole = user.role;
    const isSuperAdmin = userRole === "super-admin";
    const isAdmin = userRole === "admin" || isSuperAdmin;

    if (!isAdmin && !isSuperAdmin) {
      throw new AppError("Admin access required to download logs", 403, "FORBIDDEN");
    }

    // SECURITY: In multi-tenant mode, only super-admins can access global logs
    if (isMultiTenant && !isSuperAdmin) {
      logger.warn(
        `Unauthorized log download attempt by tenant admin ${user._id} (tenant: ${tenantId})`,
      );
      throw new AppError(
        "Insufficient permissions: Only super-admins can download system logs in multi-tenant mode.",
        403,
        "FORBIDDEN",
      );
    }

    // Get query parameters
    const type = url.searchParams.get("type") || "latest";
    const format = url.searchParams.get("format") || "text";
    const sinceParam = url.searchParams.get("since");
    const levelFilter = url.searchParams.get("level");

    // (Rest of parameter validation...)
    if (!["latest", "all", "archive"].includes(type)) {
      throw new AppError("Invalid type parameter.", 400, "INVALID_PARAM");
    }
    if (!["text", "gzip"].includes(format)) {
      throw new AppError("Invalid format parameter.", 400, "INVALID_PARAM");
    }

    let sinceDate: Date | null = null;
    if (sinceParam) {
      sinceDate = new Date(sinceParam);
      if (Number.isNaN(sinceDate.getTime())) {
        throw new AppError("Invalid since date format.", 400, "INVALID_PARAM");
      }
    }

    // Determine log file path
    const logsDir = join(process.cwd(), "logs");
    const logFiles: string[] = [];

    if (type === "latest") {
      const latestLog = join(logsDir, "app.log");
      if (existsSync(latestLog)) logFiles.push(latestLog);
    } else if (type === "all") {
      if (existsSync(logsDir)) {
        const files = readdirSync(logsDir)
          .filter((f) => f.startsWith("app.log"))
          .map((f) => join(logsDir, f))
          .sort((a, b) => statSync(b).mtime.getTime() - statSync(a).mtime.getTime());
        logFiles.push(...files);
      }
    } else if (type === "archive") {
      if (existsSync(logsDir)) {
        const files = readdirSync(logsDir)
          .filter((f) => f.startsWith("app.log.") && f.endsWith(".gz"))
          .map((f) => join(logsDir, f))
          .sort((a, b) => statSync(b).mtime.getTime() - statSync(a).mtime.getTime());
        logFiles.push(...files);
      }
    }

    if (logFiles.length === 0) {
      throw new AppError("No log files found", 404, "NOT_FOUND");
    }

    // Combine and filter logs (always filter in multi-tenant mode or if filters provided)
    // We pass tenantId if we want to filter logs for a specific tenant (e.g. if we allowed tenant admins later)
    const combinedLogs = await combineLogs(
      logFiles,
      sinceDate,
      levelFilter,
      isMultiTenant ? undefined : tenantId || undefined,
    );

    logger.info("Log download requested", {
      user: user.email,
      type,
      format,
      tenantId,
      linesReturned: combinedLogs.split("\n").length,
    });

    if (format === "gzip") {
      const buffer = Buffer.from(combinedLogs, "utf-8");
      const compressed = await compressBuffer(buffer);
      return new Response(new Uint8Array(compressed), {
        status: 200,
        headers: {
          "Content-Type": "application/gzip",
          "Content-Disposition": `attachment; filename="app-logs-${new Date().toISOString().split("T")[0]}.log.gz"`,
          "Content-Encoding": "gzip",
          "Cache-Control": "no-cache",
        },
      });
    }

    return new Response(combinedLogs, {
      status: 200,
      headers: {
        "Content-Type": "text/plain",
        "Content-Disposition": `attachment; filename="app-logs-${new Date().toISOString().split("T")[0]}.txt"`,
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error("Error downloading logs", { error: err });
    throw new AppError("Failed to download logs", 500, "DOWNLOAD_FAILED");
  }
});

// Update combine logic
async function combineLogs(
  logFiles: string[],
  since: Date | null,
  level: string | null,
  tenantId?: string,
): Promise<string> {
  const { readFile } = await import("node:fs/promises");
  const { createGunzip } = await import("node:zlib");
  const { Readable } = await import("node:stream");

  const allLogs: string[] = [];
  for (const file of logFiles) {
    try {
      let content: string;
      if (file.endsWith(".gz")) {
        const compressed = await readFile(file);
        const gunzip = createGunzip();
        const chunks: Buffer[] = [];
        await pipeline(Readable.from(compressed), gunzip, async function* (source) {
          for await (const chunk of source) {
            chunks.push(chunk);
            yield;
          }
        });
        content = Buffer.concat(chunks).toString("utf-8");
      } else {
        content = await readFile(file, "utf-8");
      }

      const lines = content.split("\n");
      const filtered = lines.filter((line) => {
        if (!line.trim()) return false;
        try {
          const log = JSON.parse(line);
          if (since && log.timestamp && new Date(log.timestamp) < since) return false;
          if (level && log.level && log.level.toLowerCase() !== level.toLowerCase()) return false;
          if (tenantId && log.tenantId && log.tenantId !== tenantId) return false;
          return true;
        } catch {
          if (level) return line.toLowerCase().includes(level.toLowerCase());
          if (tenantId) return line.includes(tenantId);
          return true;
        }
      });
      allLogs.push(...filtered);
    } catch (err) {
      logger.warn(`Failed to read log file: ${file}`, { error: err });
    }
  }
  return allLogs.join("\n");
}

// Compress buffer to gzip
async function compressBuffer(buffer: Buffer): Promise<Buffer> {
  const gzip = createGzip();
  const chunks: Buffer[] = [];

  await pipeline(Readable.from(buffer), gzip, async function* (source) {
    for await (const chunk of source) {
      chunks.push(chunk);
      yield; // Satisfy generator requirement
    }
  });

  return Buffer.concat(chunks);
}
