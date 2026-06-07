/**
 * @file src/routes/api/health/+server.ts
 * @description
 * Lightweight health endpoint that returns the current system state
 * and service health indicators for the warming-up UI to poll.
 *
 * Features:
 * - Returns overall system state, service statuses, and uptime
 * - No authentication required (public bootstrap endpoint)
 * - Optimized for high-frequency polling (1s intervals)
 * - Minimal overhead: single system state lookup
 */

import { json } from "@sveltejs/kit";
import type { RequestEvent } from "@sveltejs/kit";
import { getSystemState } from "@src/stores/system/state.svelte.ts";

export async function GET(_event: RequestEvent) {
  const state = getSystemState();
  const overallState = state.overallState;

  // Map service statuses for the warming-up UI
  const services: Record<string, { status: string; message: string }> = {};
  for (const [name, svc] of Object.entries(state.services)) {
    services[name] = {
      status: svc.status,
      message: svc.message,
    };
  }

  const body = {
    success: true,
    data: {
      state: overallState,
      services: {
        database: services.database || {
          status: "unknown",
          message: "Not checked",
        },
        auth: services.auth || { status: "unknown", message: "Not checked" },
        cache: services.cache || { status: "unknown", message: "Not checked" },
        content: services.contentSystem || {
          status: "unknown",
          message: "Not checked",
        },
      },
      uptime: process.uptime(),
      timestamp: Date.now(),
    },
  };

  return json(body);
}
