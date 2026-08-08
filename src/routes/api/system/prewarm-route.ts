/**
 * @file src/routes/api/system/prewarm-route.ts
 * @description
 * Non-blocking API endpoint for server-side route cache pre-warming.
 *
 * Triggered by predictive preloading (hover, physics cone, or hot paths) to pre-warm
 * RAM caches for target routes (< 1ms execution).
 */

import { routeResourceStateMachine } from "@src/services/core/route-resource-state-machine";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url }) => {
  const targetPath = url.searchParams.get("path") || "/dashboard";

  // Non-blocking background pre-warm
  routeResourceStateMachine.prewarmRouteResources(targetPath).catch(() => {});

  const spec = routeResourceStateMachine.classifyRouteSpec(targetPath);

  return json({
    success: true,
    path: targetPath,
    lane: spec.lane,
    requiredCacheCategories: spec.requiredCacheCategories,
  });
};
