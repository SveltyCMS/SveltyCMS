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

import { logger } from "@utils/logger";
// ─── Streaming JSON Response ─────────────────────────────────────────────────

const SHARED_TEXT_ENCODER = new TextEncoder();
const OPEN_DATA_CHUNK = SHARED_TEXT_ENCODER.encode('{"success":true,"data":[');
const COMMA_CHUNK = SHARED_TEXT_ENCODER.encode(",");
const STREAM_ERROR_CHUNK = SHARED_TEXT_ENCODER.encode('],"error":"Stream interrupted"}');

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

  let itemCount = 0;
  let isClosed = false;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Opening bracket (pre-encoded zero-allocation chunk)
        controller.enqueue(OPEN_DATA_CHUNK);

        let first = true;

        for await (const item of iterator as AsyncIterable<any>) {
          if (isClosed) break;
          if (itemCount >= maxItems) break;

          if (!first) controller.enqueue(COMMA_CHUNK);

          controller.enqueue(SHARED_TEXT_ENCODER.encode(JSON.stringify(item)));
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

        controller.enqueue(SHARED_TEXT_ENCODER.encode(`]${metadata}}`));
      } catch (err) {
        logger.error("[Streaming] Error during JSON stream:", err);
        // Send partial data with error marker rather than corrupting the JSON
        try {
          controller.enqueue(STREAM_ERROR_CHUNK);
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

/**
 * Direct zero-copy streaming response for pre-serialized raw JSON slices / buffers.
 * Bypasses JSON.parse() and JSON.stringify() round-trip completely.
 */
export function streamingRawJsonResponse(
  rawChunks: AsyncIterable<string | Uint8Array> | Array<string | Uint8Array>,
  totalCount?: number,
  options: { maxItems?: number; enableBackpressure?: boolean } = {},
) {
  const { maxItems = Infinity, enableBackpressure = true } = options;

  let itemCount = 0;
  let isClosed = false;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(OPEN_DATA_CHUNK);
        let first = true;

        for await (const chunk of rawChunks as AsyncIterable<string | Uint8Array>) {
          if (isClosed || itemCount >= maxItems) break;

          if (!first) controller.enqueue(COMMA_CHUNK);

          if (typeof chunk === "string") {
            controller.enqueue(SHARED_TEXT_ENCODER.encode(chunk));
          } else if (chunk instanceof Uint8Array) {
            controller.enqueue(chunk);
          }
          first = false;
          itemCount++;

          if (
            enableBackpressure &&
            controller.desiredSize !== null &&
            controller.desiredSize <= 0
          ) {
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
        }

        const metadata =
          totalCount !== undefined
            ? `,"metadata":{"totalCount":${totalCount},"returned":${itemCount}}`
            : "";

        controller.enqueue(SHARED_TEXT_ENCODER.encode(`]${metadata}}`));
      } catch (err) {
        logger.error("[StreamingRaw] Error during raw JSON stream:", err);
        try {
          controller.enqueue(STREAM_ERROR_CHUNK);
        } catch {}
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
  const { event = "message", retry = 3000, keepAliveMs = 30000, headers = {} } = options;

  let isClosed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      let keepAlive: ReturnType<typeof setInterval> | null = null;

      // Send retry interval
      controller.enqueue(encoder.encode(`retry: ${retry}\n`));

      // Send initial connected event
      controller.enqueue(
        encoder.encode(
          `event: connected\ndata: ${JSON.stringify({ status: "connected", timestamp: Date.now() })}\n\n`,
        ),
      );

      // Keep-alive timer
      keepAlive = setInterval(() => {
        if (isClosed) {
          if (keepAlive) clearInterval(keepAlive);
          return;
        }
        try {
          controller.enqueue(encoder.encode(": keep-alive\n\n"));
        } catch {
          isClosed = true;
          if (keepAlive) clearInterval(keepAlive);
        }
      }, keepAliveMs);
      if (typeof (keepAlive as any)?.unref === "function") {
        (keepAlive as any).unref();
      }

      // AbortSignal — client disconnection
      const onAbort = () => {
        isClosed = true;
        if (keepAlive) clearInterval(keepAlive);
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

          const payload = `event: ${event}\n` + `data: ${JSON.stringify(data)}\n\n`;

          controller.enqueue(encoder.encode(payload));
        }
      } catch (err) {
        logger.error("[SSE] Error during event stream:", err);
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
        if (keepAlive) clearInterval(keepAlive);
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
