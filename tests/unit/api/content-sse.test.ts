/**
 * @file tests/unit/api/content-sse.test.ts
 * @description Tests for SSE event payload normalization, tenant filtering, wire frames,
 * and the debounced flush scheduler that replaced the per-connection 32ms interval.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";
import type { DatabaseId } from "@src/content/types";
import { redactSecretsDeep } from "@utils/security/stream-redaction";
import { SseFrameBuffer, parseSseData } from "@utils/sse-client";
import { eventBus } from "@utils/event-bus";
import {
  handleContentEventsStream,
  normalizeSseEventPayload,
} from "../../../src/routes/api/[...path]/handlers/content";

describe("normalizeSseEventPayload", () => {
  it("maps content:update to content_update type", () => {
    const result = normalizeSseEventPayload({
      event: "content:update",
      data: { version: 42, tenantId: "all" },
    });

    expect(result).toMatchObject({
      type: "content_update",
      event: "content:update",
      version: 42,
      tenantId: "all",
    });
    expect(result?.timestamp).toBeTypeOf("number");
  });

  it("filters events for a different tenant", () => {
    const result = normalizeSseEventPayload(
      {
        event: "content:update",
        data: { version: 1, tenantId: "tenant-a" },
      },
      "tenant-b",
    );

    expect(result).toBeNull();
  });

  it("allows broadcast events with tenantId all", () => {
    const result = normalizeSseEventPayload(
      {
        event: "content:update",
        data: { version: 1, tenantId: "all" },
      },
      "tenant-b",
    );

    expect(result?.type).toBe("content_update");
  });

  it("delivers tenant-scoped events only to matching subscribers", () => {
    const match = normalizeSseEventPayload(
      { event: "content:update", data: { version: 2, tenantId: "global" } },
      "global",
    );
    const mismatch = normalizeSseEventPayload(
      { event: "content:update", data: { version: 2, tenantId: "global" } },
      "tenant-other",
    );

    expect(match?.type).toBe("content_update");
    expect(mismatch).toBeNull();
  });

  it("does not treat null tenantId as cross-tenant wildcard", () => {
    const forTenantB = normalizeSseEventPayload(
      { event: "content:update", data: { version: 3, tenantId: null } },
      "tenant-b",
    );

    expect(forTenantB?.tenantId).toBeNull();
    expect(forTenantB?.type).toBe("content_update");
  });
});

describe("content SSE wire frame", () => {
  it("emits a frame the client can parse: timestamp stays numeric, frame is terminated", () => {
    const payload = normalizeSseEventPayload({ event: "content:update", data: { version: 7 } });
    const frame = `data: ${JSON.stringify(redactSecretsDeep(payload))}\n\n`;

    expect(frame.endsWith("\n\n")).toBe(true);
    const parsed = JSON.parse(frame.slice("data: ".length, -2));
    // Regression: the serialized payload used to be redacted as TEXT, so the 13-digit
    // epoch-ms became `"timestamp":[REDACTED]` and the client answered
    // `Unexpected token 'R', ... is not valid JSON`.
    expect(parsed.timestamp).toBeTypeOf("number");
    expect(parsed.version).toBe(7);
  });

  it("round-trips server frame -> client parser", () => {
    const payload = normalizeSseEventPayload({ event: "content:update", data: { version: 9 } });
    const frames = new SseFrameBuffer().push(
      `data: ${JSON.stringify(redactSecretsDeep(payload))}\n\n`,
    );

    expect(frames).toHaveLength(1);
    const parsed = parseSseData(frames[0].data);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value).toMatchObject({ version: 9, type: "content_update" });
  });
});

// ─── Debounced flush scheduling ──────────────────────────────────────────────

type SseEventPayload = { event?: string; data?: Record<string, unknown> };
type SseListener = (payload: SseEventPayload) => void;

interface SseChunk {
  done: boolean;
  value?: string;
}

interface SseHarness {
  emit: (payload: SseEventPayload) => void;
  abort: () => void;
  read: () => Promise<SseChunk>;
}

const TEST_TENANT = "tenant-sse" as DatabaseId;
/** Authenticated subscriber: `/api/events` already requires `collection:read`. */
const TEST_USER = {
  _id: "sse-admin",
  email: "sse@example.com",
  role: "admin",
  isAdmin: true,
  permissions: [],
} as unknown as NonNullable<App.Locals["user"]>;

/**
 * Connects the real stream handler and exposes its wildcard listener plus the
 * response body reader, so tests can drive events and observe batched chunks.
 */
async function connectSse(tenantId: DatabaseId = TEST_TENANT): Promise<SseHarness> {
  let listener: SseListener | undefined;

  vi.spyOn(eventBus, "on").mockImplementation((eventName, wildcardListener) => {
    if (eventName === "*") listener = wildcardListener as unknown as SseListener;
    return eventBus;
  });
  // Call through: the handler removes only its own listener on cleanup.
  vi.spyOn(eventBus, "off");

  const abortController = new AbortController();
  const event = {
    request: {
      method: "GET",
      headers: new Headers(),
      signal: abortController.signal,
    },
    locals: { user: TEST_USER, roles: [] },
    url: new URL("http://localhost/api/events"),
  } as unknown as RequestEvent;

  const response = await handleContentEventsStream(event, tenantId);
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();

  return {
    emit: (payload) => {
      const target = listener;
      if (!target) throw new Error("SSE wildcard listener was not registered");
      target(payload);
    },
    abort: () => abortController.abort(),
    read: async () => {
      const { done, value } = await reader.read();
      return done ? { done: true } : { done: false, value: decoder.decode(value) };
    },
  };
}

/** Consumes the two startup frames so later reads only observe event batches. */
async function readConnectedFrames(harness: SseHarness) {
  const first = await harness.read();
  const second = await harness.read();

  expect(first.done).toBe(false);
  expect(first.value).toContain("event: connected");
  expect(second.done).toBe(false);
  expect(second.value).toContain(": connected");
}

/**
 * Drains the authorization chain for events emitted in the current tick. Real
 * timers are faked in these tests, so `advanceTimersByTimeAsync(0)` is the
 * deterministic way to flush chained microtasks without firing the 32ms flush.
 */
async function flushAuthorization(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

describe("content SSE debounced flush", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("owns only the 30s keep-alive timer while idle", async () => {
    vi.useFakeTimers();
    const harness = await connectSse();

    // A continuous 32ms flush interval would make this 2 (or more) per connection.
    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(30_000);
    // The keep-alive re-arms; no flush timer appears without an event.
    expect(vi.getTimerCount()).toBe(1);

    harness.abort();
  });

  it("schedules exactly one flush for a single event after the 32ms window", async () => {
    vi.useFakeTimers();
    const harness = await connectSse();
    await readConnectedFrames(harness);

    harness.emit({ event: "content:update", data: { version: 42, collection: "*" } });
    // The first event for a subject is authorized asynchronously (microtasks).
    await flushAuthorization();
    expect(vi.getTimerCount()).toBe(2); // keep-alive + one flush timer

    let resolved = false;
    const pendingRead = harness.read().then((chunk) => {
      resolved = true;
      return chunk;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);

    vi.advanceTimersByTime(31);
    await Promise.resolve();
    expect(resolved).toBe(false); // nothing enqueued before the 32ms window elapses
    expect(vi.getTimerCount()).toBe(2);

    vi.advanceTimersByTime(1);
    const chunk = await pendingRead;

    expect(resolved).toBe(true);
    expect(chunk.done).toBe(false);
    expect(chunk.value).toContain('"version":42');
    expect(vi.getTimerCount()).toBe(1); // flush timer cleared after firing

    harness.abort();
  });

  it("coalesces events inside one window into a single ordered batch", async () => {
    vi.useFakeTimers();
    const harness = await connectSse();
    await readConnectedFrames(harness);

    harness.emit({ event: "content:update", data: { version: 1, collection: "*" } });
    harness.emit({ event: "content:update", data: { version: 2, collection: "*" } });
    await flushAuthorization();
    expect(vi.getTimerCount()).toBe(2); // second event reuses the pending timer

    vi.advanceTimersByTime(32);
    const chunk = await harness.read();

    expect(chunk.done).toBe(false);
    const frames = (chunk.value ?? "").split("\n\n").filter((frame) => frame.length > 0);
    expect(frames).toHaveLength(2);
    const versions = frames.map((frame) => {
      expect(frame.startsWith("data: ")).toBe(true);
      return (JSON.parse(frame.slice("data: ".length)) as { version: number }).version;
    });
    expect(versions).toEqual([1, 2]);

    harness.abort();
  });

  it("cancels a pending flush when the client aborts before the window elapses", async () => {
    vi.useFakeTimers();
    const harness = await connectSse();
    await readConnectedFrames(harness);

    harness.emit({ event: "content:update", data: { version: 9, collection: "*" } });
    await flushAuthorization();
    expect(vi.getTimerCount()).toBe(2);

    harness.abort();

    expect(vi.getTimerCount()).toBe(0); // keep-alive and pending flush both cancelled
    expect(eventBus.off).toHaveBeenCalledWith("*", expect.any(Function));

    vi.advanceTimersByTime(32);
    expect(await harness.read()).toEqual({ done: true });
  });

  it("drops events the subscriber is not authorized to see", async () => {
    vi.useFakeTimers();
    const harness = await connectSse();
    await readConnectedFrames(harness);

    // Unknown doc channel, a Yjs channel with a broadcast tenant, and an event
    // shape with no collection subject: all fail closed and never buffer.
    harness.emit({
      event: "yjs:sync",
      data: {
        docId: "not-an-entry-doc",
        updateBase64: "AAAA",
        origin: "server",
        tenantId: TEST_TENANT,
      },
    });
    harness.emit({
      event: "yjs:awareness",
      data: {
        docId: "entry:posts:entry-1",
        updateBase64: "AAAA",
        origin: "server",
        tenantId: "all",
      },
    });
    harness.emit({
      event: "chat:message",
      data: { text: "secret", tenantId: TEST_TENANT },
    });
    await flushAuthorization();

    // Only the keep-alive timer exists — no flush was scheduled for a dropped event.
    expect(vi.getTimerCount()).toBe(1);

    harness.abort();
  });
});
