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

function requireAdmin(event: RequestEvent): void {
  const { user, locals } = event;
  if (locals.isAdmin || user?.role === "admin" || user?.role === "super-admin") return;
  throw new AppError("Admin access required", 403, "FORBIDDEN");
}

export async function handleLogsRoutes(
  event: RequestEvent,
  _cms: LocalCMS,
  _tenantId: DatabaseId,
  segments: string[],
) {
  requireAdmin(event);

  const action = segments[1];

  if (event.request.method === "GET" && action === "download") {
    const { url } = event;
    const type = (url.searchParams.get("type") || "latest") as LogExportType;
    const format = (url.searchParams.get("format") || "text") as LogExportFormat;
    const since = url.searchParams.get("since") || undefined;
    const level = url.searchParams.get("level") || undefined;

    if (!["latest", "all", "archive"].includes(type)) {
      throw new AppError("Invalid type parameter", 400, "VALIDATION_ERROR");
    }
    if (!["text", "gzip"].includes(format)) {
      throw new AppError("Invalid format parameter", 400, "VALIDATION_ERROR");
    }

    const exported = await buildLogExport({ type, format, since, level });

    return new Response(exported.body, {
      status: 200,
      headers: {
        "Content-Type": exported.contentType,
        "Content-Disposition": `attachment; filename="${exported.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  throw new AppError(`Logs endpoint /api/logs/${action || ""} not implemented`, 404);
}
