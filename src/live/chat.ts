/**
 * @file src/live/chat.ts
 * @description Real-time AI chat and collaboration logic using svelte-realtime.
 */

import { live } from "svelte-realtime/server";
import { aiService } from "@src/services/core/ai-service";
import { logger } from "@utils/logger";

/**
 * 🚀 Chat Stream
 * Maintains a reactive list of messages for a given room and tenant.
 */
export const chat = live.stream(
  (ctx: any, room: string) => `chat:${room || "ai"}:${ctx.user.tenantId || "default"}`,
  async () => {
    // Initial state: start with empty history
    return [];
  },
  {
    merge: "crud",
    access: (ctx: any) => !!ctx.user?.profile,
  },
);

/**
 * 🛰️ Send Message RPC
 * High-performance WebSocket RPC for sending messages.
 */
export const sendMessage = live(async (ctx: any, { content, room, history = [] }: any) => {
  if (!ctx.user?.profile) throw new Error("Unauthorized");
  if (!content?.trim()) return { success: false, error: "Empty message" };

  const tenantId = ctx.user.tenantId || "default";
  const roomId = room || "ai";
  const topic = `chat:${roomId}:${tenantId}`;

  const userPayload = {
    _id: ctx.user.profile._id.toString(),
    username: ctx.user.profile.username,
    avatar: ctx.user.profile.avatar,
  };

  // 1. Publish User Message
  ctx.publish(topic, "create", {
    id: crypto.randomUUID(),
    role: "user",
    content,
    timestamp: new Date().toISOString(),
    user: userPayload,
  });

  // 2. Trigger AI Response (if in AI room)
  if (roomId === "ai") {
    // We run AI in the background to not block the RPC return
    (async () => {
      try {
        const response = await aiService.chat(content, history);
        ctx.publish(topic, "create", {
          id: crypto.randomUUID(),
          role: "assistant",
          content: response,
          timestamp: new Date().toISOString(),
          user: { _id: "ai", username: "SveltyAgent" },
        });
      } catch (err) {
        logger.error("RTC: AI Processing failed:", err);
      }
    })();
  }

  return { success: true };
});
