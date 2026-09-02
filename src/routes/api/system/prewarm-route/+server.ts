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
  const user = (locals?.user as { _id?: unknown; id?: unknown } | null) ?? null;

  // Hovered/target path: await LocalCMS fill so the following click can TURBO-HIT.
  await routeResourceStateMachine
    .prewarmRouteResources(targetPath, url.origin, tenantId, user)
    .catch(() => {});

  // Confidence-gated next-path + hot entries stay non-blocking.
  routeResourceStateMachine
    .speculativePrewarm(targetPath, tenantId, url.origin, user)
    .catch(() => {});

  const spec = routeResourceStateMachine.classifyRouteSpec(targetPath);

  return Response.json({
    success: true,
    path: targetPath,
    lane: spec.lane,
    requiredCacheCategories: spec.requiredCacheCategories,
  });
};
