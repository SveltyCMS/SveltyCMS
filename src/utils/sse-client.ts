/**
 * @file src/utils/sse-client.ts
 * @description Tolerant decoding and error classification for Server-Sent Events clients.
 *
 * ### Why this module exists
 * `EventSource.onmessage` used to feed `event.data` straight into `JSON.parse` inside a
 * `try/catch` that reported every failure as `console.error`. Two distinct problems
 * followed from that:
 *
 * 1. A payload that is not JSON (a comment line, an empty frame, a truncated body, or a
 *    document the server redacted into invalid JSON) threw on every frame, so a single
 *    transport hiccup looked like a product error.
 * 2. The connection-error handler could not tell a page teardown from a failed reconnect,
 *    so normal navigation logged `console.error` and even re-armed the connection.
 *
 * The helpers below keep both decisions explicit and testable:
 * - {@link parseSseData} never throws and never hands an invalid document to `JSON.parse`
 *   consumers; comments (`:` prefix) and empty payloads are reported, not parsed.
 * - {@link SseFrameBuffer} is the per-stream buffer for raw chunked streams (`fetch` +
 *   `body.getReader()`): frames split across chunks are reassembled, so a partial frame
 *   is never parsed.
 * - {@link classifySseError} separates teardown from failure and the browser's own
 *   reconnect from a reconnect that actually failed.
 */

/** `EventSource.readyState` values, spelled out so tests need no DOM. */
export const SSE_CONNECTING = 0;
export const SSE_OPEN = 1;
export const SSE_CLOSED = 2;

/** Reasons a payload is not delivered to the caller. */
export type SseParseFailure = "empty" | "comment" | "invalid-json";

export type SseParseResult = { ok: true; value: unknown } | { ok: false; reason: SseParseFailure };

/** `field: value` / `field:value` framing for the SSE text stream. */
const FRAME_FIELD = /^(data|event|id|retry)(?::[ ]?|$)/;
/** Any line terminator the SSE spec allows. */
const LINE_BREAK = /\r\n|\r|\n/;

/**
 * Parses the payload of an SSE event into JSON.
 *
 * Accepts `event.data` as the browser hands it over (bare payload) as well as a whole
 * frame (with `data:`/`event:` prefixes, possibly multi-line). Comment lines are skipped
 * — a server that emits `: keep-alive` must never reach `JSON.parse`.
 */
export function parseSseData(raw: string | null | undefined): SseParseResult {
  if (typeof raw !== "string" || raw.length === 0) return { ok: false, reason: "empty" };

  const dataLines: string[] = [];
  let sawComment = false;

  for (const line of raw.split(LINE_BREAK)) {
    if (line.length === 0) continue;
    if (line.startsWith(":")) {
      sawComment = true;
      continue;
    }

    const field = FRAME_FIELD.exec(line);
    if (!field) {
      // No framing prefix: the browser already stripped it, or the payload is raw JSON.
      dataLines.push(line);
      continue;
    }
    if (field[1] === "data") dataLines.push(line.slice(field[0].length));
  }

  if (dataLines.length === 0) return { ok: false, reason: sawComment ? "comment" : "empty" };

  // The EventSource spec joins multiple `data:` lines with a newline.
  const payload = dataLines.join("\n");
  if (payload.trim().length === 0) return { ok: false, reason: "empty" };

  try {
    return { ok: true, value: JSON.parse(payload) };
  } catch {
    return { ok: false, reason: "invalid-json" };
  }
}

/** One decoded SSE frame. */
export interface SseFrame {
  /** Value of the frame's `event:` field, when present. */
  event?: string;
  /** Joined `data:` payload (raw text — feed it to {@link parseSseData}). */
  data: string;
  /** Value of the frame's `id:` field, when present. */
  id?: string;
}

/** Splits a `\n\n`-terminated block into a frame, or `null` for a comment-only block. */
function parseEventBlock(block: string): SseFrame | null {
  const dataLines: string[] = [];
  let event: string | undefined;
  let id: string | undefined;

  for (const line of block.split("\n")) {
    if (line.length === 0 || line.startsWith(":")) continue;

    const field = FRAME_FIELD.exec(line);
    if (!field) continue;

    const value = line.slice(field[0].length);
    if (field[1] === "data") dataLines.push(value);
    else if (field[1] === "event") event = value;
    else if (field[1] === "id") id = value;
  }

  if (dataLines.length === 0 && event === undefined) return null;
  return { event, data: dataLines.join("\n"), id };
}

/**
 * Incremental SSE decoder for raw text streams.
 *
 * Holds the bytes of an unterminated frame in a per-stream buffer, so a chunk boundary
 * inside `data:` (or inside the blank-line terminator) can never produce a half-parsed
 * payload. Line endings are normalised, with a trailing `\r` left pending because the
 * next chunk may start with the `\n` that completes the CRLF pair.
 */
export class SseFrameBuffer {
  private buffer = "";

  /** Bytes of the frame currently being assembled (empty between frames). */
  get pending(): string {
    return this.buffer;
  }

  /** Feeds one chunk of the stream and returns the frames it completed. */
  push(chunk: string): SseFrame[] {
    if (!chunk) return [];

    this.buffer += chunk;

    const trailingCr = this.buffer.endsWith("\r");
    let text = trailingCr ? this.buffer.slice(0, -1) : this.buffer;
    text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    this.buffer = trailingCr ? `${text}\r` : text;

    const frames: SseFrame[] = [];
    let end = this.buffer.indexOf("\n\n");
    while (end !== -1) {
      const frame = parseEventBlock(this.buffer.slice(0, end));
      if (frame) frames.push(frame);
      this.buffer = this.buffer.slice(end + 2);
      end = this.buffer.indexOf("\n\n");
    }
    return frames;
  }

  /**
   * Releases the tail of the stream. A last frame that never received its blank-line
   * terminator is returned rather than dropped; an incomplete block is discarded by the
   * caller when `parseSseData` rejects it.
   */
  flush(): SseFrame[] {
    if (this.buffer.length === 0) return [];

    const frame = parseEventBlock(this.buffer.replace(/\r\n?/g, "\n").trim());
    this.buffer = "";
    return frame ? [frame] : [];
  }

  /** Drops the buffered partial frame (stream restarted). */
  reset(): void {
    this.buffer = "";
  }
}

/** Where the connection error is logged. `silent` means: do not touch the console. */
export type SseLogLevel = "silent" | "debug" | "warn" | "error";

export interface SseErrorContext {
  /** `EventSource.readyState` when the error fired (omit when unavailable). */
  readyState?: number | null;
  /** True when the client itself closes the stream: page navigation, explicit stop. */
  teardown?: boolean;
  /** Consecutive errors since the last `onopen` (default 1). */
  consecutiveFailures?: number;
}

export interface SseErrorVerdict {
  level: SseLogLevel;
  /** Whether the caller must schedule its own reconnect. */
  reconnect: boolean;
}

/** A reconnect that failed this many times in a row is a real failure, not a hiccup. */
const SSE_FAILURE_LOG_THRESHOLD = 3;

/**
 * Decides how loud an `EventSource` error should be, and whether the caller has to
 * reconnect on its own.
 *
 * Teardown is distinguished from failure by *who* closed the stream: navigation or an
 * explicit `close()` sets `teardown` before the error can fire, so it is silent.
 * A failure is distinguished from a hiccup by `readyState`: while it is `CONNECTING` the
 * browser is already retrying by itself (the first error is expected noise), whereas
 * `CLOSED` means the browser gave up and the caller has to act. Only after
 * {@link SSE_FAILURE_LOG_THRESHOLD} consecutive failures is an error logged.
 */
export function classifySseError(context: SseErrorContext = {}): SseErrorVerdict {
  if (context.teardown) return { level: "silent", reconnect: false };
  if (context.readyState === SSE_OPEN) return { level: "silent", reconnect: false };
  if (context.readyState === SSE_CLOSED) return { level: "error", reconnect: true };

  const failures = Math.max(0, Math.trunc(context.consecutiveFailures ?? 1));
  if (failures < 2) return { level: "silent", reconnect: false };
  if (failures < SSE_FAILURE_LOG_THRESHOLD) return { level: "warn", reconnect: false };
  return { level: "error", reconnect: true };
}
