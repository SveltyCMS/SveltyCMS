/**
 * @file src/routes/api/events/+server.ts
 * @description Real-time collaboration stream using Server-Sent Events (SSE).
 * Connects to the central Automation EventBus and streams lifecycle events
 * to authenticated clients.
 */

import { eventBus } from "@src/services/automation/event-bus";
import { pubSub } from "@src/services/pub-sub";
import { logger } from "@utils/logger.server";
import { encodeYjsToBase64 } from "@utils/tenant-utils";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals }) => {
  // 1. Authentication Check
  // RTC is only available for authenticated users
  if (!locals.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  logger.debug(`RTC: User ${locals.user.email} connecting to events stream`);

  let heartbeat: ReturnType<typeof setInterval>;
  let unsubscribe: (() => void) | undefined;

  const stream = new ReadableStream({
    start(controller) {
      // 2. Connection Confirmation
      // Sending a small initial payload confirms the connection is active
      controller.enqueue(`data: ${JSON.stringify({ type: "connected", timestamp: new Date().toISOString() })}

`);

      // 3. Subscribe to EventBus
      // We listen for ALL events and filter them by tenantId for isolation
      const tenantId = locals.tenantId;
      unsubscribe = eventBus.on("*", (payload) => {
        // ✨ ISOLATION: Only stream events belonging to the user's tenant
        if (tenantId && payload.tenantId !== tenantId) {
          return;
        }

        try {
          // Format as SSE data chunk
          controller.enqueue(`data: ${JSON.stringify(payload)}

`);
        } catch (err) {
          logger.error("RTC: Error streaming event to client:", err);
        }
      });

      // Handle Yjs sync events from PubSub
      (async () => {
        for await (const data of pubSub.subscribe("yjs:sync")) {
          if (tenantId && data.tenantId !== tenantId) continue;

          try {
            controller.enqueue(`data: ${JSON.stringify({
              event: "yjs:sync",
              docId: data.docId,
              updateBase64: encodeYjsToBase64(data.update),
              origin: data.origin,
              timestamp: new Date().toISOString(),
            })}

`);
          } catch {
            // Ignore
          }
        }
      })();

      // 4. Heartbeat (Ping)
      // Keeps the connection alive and detects hung clients
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(`: heartbeat

`);
        } catch {
          // If enqueue fails, the client disconnected
          if (heartbeat) clearInterval(heartbeat);
          if (unsubscribe) unsubscribe();
          logger.debug(`RTC: Connection closed for ${locals.user?.email} (heartbeat fail)`);
        }
      }, 30_000);
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      if (unsubscribe) unsubscribe();
      logger.debug(`RTC: Stream cancelled by ${locals.user?.email}`);
    },
  });

  // 6. Response Headers
  // Crucial for SSE: no caching, keep-alive, and the correct MIME type
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Disables buffering on Nginx (vital for SSE)
    },
  });
};
