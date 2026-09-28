/**
 * @file src/routes/api/[...path]/handlers/streaming.ts
 * @description Streaming response utilities — JSON chunks for large datasets and Server-Sent Events for real-time updates.
 *
 * Features:
 * - Streaming JSON arrays (lower TTFB, reduced memory for large responses)
 * - NDJSON / CSV cursor exports (chunked, backpressure-aware)
 * - Backpressure-aware chunking with configurable safety limits
 * - Graceful error handling — sends partial data + error marker on failure
 * - Client disconnect detection via AbortSignal
 * - Server-Sent Events (SSE) helper for real-time push streams
 */

import { logger } from "@utils/logger";
import {
  csvRowFromRecord,
  encodeCsvHeader,
  encodeNdjsonLine,
  exportContentType,
  type CollectionExportFormat,
} from "@utils/export-encode";
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
  } = {},
) {
  const { maxItems = Infinity } = options;
  const source = iterator as AsyncIterable<any>;
  const iter =
    typeof (source as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === "function"
      ? (source as AsyncIterable<any>)[Symbol.asyncIterator]()
      : (source as any[])[Symbol.iterator]();

  let itemCount = 0;
  let first = true;
  let done = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Opening bracket (pre-encoded zero-allocation chunk)
      controller.enqueue(OPEN_DATA_CHUNK);
    },

    /**
     * Pull-driven: the stream calls this only when its queue wants data, so
     * backpressure is the stream's own model — no timers. The previous
     * `start()`-loop slept a hard-coded 10 ms whenever `desiredSize <= 0`
     * (HWM defaults to 1), which cost 8–15 ms per large list response.
     */
    async pull(controller) {
      if (done) return;
      if (itemCount >= maxItems) {
        finishJsonStream(controller, totalCount, itemCount);
        done = true;
        return;
      }

      let step: IteratorResult<unknown>;
      try {
        step = await iter.next();
      } catch (err) {
        logger.error("[Streaming] Error during JSON stream:", err);
        // Send partial data with an error marker rather than corrupting the JSON
        try {
          controller.enqueue(STREAM_ERROR_CHUNK);
        } catch {
          /* already closed */
        }
        controller.close();
        done = true;
        return;
      }

      if (step.done) {
        finishJsonStream(controller, totalCount, itemCount);
        done = true;
        return;
      }

      if (!first) controller.enqueue(COMMA_CHUNK);
      controller.enqueue(SHARED_TEXT_ENCODER.encode(JSON.stringify(step.value)));
      first = false;
      itemCount++;
    },

    cancel() {
      done = true;
      void (iter as { return?: () => unknown }).return?.();
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

/** Closing bracket + optional metadata — identical bytes to the legacy writer. */
function finishJsonStream(
  controller: ReadableStreamDefaultController<Uint8Array>,
  totalCount: number | undefined,
  itemCount: number,
): void {
  const metadata =
    totalCount !== undefined
      ? `,"metadata":{"totalCount":${totalCount},"returned":${itemCount}}`
      : "";
  controller.enqueue(SHARED_TEXT_ENCODER.encode(`]${metadata}}`));
  controller.close();
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
const NEWLINE_CHUNK = SHARED_TEXT_ENCODER.encode("\n");

export interface StreamingExportOptions {
  format: CollectionExportFormat;
  filename: string;
  columns?: readonly string[];
  maxItems?: number;
}

/**
 * Stream collection entries as NDJSON or CSV from a DB cursor / async iterable.
 * Does not buffer the full result set — each record is encoded and enqueued.
 */
/** True when the dispatcher must not buffer the body to compute an ETag. */
export function isChunkedExportResponse(response: Response): boolean {
  const contentType = response.headers.get("content-type") || "";
  return (
    !!response.headers.get("x-export-format") ||
    contentType.includes("ndjson") ||
    contentType.includes("text/csv") ||
    (response.headers.get("content-disposition") || "").includes("attachment")
  );
}

export function streamingExportResponse(
  iterator: AsyncIterable<any> | any[],
  options: StreamingExportOptions,
): Response {
  const { format, filename, columns = [], maxItems = Infinity } = options;
  const isCsv = format === "csv";
  const source = iterator as AsyncIterable<any>;
  const iter =
    typeof (source as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === "function"
      ? (source as AsyncIterable<any>)[Symbol.asyncIterator]()
      : (source as any[])[Symbol.iterator]();
  let itemCount = 0;
  let done = false;

  // Pull-driven (2026-09-28): the cursor advances only when the stream wants a
  // record, so backpressure is structural — the previous `start()`-loop yielded
  // `setTimeout(0)` per record, a per-row tax on every large export.
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (isCsv) {
        controller.enqueue(SHARED_TEXT_ENCODER.encode(encodeCsvHeader(columns)));
      }
    },

    async pull(controller) {
      if (done) return;
      if (itemCount >= maxItems) {
        finishExportStream(controller, isCsv, itemCount);
        done = true;
        return;
      }

      let step: IteratorResult<unknown>;
      try {
        step = await iter.next();
      } catch (err) {
        logger.error("[StreamingExport] Error during export stream:", err);
        controller.close();
        done = true;
        return;
      }

      if (step.done) {
        finishExportStream(controller, isCsv, itemCount);
        done = true;
        return;
      }

      const record =
        step.value && typeof step.value === "object"
          ? (step.value as Record<string, unknown>)
          : { value: step.value };
      controller.enqueue(
        SHARED_TEXT_ENCODER.encode(
          isCsv ? csvRowFromRecord(record, columns) : encodeNdjsonLine(record),
        ),
      );
      itemCount++;
    },

    cancel() {
      done = true;
      void (iter as { return?: () => unknown }).return?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": exportContentType(format),
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Transfer-Encoding": "chunked",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
      "X-Export-Format": format,
    },
  });
}

/** Empty-NDJSON newline, then close — identical bytes to the legacy writer. */
function finishExportStream(
  controller: ReadableStreamDefaultController<Uint8Array>,
  isCsv: boolean,
  itemCount: number,
): void {
  if (!isCsv && itemCount === 0) {
    controller.enqueue(NEWLINE_CHUNK);
  }
  controller.close();
}

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
