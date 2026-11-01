/**
 * @file tests/unit/utils/sse-client.test.ts
 * @description Unit tests for the tolerant SSE client helpers.
 *
 * ### Features:
 * - a corrupted frame (the `[REDACTED]` timestamp seen in CI) never throws
 * - comment lines (`: keep-alive`) and empty payloads are skipped, not parsed
 * - multi-line `data:` payloads and a whole raw frame are accepted
 * - chunk-split streams are reassembled by a per-stream buffer
 * - the connection-error policy stays silent for teardown and for the browser's
 *   own automatic reconnect
 */

import { describe, expect, it } from "vitest";
import {
  SSE_CLOSED,
  SSE_CONNECTING,
  SSE_OPEN,
  SseFrameBuffer,
  classifySseError,
  parseSseData,
} from "@utils/sse-client";

/** The exact payload the CI run reported as `Unexpected token 'R'`. */
const BROKEN_FRAME = '{"type":"content_update","event":"content:update","timestamp":[REDACTED]}';

const GOOD_FRAME = '{"type":"content_update","event":"content:update","timestamp":1793522984546}';

describe("parseSseData", () => {
  it("parses a well-formed event payload", () => {
    const result = parseSseData(GOOD_FRAME);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        type: "content_update",
        event: "content:update",
        timestamp: 1793522984546,
      });
    }
  });

  it("never throws on the frame that broke CI", () => {
    expect(() => parseSseData(BROKEN_FRAME)).not.toThrow();
    expect(parseSseData(BROKEN_FRAME)).toEqual({ ok: false, reason: "invalid-json" });
  });

  it("rejects a frame truncated mid-token without throwing", () => {
    // Transport dies after the last chunk: no closing brace ever arrives.
    const truncated = '{"type":"content_update","timestamp":17935229';
    expect(() => parseSseData(truncated)).not.toThrow();
    expect(parseSseData(truncated)).toEqual({ ok: false, reason: "invalid-json" });
  });

  it("skips comment lines instead of parsing them", () => {
    expect(parseSseData(": keep-alive")).toEqual({ ok: false, reason: "comment" });
    expect(parseSseData(": connected\n: ready")).toEqual({ ok: false, reason: "comment" });
  });

  it("treats empty and missing payloads as empty, not as invalid JSON", () => {
    expect(parseSseData("")).toEqual({ ok: false, reason: "empty" });
    expect(parseSseData("   \n ")).toEqual({ ok: false, reason: "empty" });
    expect(parseSseData(null)).toEqual({ ok: false, reason: "empty" });
    expect(parseSseData(undefined)).toEqual({ ok: false, reason: "empty" });
  });

  it("accepts a whole raw frame including its data: field", () => {
    const result = parseSseData(`event: settings:update\ndata: ${GOOD_FRAME}`);
    expect(result.ok).toBe(true);
  });

  it("joins a multi-line data payload the way EventSource does", () => {
    const result = parseSseData('data: {"type":"reconcile",\ndata: "n":1}');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ type: "reconcile", n: 1 });
  });
});

describe("SseFrameBuffer", () => {
  const stream =
    ": connected\n\n" +
    `data: ${GOOD_FRAME}\n\n` +
    ": keep-alive\n\n" +
    'event: settings:update\ndata: {"key":"siteName","value":"Blog"}\n\n';

  it("decodes a stream delivered in one chunk", () => {
    const frames = new SseFrameBuffer().push(stream);
    expect(frames).toHaveLength(2);
    expect(frames[0].data).toBe(GOOD_FRAME);
    expect(frames[1]).toEqual({
      event: "settings:update",
      data: '{"key":"siteName","value":"Blog"}',
    });
  });

  it("reassembles the same frames when every byte arrives separately", () => {
    const buffer = new SseFrameBuffer();
    const frames = [];
    for (const char of stream) frames.push(...buffer.push(char));

    expect(frames).toHaveLength(2);
    expect(frames[0].data).toBe(GOOD_FRAME);
    expect(frames[1].event).toBe("settings:update");
    expect(buffer.pending).toBe("");
  });

  it("handles CRLF framing split between chunks", () => {
    const buffer = new SseFrameBuffer();
    const frames = [...buffer.push(`data: ${GOOD_FRAME}\r`), ...buffer.push("\n\r\n")];

    expect(frames).toHaveLength(1);
    expect(frames[0].data).toBe(GOOD_FRAME);
  });

  it("does not emit a frame from a chunk that ends inside the payload", () => {
    const buffer = new SseFrameBuffer();
    const half = stream.indexOf(GOOD_FRAME) + 10;

    expect(buffer.push(stream.slice(0, half))).toHaveLength(0);
    expect(buffer.pending.length).toBeGreaterThan(0);
    expect(buffer.push(stream.slice(half))).toHaveLength(2);
  });

  it("flush() releases a final frame that lacks its blank-line terminator", () => {
    const buffer = new SseFrameBuffer();
    expect(buffer.push(`data: ${GOOD_FRAME}`)).toHaveLength(0);
    const frames = buffer.flush();

    expect(frames).toHaveLength(1);
    expect(frames[0].data).toBe(GOOD_FRAME);
    expect(buffer.pending).toBe("");
  });
});

describe("classifySseError", () => {
  it("stays silent for a normal teardown (page navigation, explicit close)", () => {
    expect(classifySseError({ teardown: true, readyState: SSE_CLOSED })).toEqual({
      level: "silent",
      reconnect: false,
    });
  });

  it("stays silent while the browser retries on its own", () => {
    expect(classifySseError({ readyState: SSE_CONNECTING, consecutiveFailures: 1 })).toEqual({
      level: "silent",
      reconnect: false,
    });
  });

  it("escalates once the reconnect has actually failed", () => {
    expect(classifySseError({ readyState: SSE_CONNECTING, consecutiveFailures: 2 }).level).toBe(
      "warn",
    );

    const third = classifySseError({ readyState: SSE_CONNECTING, consecutiveFailures: 3 });
    expect(third.level).toBe("error");
    expect(third.reconnect).toBe(true);
  });

  it("reports a permanent failure (readyState CLOSED) as an error", () => {
    expect(classifySseError({ readyState: SSE_CLOSED, consecutiveFailures: 1 })).toEqual({
      level: "error",
      reconnect: true,
    });
  });

  it("does not escalate a healthy state", () => {
    expect(classifySseError({ readyState: SSE_OPEN, consecutiveFailures: 0 })).toEqual({
      level: "silent",
      reconnect: false,
    });
  });
});
