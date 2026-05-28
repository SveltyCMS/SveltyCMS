/**
 * @file src/routes/api/[...path]/handlers/streaming.ts
 * @description Streaming response utilities — JSON chunks for large datasets and Server-Sent Events for real-time updates.
 *
 * Features:
 * - Streaming JSON arrays (lower TTFB, reduced memory for large responses)
 * - Backpressure-aware chunking with configurable safety limits
 * - Graceful error handling — sends partial data + error marker on failure
 * - Client disconnect detection via AbortSignal
 * - Server-Sent Events (SSE) helper for real-time push streams
 */

// ─── Streaming JSON Response ─────────────────────────────────────────────────

/**
 * Creates a streaming JSON response from an async iterable or array.
 *
 * @param iterator - Async iterable (cursor, generator) or plain array
 * @param totalCount - Optional total count included in response metadata
 * @param options - Streaming options for safety limits and backpressure
 */
export function streamingJsonResponse(
  iterator: AsyncIterable<any> | any[],
  totalCount?: number,
  options: {
    maxItems?: number;
    enableBackpressure?: boolean;
  } = {},
) {
  const { maxItems = Infinity, enableBackpressure = true } = options;
  const encoder = new TextEncoder();

  let itemCount = 0;
  let isClosed = false;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Opening bracket
        controller.enqueue(encoder.encode('{"success":true,"data":['));

        let first = true;

        for await (const item of iterator as AsyncIterable<any>) {
          if (isClosed) break;
          if (itemCount >= maxItems) break;

          if (!first) controller.enqueue(encoder.encode(","));

          controller.enqueue(encoder.encode(JSON.stringify(item)));
          first = false;
          itemCount++;

          // Backpressure — yield to the event loop if the buffer is full
          if (
            enableBackpressure &&
            controller.desiredSize !== null &&
            controller.desiredSize <= 0
          ) {
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
        }

        // Closing metadata — includes both total and returned counts
        const metadata =
          totalCount !== undefined
            ? `,"metadata":{"totalCount":${totalCount},"returned":${itemCount}}`
            : "";

        controller.enqueue(encoder.encode(`]${metadata}}`));
      } catch (err) {
        console.error("[Streaming] Error during JSON stream:", err);
        // Send partial data with error marker rather than corrupting the JSON
        try {
          controller.enqueue(encoder.encode(`],"error":"Stream interrupted"}`));
        } catch {
          /* already closed */
        }
      } finally {
        if (!isClosed) {
          controller.close();
          isClosed = true;
        }
      }
    },

    cancel() {
      isClosed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/json",
      "Transfer-Encoding": "chunked",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-cache",
    },
  });
}

/**
 * Convenience wrapper for streaming plain arrays (non-async iterables).
 */
export function streamingArrayResponse(
  items: any[],
  totalCount?: number,
  options?: { maxItems?: number },
) {
  return streamingJsonResponse(items, totalCount, options);
}

// ─── Server-Sent Events (SSE) ────────────────────────────────────────────────

/**
 * Options for creating an SSE stream.
 */
export interface SSEOptions {
  /** Custom event type (defaults to "message") */
  event?: string;
  /** Max retry interval in milliseconds for client reconnection */
  retry?: number;
  /** Keep-alive interval in ms (default 30000 — every 30s) */
  keepAliveMs?: number;
  /** Custom headers to merge with defaults */
  headers?: Record<string, string>;
}

/**
 * Creates a Server-Sent Events (SSE) stream from an async iterable.
 * Each yielded value is serialized as JSON and sent as an SSE data event.
 *
 * @param iterator - Async iterable that yields event payloads
 * @param signal - AbortSignal from the request for client-disconnect detection
 * @param options - SSE configuration (event type, retry, keep-alive)
 *
 * @example
 * // In a handler:
 * const events = eventBus.subscribe("content:*");
 * return sseStreamingResponse(events, event.request.signal, { event: "update" });
 */
export function sseStreamingResponse(
  iterator: AsyncIterable<any>,
  signal?: AbortSignal,
  options: SSEOptions = {},
) {
  const {
    event = "message",
    retry = 3000,
    keepAliveMs = 30000,
    headers = {},
  } = options;

  let isClosed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // Send retry interval
      controller.enqueue(encoder.encode(`retry: ${retry}\n`));

      // Send initial connected event
      controller.enqueue(
        encoder.encode(
          `event: connected\ndata: ${JSON.stringify({ status: "connected", timestamp: Date.now() })}\n\n`,
        ),
      );

      // Keep-alive timer
      const keepAlive = setInterval(() => {
        if (isClosed) {
          clearInterval(keepAlive);
          return;
        }
        try {
          controller.enqueue(encoder.encode(": keep-alive\n\n"));
        } catch {
          isClosed = true;
          clearInterval(keepAlive);
        }
      }, keepAliveMs);

      // AbortSignal — client disconnection
      const onAbort = () => {
        isClosed = true;
        clearInterval(keepAlive);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      signal?.addEventListener("abort", onAbort, { once: true });

      // Iterate events
      try {
        for await (const data of iterator) {
          if (isClosed) break;

          const payload =
            `event: ${event}\n` + `data: ${JSON.stringify(data)}\n\n`;

          controller.enqueue(encoder.encode(payload));
        }
      } catch (err) {
        console.error("[SSE] Error during event stream:", err);
        try {
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({ error: "Stream interrupted" })}\n\n`,
            ),
          );
        } catch {
          /* already closed */
        }
      } finally {
        clearInterval(keepAlive);
        signal?.removeEventListener("abort", onAbort);
        if (!isClosed) {
          controller.close();
          isClosed = true;
        }
      }
    },

    cancel() {
      isClosed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering
      ...headers,
    },
  });
}
