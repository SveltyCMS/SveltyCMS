/**
 * @file src/routes/api/content/events/+server.ts
 * @description
 * Server-Sent Events (SSE) endpoint for real-time content updates.
 * Pushes reconcile, update, and reorder events to connected clients.
 */

import { eventBus, SystemEvents } from "@utils/event-bus";
import { logger } from "@utils/logger.server";
import type { RequestHandler } from "@sveltejs/kit";

/**
 * SSE Stream Handler
 */
export const GET: RequestHandler = ({ locals }) => {
  const { tenantId } = locals;

  const stream = new ReadableStream({
    start(controller) {
      // 1. Send initial connection success message
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode('data: {"type":"connected"}\n\n'));

      // 2. Define the listener
      const onContentUpdate = (data: any) => {
        // Filter by tenantId if applicable
        if (data.tenantId !== "all" && tenantId && data.tenantId !== tenantId) {
          return;
        }

        try {
          logger.debug(`[SSE] Sending content update to client [${data.type}]`);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch (err) {
          logger.warn(
            `[SSE] Failed to enqueue content update: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      };

      // 3. Subscribe to the event bus
      eventBus.on(SystemEvents.CONTENT_UPDATE, onContentUpdate);

      // 4. Keep-alive heartbeat (every 30s) to prevent timeout
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          // Normal if client disconnected
          clearInterval(heartbeat);
        }
      }, 30000);

      // 5. Cleanup on close
      return () => {
        logger.debug("[SSE] Closing content event stream");
        eventBus.off(SystemEvents.CONTENT_UPDATE, onContentUpdate);
        clearInterval(heartbeat);
      };
    },
    cancel() {
      logger.debug("[SSE] Stream cancelled by client");
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Bypass Nginx buffering
    },
  });
};
