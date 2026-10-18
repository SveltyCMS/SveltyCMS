/**
 * @file src/routes/api/[...path]/handlers/system/system-transfer.ts
 * @description Importer, export, and import routes for content transfer.
 */

import { AppError } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/content/types";
import { successResponse } from "../base";
import { isMultiTenantEnabled } from "@utils/tenant-isolation.server";
import { streamingArrayResponse } from "../streaming";

/**
 * --- IMPORTER ---
 */
export async function handleImporterRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const action = segments[1];
  const { request, locals } = event;
  const { user } = locals;

  if (request.method === "POST") {
    const body = await request.json();
    if (action === "external")
      return successResponse(
        event,
        await cms.system.importer.importExternal(body, { user, tenantId }),
      );
    if (action === "scaffold")
      return successResponse(event, await cms.system.importer.scaffold(body));
    return successResponse(event, await cms.system.importer.importData(body, { tenantId }));
  }
  throw new AppError(`Importer route not implemented`, 404);
}

/**
 * --- EXPORT ---
 */
export async function handleExportRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  _segments: string[],
) {
  const { request } = event;
  if (isMultiTenantEnabled() && !tenantId) {
    throw new AppError("Tenant ID required", 400, "TENANT_REQUIRED");
  }
  if (request.method === "POST") {
    const { type, preview } = await request.json().catch(() => ({}));
    if (type === "users") {
      const result = await cms.auth.listUsers({ tenantId });
      if (!result.success) throw new AppError(result.message || "Failed to list users", 500);
      const items = Array.isArray(result.data) ? result.data : [];
      return streamingArrayResponse(items, items.length);
    }
    if (type === "static-site") {
      const { publishStaticSite } = await import("@src/services/site/static-publisher.server");
      // `preview: true` renders a route manifest without swapping the live directory.
      const result = await publishStaticSite({ tenantId, dryRun: preview === true });
      return successResponse(event, result);
    }
    return successResponse(event, { success: true, message: "Export started" });
  }
  throw new AppError("Method Not Allowed", 405);
}

/**
 * --- IMPORT ---
 */
export async function handleImportRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const { request } = event;
  if (isMultiTenantEnabled() && !tenantId) {
    throw new AppError("Tenant ID required", 400, "TENANT_REQUIRED");
  }
  const action = segments[1];

  if (request.method === "POST") {
    const { data } = await request.json().catch(() => ({}));
    if (action === "full" && data?.settings) {
      await cms.db.system.preferences.set("SITE_NAME", data.settings.SITE_NAME, {
        scope: "system",
        tenantId: tenantId as DatabaseId,
      });
    }
    return successResponse(event, { success: true });
  }
  throw new AppError("Method Not Allowed", 405);
}
