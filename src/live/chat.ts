/**
 * @file src/live/chat.ts
 * @description Real-time AI chat and collaboration logic using svelte-realtime.
 *
 * Handlers have individual access controls via `access` callback and inline auth checks.
 */
// realtime-allow-public

import { live } from "svelte-realtime/server";
import { aiService } from "@src/services/core/ai-service";
import { logger } from "@utils/logger";
import type { User } from "@src/databases/auth/types";

// ====================== TYPES ======================

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  user?: {
    _id: string;
    username: string;
    avatar?: string;
  };
}

interface SendMessagePayload {
  content: string;
  room?: string;
  history?: ChatMessage[];
}

interface ChatContext {
  user: {
    profile: User;
    tenantId?: string;
  };
  publish: (topic: string, action: string, data: any) => void;
}

// ====================== CONSTANTS ======================

const DEFAULT_ROOM = "ai";
const AI_USERNAME = "SveltyAgent";
const AI_USER_ID = "ai";

// ====================== STREAM ======================

/**
 * Reactive chat stream per room + tenant
 */
export const chat = live.stream(
  (ctx: any, room: string = DEFAULT_ROOM): string => {
    const tenantId = ctx.user?.tenantId || "default";
    return `chat:${room}:${tenantId}`;
  },
  async (): Promise<ChatMessage[]> => {
    return []; // Start with empty history
  },
  {
    merge: "crud",
    access: (ctx: any): boolean => !!ctx.user?.profile,
  },
);

// ====================== RPC HANDLER ======================

/**
 * Send message with AI response (for AI room)
 */
export const sendMessage = live(async (ctx: any, payload: SendMessagePayload) => {
  const { content, room = DEFAULT_ROOM, history = [] } = payload;

  // ── Auth & Validation ─────────────────────────────────────
  if (!ctx.user?.profile) {
    throw new Error("Unauthorized: No active session");
  }

  if (!content?.trim()) {
    return { success: false, error: "Message content cannot be empty" };
  }

  if (content.length > 4000) {
    return {
      success: false,
      error: "Message too long (max 4000 characters)",
    };
  }

  const tenantId = ctx.user.tenantId || "default";
  const roomId = room || DEFAULT_ROOM;
  const topic = `chat:${roomId}:${tenantId}`;

  const userPayload = {
    _id: ctx.user.profile._id.toString(),
    username: ctx.user.profile.username,
    avatar: ctx.user.profile.avatar,
  };

  const message: ChatMessage = {
    id: crypto.randomUUID(),
    role: "user",
    content: content.trim(),
    timestamp: new Date().toISOString(),
    user: userPayload,
  };

  // ── Publish user message immediately ─────────────────────
  ctx.publish(topic, "create", message);

  // ── Trigger AI response (non-blocking) ───────────────────
  if (roomId === DEFAULT_ROOM) {
    triggerAIResponse(ctx, topic, content, history, tenantId);
  }

  return { success: true, messageId: message.id };
});

// ====================== HELPER ======================

async function triggerAIResponse(
  ctx: ChatContext,
  topic: string,
  userMessage: string,
  history: ChatMessage[],
  tenantId: string,
) {
  try {
    const responseText = await aiService.chat(userMessage, history);

    const aiMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: responseText,
      timestamp: new Date().toISOString(),
      user: {
        _id: AI_USER_ID,
        username: AI_USERNAME,
      },
    };

    ctx.publish(topic, "create", aiMessage);
  } catch (err: any) {
    logger.error("RTC: AI response failed", {
      error: err.message,
      tenantId,
    });

    // Send error message to user
    ctx.publish(topic, "create", {
      id: crypto.randomUUID(),
      role: "system",
      content: "Sorry, I'm having trouble responding right now.",
      timestamp: new Date().toISOString(),
      user: { _id: AI_USER_ID, username: AI_USERNAME },
    });
  }
}
