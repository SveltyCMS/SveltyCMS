/**
 * @file src/live/system.ts
 * @description Real-time system event stream using svelte-realtime.
 * Bridges the internal EventBus to connected WebSocket clients with tenant isolation.
 *
 * Handlers have individual access controls via `access` callback.
 */
// realtime-allow-public

import { live } from "svelte-realtime/server";
import { eventBus } from "@utils/event-bus";
import { globalPlatform } from "@src/live/ws-platform";
import { logger } from "@utils/logger";

// ====================== TYPES ======================

export interface SystemEvent {
  id: string;
  event: string;
  data: any;
  timestamp: number;
  tenantId: string;
}

// ====================== CONSTANTS ======================

const DEFAULT_TENANT_ID = "default";

// ====================== SYSTEM EVENTS STREAM ======================

/**
 * Tenant-isolated real-time system events stream.
 * Replaces previous SSE-based /api/events endpoint.
 */
export const events = live.stream(
  (ctx: any): string => {
    const tenantId = ctx.user?.tenantId || DEFAULT_TENANT_ID;
    return `system_events:${tenantId}`;
  },
  async (): Promise<SystemEvent[]> => {
    return []; // Events are transient (no persistent history)
  },
  {
    merge: "crud",
    access: (ctx: any): boolean => {
      // Allow test-mode / benchmark connections that may bypass full auth
      if (process.env.TEST_MODE === "true" || process.env.SVELTY_BENCHMARK_SUITE === "true") {
        return !!ctx.user;
      }
      return !!ctx.user?.profile; // Must be authenticated in production
    },
  },
);

// ====================== EVENTBUS BRIDGE ======================

/**
 * Pre-filter: only bridge events matching these prefixes to WebSocket clients.
 * Reduces unnecessary CPU cycles from internal events (cache, metrics, etc.)
 * that don't need real-time broadcasting.
 */
const BRIDGE_EVENT_PREFIXES = [
  "content.",
  "collection.",
  "media.",
  "user.",
  "auth.",
  "system.",
  "benchmark.",
];

function shouldBridgeEvent(event: string): boolean {
  return BRIDGE_EVENT_PREFIXES.some((prefix) => event.startsWith(prefix));
}

/**
 * Bridges internal EventBus events to all connected WebSocket clients.
 * Automatically handles tenant isolation.
 */
eventBus.on("*", (payload: any) => {
  try {
    if (!globalPlatform) {
      // This can happen during startup or in certain test environments
      return;
    }

    const { event, data } = payload || {};
    if (!event) return;

    // 🚀 Performance: skip events that don't need real-time broadcasting
    if (!shouldBridgeEvent(event)) return;

    const tenantId = data?.tenantId || DEFAULT_TENANT_ID;
    const topic = `system_events:${tenantId}`;

    const systemEvent: SystemEvent = {
      id: crypto.randomUUID(),
      event,
      data: data || {},
      timestamp: Date.now(),
      tenantId,
    };

    (globalPlatform as any).publish(topic, "create", systemEvent);
  } catch (err) {
    logger.error("Failed to bridge EventBus to WebSocket", err);
  }
});
