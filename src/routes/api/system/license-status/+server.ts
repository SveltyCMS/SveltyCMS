/**
 * @file src/routes/api/system/license-status/+server.ts
 * @description
 * High-performance, cached API endpoint to verify extension license status.
 * Uses stale-while-revalidate to prevent cache stampede on popular extensions.
 * License checks hit the cache layer (5-min TTL) — repeated UI polls resolve in <1ms.
 */

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { checkExtensionLicense } from "@src/utils/license-manager";
import { cacheService } from "@src/databases/cache/cache-service";
import { logger } from "@utils/logger";

const ALLOWED_TYPES = ["widget", "plugin", "theme", "dashboard"] as const;

export const GET: RequestHandler = async ({ url, locals }) => {
  // 1. Guard authorization instantly
  if (!locals.user) {
    return json({ active: false, reason: "Unauthorized" }, { status: 401 });
  }

  const type = url.searchParams.get("type");
  const id = url.searchParams.get("id");

  // 2. Strict early validation with type narrowing
  if (!id || !type || !(ALLOWED_TYPES as readonly string[]).includes(type)) {
    return json(
      { active: false, reason: "Missing or invalid type/id parameters" },
      { status: 400 },
    );
  }

  const tenantId = (locals.tenantId as string) || "default";
  const cacheKey = `system:license:${tenantId}:${type}:${id}`;

  try {
    // 3. Fast-path: L1/R2 cache hit with SWR to prevent stampede
    const status = await cacheService.getOrSetSWR(
      cacheKey,
      () => checkExtensionLicense(type as "widget" | "plugin" | "theme" | "dashboard", id),
      300_000, // 5 min fresh
      600_000, // 10 min stale (served while revalidating)
      tenantId,
    );

    return json(status);
  } catch (err: any) {
    logger.error(`License check failed for ${type}/${id} (tenant: ${tenantId}):`, err);
    return json({ active: false, reason: "Internal validation error" }, { status: 500 });
  }
};
