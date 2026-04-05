/**
 * @file src/routes/api/[...path]/handlers/content.ts
 * @description Content event and version handlers for the dispatcher.
 */

import { json } from "@sveltejs/kit";
import { AppError } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";

export async function handleContentRoutes(
  event: RequestEvent,
  namespace: string,
  segments: string[],
) {
  const { request } = event;
  const method = segments[1];

  // --- Content Version ---
  if (namespace === "content" && method === "version") {
    const { contentManager } = await import("@src/content");
    return json({ version: contentManager.getContentVersion() });
  }

  // --- Event & Content SSE Streams ---
  if (namespace === "events" || (namespace === "content" && method === "events")) {
    const { eventBus } = await import("@utils/event-bus");
    const stream = new ReadableStream({
      start(controller) {
        let isClosed = false;

        // Initial connection signal
        try {
          controller.enqueue(
            `event: connected\ndata: ${JSON.stringify({ status: "active", timestamp: Date.now() })}\n\n`,
          );
        } catch {
          isClosed = true;
          return;
        }

        const handler = (event: any) => {
          if (!isClosed) {
            try {
              controller.enqueue(`data: ${JSON.stringify(event)}\n\n`);
            } catch {
              isClosed = true;
              eventBus.off("*", handler);
            }
          }
        };

        eventBus.on("*", handler);

        const interval = setInterval(() => {
          if (!isClosed) {
            try {
              controller.enqueue(`: keep-alive\n\n`);
            } catch {
              isClosed = true;
              clearInterval(interval);
              eventBus.off("*", handler);
            }
          }
        }, 30000);

        request.signal.addEventListener("abort", () => {
          if (!isClosed) {
            isClosed = true;
            eventBus.off("*", handler);
            clearInterval(interval);
            try {
              controller.close();
            } catch {}
          }
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  throw new AppError(`Content endpoint /api/${segments.join("/")} not implemented`, 404);
}
