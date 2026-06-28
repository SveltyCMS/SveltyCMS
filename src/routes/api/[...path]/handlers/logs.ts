/**
 * @file src/routes/api/[...path]/handlers/logs.ts
 * @description Admin log export for resilience diagnostics and support bundles.
 *
 * ### Features:
 * - GET /api/logs/download (admin-only, redacted)
 */

import { AppError } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/content/types";
import { buildLogExport, type LogExportFormat, type LogExportType } from "@src/utils/log-export";

const VALID_LOG_LEVELS = new Set(["debug", "info", "warn", "error", "fatal"]);

function requireAdmin(event: RequestEvent): void {
  const { locals } = event;
  const user = locals.user as Record<string, any> | undefined;
  const role = user?.role;

  if (locals.isAdmin || role === "admin" || role === "super-admin") return;
  throw new AppError("Admin access required", 403, "FORBIDDEN");
}

export async function handleLogsRoutes(
  event: RequestEvent,
  _cms: LocalCMS,
  _tenantId: DatabaseId,
  segments: string[],
) {
  requireAdmin(event);

  const method = event.request.method;
  const action = segments.length > 1 ? segments[1] : undefined;

  if (action === "download") {
    if (method !== "GET")
      throw new AppError(`Method ${method} not allowed`, 405, "METHOD_NOT_ALLOWED");

    const { url } = event;
    const type = (url.searchParams.get("type") || "latest") as LogExportType;
    const format = (url.searchParams.get("format") || "text") as LogExportFormat;

    if (!["latest", "all", "archive"].includes(type)) {
      throw new AppError("Invalid type parameter", 400, "VALIDATION_ERROR");
    }
    if (!["text", "gzip"].includes(format)) {
      throw new AppError("Invalid format parameter", 400, "VALIDATION_ERROR");
    }

    const since = url.searchParams.get("since") || undefined;
    const rawLevel = url.searchParams.get("level")?.toLowerCase();
    const level = rawLevel && VALID_LOG_LEVELS.has(rawLevel) ? rawLevel : undefined;

    const exported = await buildLogExport({ type, format, since, level });

    return new Response(exported.body as any, {
      status: 200,
      headers: {
        "Content-Type": exported.contentType,
        "Content-Disposition": `attachment; filename="${exported.filename}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  throw new AppError(`Logs endpoint /api/logs/${action || ""} not implemented`, 404);
}
