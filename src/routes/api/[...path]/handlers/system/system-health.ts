/**
 * @file src/routes/api/[...path]/handlers/system/system-health.ts
 * @description Cached health-report route for the system dispatcher.
 */

import { getHeapStatistics } from "node:v8";
import { getHardwareProfile, hardwareDiagnostics } from "@utils/hardware-profile";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/content/types";

let lastHealthReport = "";
let lastHealthTime = 0;
let lastHealthOverallState = "";

export function invalidateHealthCache(): void {
  lastHealthReport = "";
  lastHealthTime = 0;
  lastHealthOverallState = "";
}

export async function handleHealthRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  _tenantId: DatabaseId,
  _segments: string[],
) {
  const { request } = event;
  const failExternal = request.headers.get("x-test-fail-external") === "true";
  const now = Date.now();

  const { getOverallState, isSystemReady } = await import("@src/stores/system/state.svelte");
  const currentOverallState = getOverallState();

  // 🛡️ CIRCUIT BREAKER AUDIT: If requested, simulate a degraded state
  if (failExternal) {
    const isUp = await cms.db.isConnected();
    return new Response(
      JSON.stringify({
        status: "degraded",
        overallStatus: "DEGRADED",
        state: "DEGRADED",
        database: isUp ? "connected" : "disconnected",
        external: { status: "failed", message: "Simulated External Outage" },
        uptime: process.uptime(),
        timestamp: now,
      }),
      { status: 202, headers: { "Content-Type": "application/json" } },
    );
  }

  // 🚀 PERFORMANCE: Memoization of health report with state-change invalidation.
  // Verbose (hardware) requests are excluded — their payload differs, so caching
  // one shape would serve the other.
  const verbose =
    request.headers.has("x-verbose") || new URL(request.url).searchParams.get("verbose") === "true";
  if (
    !verbose &&
    lastHealthReport &&
    now - lastHealthTime < 10000 &&
    lastHealthOverallState === currentOverallState &&
    !request.headers.has("x-refresh")
  ) {
    return new Response(lastHealthReport, {
      headers: { "Content-Type": "application/json", "X-Cached": "TRUE" },
    });
  }

  const isUp = await cms.db.isConnected();
  const { getDatabaseResilience } = await import("@src/databases/database-resilience");
  const metrics = getDatabaseResilience().getMetrics();
  const ready = isSystemReady();
  // 🖥️ HARDWARE (verbose only): what THIS machine derived — the numbers the
  // pools, caches, workers and compression levels were sized from. `heapAligned`
  // is the actionable one: false means the runtime's V8 ceiling is not aligned
  // with the memory the OS allows (start via `index.cjs`, or set NODE_OPTIONS).
  const hw = verbose ? getHardwareProfile() : null;
  const heapLimitBytes = verbose ? getHeapStatistics().heap_size_limit : 0;
  const report = {
    status: isUp ? "healthy" : "degraded",
    overallStatus: currentOverallState,
    state: currentOverallState,
    ready,
    database: isUp ? "connected" : "disconnected",
    latency: 0, // Simplified for high-frequency checks
    serverTime: new Date().toISOString(),
    uptime: process.uptime(),
    dbType: process.env.DB_TYPE || "unknown",
    resilience: {
      circuitState: metrics.circuitState,
      totalRetries: metrics.totalRetries,
      successfulReconnections: metrics.successfulReconnections,
    },
    ...(hw ? { hardware: hardwareDiagnostics(hw, heapLimitBytes) } : {}),
  };

  const reportString = JSON.stringify({
    success: true,
    overallStatus: currentOverallState,
    status: isUp ? "healthy" : "degraded",
    state: currentOverallState,
    ready,
    data: report,
  });
  lastHealthReport = reportString;
  lastHealthTime = now;
  lastHealthOverallState = currentOverallState;

  return new Response(reportString, {
    headers: { "Content-Type": "application/json" },
  });
}
