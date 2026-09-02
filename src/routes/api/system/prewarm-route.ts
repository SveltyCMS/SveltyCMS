/**
 * @file src/routes/api/system/prewarm-route.ts
 * @description
 * Non-blocking API endpoint for server-side route cache pre-warming.
 *
 * Triggered by predictive preloading (hover, physics cone, or hot paths) to pre-warm
 * RAM caches for target routes (< 1ms execution).
 */

import { routeResourceStateMachine } from "@src/services/core/route-resource-state-machine";
import { json, type RequestHandler } from "@sveltejs/kit";

export const GET: RequestHandler = async ({ url, locals }) => {
  const targetPath = url.searchParams.get("path") || "/dashboard";
  const tenantId = (locals?.tenantId as string) || "global";
  const user = (locals?.user as { _id?: unknown; id?: unknown } | null) ?? null;

  routeResourceStateMachine
    .prewarmRouteResources(targetPath, url.origin, tenantId, user)
    .catch(() => {});

  const spec = routeResourceStateMachine.classifyRouteSpec(targetPath);

  return json({
    success: true,
    path: targetPath,
    lane: spec.lane,
    requiredCacheCategories: spec.requiredCacheCategories,
  });
};
