/**
 * @file src/utils/api-body-limits.ts
 * @description Shared request-body ceilings for the catch-all API dispatcher.
 *
 * `src/routes/api/[...path]/+server.ts` enforces {@link API_MAX_BODY_SIZE_BYTES}
 * for write verbs: a declared `Content-Length` is rejected before any byte is read,
 * and a `Transfer-Encoding: chunked` body is bounded on the bytes actually received.
 * Streaming consumers get that same ceiling as a counted pass-through stream and
 * still enforce the budget incrementally themselves, so an oversized upload is
 * dropped mid-flight instead of being buffered first.
 *
 * ### Features:
 * - single source of truth for the API request-body budget
 * - canonical 413 `PAYLOAD_TOO_LARGE` message for declared and observed sizes
 * - streaming-route allowlist for bodies that must stay undrained
 * - zero-copy chunked-body counter that cancels the client at the ceiling
 * - buffered drain + request rebuild for endpoints needing a re-readable body
 */

import { raise } from "@utils/error-handling";

/** Maximum accepted API request body: 15 MB (allows 10 MB multipart uploads). */
export const API_MAX_BODY_SIZE_BYTES = 15 * 1024 * 1024;

/**
 * Canonical 413 message for both the declared and the observed body size. The
 * ceiling is derived from {@link API_MAX_BODY_SIZE_BYTES} so the two cannot drift.
 */
export function bodyTooLargeMessage(bytes: number): string {
  const maxMb = API_MAX_BODY_SIZE_BYTES / 1024 / 1024;
  return `Request body too large (${(bytes / 1024 / 1024).toFixed(1)}MB). Maximum is ${maxMb}MB.`;
}

/**
 * Routes whose handler consumes `request.body` incrementally (the streaming multipart
 * parser in `handlers/media.ts`). They keep that read path and receive the counted
 * pass-through stream instead of a buffered body: the dispatcher still enforces
 * {@link API_MAX_BODY_SIZE_BYTES} on the bytes, and the route's own same-ceiling cap
 * stays the first reader to trip for an oversized multipart part.
 */
const STREAMING_BODY_ROUTES = new Set(["media/stream"]);

/**
 * Whether `namespace` + `action` (the second path segment) is a body-streaming route,
 * i.e. one that must receive {@link boundApiRequestBody}'s counted stream undrained
 * instead of a buffered body.
 */
export function isStreamingBodyRoute(namespace: string, action?: string): boolean {
  return STREAMING_BODY_ROUTES.has(`${namespace}/${action ?? ""}`);
}

/**
 * undici requires `duplex: "half"` for a streamed request body, but the DOM `RequestInit`
 * type does not declare the field. The intersection documents the extra key and is
 * assignable to `RequestInit` — no widening to `any`, no runtime change.
 */
type StreamingRequestInit = RequestInit & { duplex: "half" };

/**
 * Pass-through counter for a body that carries no `Content-Length`
 * (`Transfer-Encoding: chunked`). Nothing is buffered — each chunk is handed on as
 * it arrives — and the client stream is cancelled the moment the shared ceiling is
 * crossed, so `request.json()` / `request.formData()` in the routed handler fail
 * with 413 instead of growing heap unbounded.
 */
export function boundApiRequestBody(request: Request): Request {
  const source = request.body;
  if (!source) return request;

  const reader = source.getReader();
  let received = 0;

  const counted = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      if (!value) return;

      received += value.byteLength;
      if (received > API_MAX_BODY_SIZE_BYTES) {
        // Stop pulling from the client before failing — nothing past the cap is kept.
        await reader.cancel().catch(() => {});
        raise(413, bodyTooLargeMessage(received), "PAYLOAD_TOO_LARGE");
      }

      controller.enqueue(value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });

  return new Request(request, {
    method: request.method,
    headers: request.headers,
    body: counted,
    duplex: "half",
  } as StreamingRequestInit);
}

/**
 * Drains a chunked body through {@link boundApiRequestBody} so an oversized write is
 * rejected before the endpoint runs, then rebuilds the request from the bounded bytes.
 * Costs a single cap-sized buffer and only for bodies without `Content-Length` — the
 * declared-length fast path never reaches this function.
 */
export async function readBoundedApiBody(request: Request): Promise<Request> {
  const bounded = boundApiRequestBody(request);
  if (bounded === request) return request;

  const reader = bounded.body!.getReader();
  // `request.body` yields `Uint8Array<ArrayBuffer>` (lib.dom); the explicit argument keeps that
  // in the accumulator so the rebuilt body is assignable to `BodyInit`, whose `BufferSource` is
  // pinned to `ArrayBufferView<ArrayBuffer>`.
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let total = 0;

  // `read()` rejects with the canonical 413 AppError once the cap is crossed.
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    total += value.byteLength;
  }

  const first = chunks[0];
  let bytes: Uint8Array<ArrayBuffer>;
  if (chunks.length === 1 && first) {
    bytes = first;
  } else {
    bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
  }

  return new Request(request, {
    method: request.method,
    headers: request.headers,
    body: bytes,
  });
}
