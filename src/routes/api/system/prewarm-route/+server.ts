/**
 * @file src/routes/api/system/prewarm-route/+server.ts
 * @description
 * Non-blocking API endpoint for server-side route cache pre-warming.
 *
 * Triggered by predictive preloading (hover, physics cone, or hot paths) to pre-warm
 * RAM caches for target routes (< 1ms execution).
 *
 * Features:
 * - Direct SvelteKit server route handler
 * - Single-flight deduplication via RouteResourceStateMachine
 * - Spec classification and JSON summary response
 */

import { routeResourceStateMachine } from "@src/services/core/route-resource-state-machine";
import type { RequestHandler } from "@sveltejs/kit";

export const GET: RequestHandler = async ({ url, locals }) => {
  const targetPath = url.searchParams.get("path") || "/dashboard";
  const tenantId = (locals?.tenantId as string) || "global";

  // Non-blocking background pre-warm — actually fetches the spec's preload
  // endpoints so the response cache holds real entries.
  routeResourceStateMachine.prewarmRouteResources(targetPath, url.origin).catch(() => {});

  // 🤖 AI-Driven Speculative Pre-Warming: also pre-warms predicted next route
  routeResourceStateMachine.speculativePrewarm(targetPath, tenantId, url.origin).catch(() => {});

  const spec = routeResourceStateMachine.classifyRouteSpec(targetPath);

  return Response.json({
    success: true,
    path: targetPath,
    lane: spec.lane,
    requiredCacheCategories: spec.requiredCacheCategories,
  });
};
