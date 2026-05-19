/**
 * @file src/live/system.ts
 * @description Real-time system event stream using svelte-realtime.
 * Bridges the internal EventBus to connected WebSocket clients.
 */

import { live } from "svelte-realtime/server";
import { eventBus } from "@utils/event-bus";
import { globalPlatform } from "../hooks.ws";

/**
 * 🚀 System Event Stream
 * Replaces the manual SSE /api/events implementation.
 * Provides filtered, tenant-isolated event broadcasting.
 */
export const events = live.stream(
  (ctx: any) => `system_events:${ctx.user.tenantId || "default"}`,
  async () => {
    // Events are transient, we start with an empty list
    return [];
  },
  {
    merge: "crud",
    access: (ctx: any) => !!ctx.user?.profile, // Must be logged in
  },
);

/**
 * 🛰️ EventBus Bridge
 * Synchronizes internal server events with the WebSocket layer.
 */
eventBus.on("*", (payload: any) => {
  const { event, data } = payload;
  const tenantId = data?.tenantId || "default";
  const topic = `system_events:${tenantId}`;

  if (globalPlatform) {
    globalPlatform.publish(topic, "create", {
      id: crypto.randomUUID(),
      event,
      data,
      timestamp: Date.now(),
    });
  }
});
