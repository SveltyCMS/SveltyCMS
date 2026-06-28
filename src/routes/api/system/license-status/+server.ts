/**
 * @file src/routes/api/system/license-status/+server.ts
 * @description
 * High-performance, cached API endpoint to verify extension license status.
 * License checks hit the cache layer (5-min TTL) — repeated UI polls resolve in <1ms.
 */

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { checkExtensionLicense } from "@src/utils/license-manager";
import { cacheService } from "@src/databases/cache/cache-service";

const ALLOWED_TYPES = new Set(["widget", "plugin", "theme", "dashboard"]);

export const GET: RequestHandler = async ({ url, locals }) => {
  // 1. Guard authorization instantly
  if (!locals.user) {
    return json({ active: false, reason: "Unauthorized" }, { status: 401 });
  }

  const type = url.searchParams.get("type");
  const id = url.searchParams.get("id");

  // 2. Strict early validation — O(1) Set.has()
  if (!type || !id || !ALLOWED_TYPES.has(type)) {
    return json(
      { active: false, reason: "Missing or invalid type/id parameters" },
      { status: 400 },
    );
  }

  const tenantId = (locals.tenantId as string) || "default";
  const cacheKey = `system:license:${type}:${id}`;

  try {
    // 3. Fast-path: L1/R2 cache hit (<1ms)
    const cachedStatus = await cacheService.get(cacheKey, tenantId);
    if (cachedStatus) {
      return json(typeof cachedStatus === "string" ? JSON.parse(cachedStatus) : cachedStatus);
    }

    // 4. Slow-path: actual license verification
    const status = await checkExtensionLicense(type as any, id);

    // 5. Fire-and-forget cache write (5-min TTL)
    if (status) {
      cacheService.set(cacheKey, status, 300, tenantId).catch(() => {});
    }

    return json(status);
  } catch (err: any) {
    return json(
      { active: false, reason: err.message || "Internal validation error" },
      { status: 500 },
    );
  }
};
