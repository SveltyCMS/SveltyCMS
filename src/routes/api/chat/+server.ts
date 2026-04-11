/**
 * @file src/routes/api/chat/+server.ts
 * @description
 * API endpoint for real-time chat communication.
 * Dispatches messages to the global EventBus and coordinates
 * interactions between users and the AI Assistant.
 *
 * features:
 * - multi-room chat support
 * - real-time message distribution via EventBus
 * - AI Assistant integration and message simulation
 * - authenticated user payload resolution
 */

import { eventBus } from "@src/services/automation/event-bus";
import { aiService } from "@src/services/ai-service";
import { json } from "@sveltejs/kit";
import { logger } from "@utils/logger.server";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request, locals }) => {
  // 1. Authentication Check
  if (!locals.user) {
    return json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { content, room, tab, history = [] } = await request.json();

    if (!content?.trim()) {
      return json({ success: false, message: "Content is required" }, { status: 400 });
    }

    const userPayload = {
      id: locals.user._id.toString(),
      username: locals.user.username,
      email: locals.user.email,
      avatar: locals.user.avatar,
    };

    // 2. Dispatch the user message
    eventBus.emit("chat:message", {
      user: userPayload,
      data: {
        text: content,
        room: room || null,
        tab: tab || "chat",
      },
      tenantId: locals.tenantId!,
    });

    // 3. AI Logic
    // If no room is specified, we assume it's a chat with the AI Assistant
    if (room) {
      logger.debug(
        `RTC: Group Chat message in room ${room} from ${locals.user.username} (tenant: ${locals.tenantId})`,
      );
    } else {
      logger.debug(
        `RTC: AI Chat message from ${locals.user.username} (tenant: ${locals.tenantId})`,
      );

      // Use AIService to get a real response
      // We wrap it in an async IIFE to return the HTTP response immediately
      // while the AI generates its answer in the background (dispatched via EventBus)
      const tenantId = locals.tenantId!;
      (async () => {
        try {
          const aiResponse = await aiService.chat(content, history);

          eventBus.emit("ai:response", {
            user: { _id: "ai", username: "SveltyAgent" },
            data: {
              text: aiResponse,
              done: true,
            },
            tenantId,
          });
        } catch (err) {
          logger.error("RTC: AI Inference failed:", err);
          eventBus.emit("ai:response", {
            user: { _id: "ai", username: "SveltyAgent" },
            data: {
              text: "I encountered an error while processing your request. Please check if Ollama is running.",
              done: true,
            },
            tenantId,
          });
        }
      })();
    }

    return json({ success: true });
  } catch (err) {
    logger.error("RTC: Chat API error:", err);
    return json({ success: false, message: "Internal Server Error" }, { status: 500 });
  }
};
