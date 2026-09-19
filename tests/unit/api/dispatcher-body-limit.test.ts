/**
 * @file tests/unit/api/dispatcher-body-limit.test.ts
 * @description Regression tests for the catch-all dispatcher's request-body ceiling.
 *
 * The guard compared `Content-Length` only, so a `Transfer-Encoding: chunked` write
 * carried no header to check and every `request.json()` / `request.formData()`
 * downstream buffered an unbounded body into heap. These tests pin the chunked path
 * against the shared {@link API_MAX_BODY_SIZE_BYTES} ceiling: an over-cap body is
 * rejected with 413 `PAYLOAD_TOO_LARGE` before the endpoint handler runs and without
 * draining the client to completion, an under-cap body reaches the handler unchanged,
 * and the declared-length fast path is not re-read or cloned. The streaming media
 * route keeps its incremental read path (no whole-body buffering).
 *
 * ### Features:
 * - chunked body over the cap ⇒ 413 PAYLOAD_TOO_LARGE, handler not invoked, source cancelled
 * - chunked body under the cap ⇒ endpoint receives the parsed payload unchanged
 * - declared `Content-Length` ⇒ same Request instance reaches the endpoint (no clone)
 * - `media/stream` streams through the counter incrementally, same ceiling on overflow
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { json, type RequestEvent } from "@sveltejs/kit";
import { API_MAX_BODY_SIZE_BYTES } from "@utils/api-body-limits";
import { _handler } from "@src/routes/api/[...path]/+server";
import { callApiDispatcher, createMockRequestEvent } from "../utils/mock-event";

vi.mock("@src/databases/db", () => ({
  dbAdapter: {
    crud: {
      findMany: vi.fn().mockResolvedValue({ success: true, data: [] }),
      findOne: vi.fn().mockResolvedValue({ success: true, data: null }),
      insert: vi.fn().mockResolvedValue({ success: true, data: {} }),
      update: vi.fn().mockResolvedValue({ success: true, data: {} }),
      delete: vi.fn().mockResolvedValue({ success: true }),
    },
    auth: {
      getUserById: vi.fn().mockResolvedValue({ success: true, data: null }),
      validateSession: vi.fn().mockResolvedValue({ success: true, user: null }),
      getAllUsers: vi.fn().mockResolvedValue({ success: true, data: [] }),
    },
    system: {
      preferences: { getMany: vi.fn().mockResolvedValue({ success: true, data: {} }) },
      widgets: { getActiveWidgets: vi.fn().mockResolvedValue({ success: true, data: [] }) },
    },
    collection: { getModel: vi.fn().mockResolvedValue({}) },
  },
  getDbInitPromise: vi.fn().mockResolvedValue(undefined),
  getDb: vi.fn(),
  isDbConnected: vi.fn().mockReturnValue(true),
  getAuth: vi.fn().mockReturnValue({}),
  getPrivateEnv: vi.fn().mockReturnValue({ CONCURRENT_UPLOAD_SIZE: 2 }),
  loadPrivateConfig: vi.fn().mockReturnValue({}),
  getBootPhase: vi.fn().mockReturnValue("READY"),
}));

vi.mock("@src/content/index.server", () => ({
  contentSystem: {
    getCollections: vi.fn().mockResolvedValue([]),
    getCollection: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("@utils/tenant", () => ({
  getTenantIdFromHostname: vi.fn().mockReturnValue(null),
}));

vi.mock("@utils/tenant-isolation.server", () => ({
  isMultiTenantEnabled: vi.fn().mockReturnValue(true),
  resetMultiTenantCache: vi.fn(),
}));

vi.mock("@src/services/core/settings-service", () => ({
  getPrivateSettingSync: vi.fn().mockReturnValue(true),
  getPublicSettingSync: vi.fn().mockReturnValue(false),
  getUntypedSetting: vi.fn().mockResolvedValue(undefined),
  loadSettingsCache: vi.fn(),
  invalidateSettingsCache: vi.fn(),
}));

// Endpoint stubs: the dispatcher must reject an over-cap body before these run.
const mocks = vi.hoisted(() => ({
  settings: vi.fn(),
  media: vi.fn(),
}));

vi.mock("@src/routes/api/[...path]/handlers/system", () => ({
  handleSettingsRoutes: mocks.settings,
}));

vi.mock("@src/routes/api/[...path]/handlers/media", () => ({
  handleMediaRoutes: mocks.media,
}));

const encoder = new TextEncoder();

interface CountedSource {
  readonly stream: ReadableStream<Uint8Array>;
  /** Bytes the consumer actually pulled — proves an early abort. */
  readonly bytesPulled: number;
  readonly cancelled: boolean;
}

/**
 * Emits `plannedBytes` in `chunkSize` slices, reusing one filler buffer so the
 * over-cap cases never allocate the whole planned size.
 */
function createFillerSource(plannedBytes: number, chunkSize: number): CountedSource {
  const filler = new Uint8Array(chunkSize);
  let remaining = plannedBytes;
  let bytesPulled = 0;
  let cancelled = false;

  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (remaining <= 0) {
        controller.close();
        return;
      }
      const size = Math.min(chunkSize, remaining);
      remaining -= size;
      bytesPulled += size;
      controller.enqueue(filler.subarray(0, size));
    },
    cancel() {
      cancelled = true;
    },
  });

  return {
    stream,
    get bytesPulled() {
      return bytesPulled;
    },
    get cancelled() {
      return cancelled;
    },
  };
}

/** Emits `bytes` split into `chunkSize` slices — a real chunked payload. */
function createPayloadSource(
  bytes: Uint8Array,
  chunkSize: number,
): { stream: ReadableStream<Uint8Array>; cancelled: boolean } {
  let offset = 0;
  let cancelled = false;

  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.byteLength) {
        controller.close();
        return;
      }
      const end = Math.min(offset + chunkSize, bytes.byteLength);
      controller.enqueue(bytes.subarray(offset, end));
      offset = end;
    },
    cancel() {
      cancelled = true;
    },
  });

  return {
    stream,
    get cancelled() {
      return cancelled;
    },
  };
}

/** Builds an admin/bypass event whose `request` is a real `Request` (no Content-Length unless set). */
function createWriteEvent(options: {
  path: string;
  body: BodyInit;
  headers?: Record<string, string>;
}): RequestEvent {
  // `duplex: "half"` is required by undici for streaming request bodies but is
  // absent from the DOM `RequestInit` type.
  const init = {
    method: "POST",
    headers: { "content-type": "application/json", ...options.headers },
    body: options.body,
    ...(options.body instanceof ReadableStream ? { duplex: "half" } : {}),
  } as RequestInit;

  const event = createMockRequestEvent({
    method: "POST",
    path: options.path,
    bypass: true,
  });
  // `RequestEvent.request` is readonly, so replace it via a shallow copy instead
  // of assigning into the mock event.
  return { ...event, request: new Request(`http://localhost/api/${options.path}`, init) };
}

describe("Dispatcher body limit — chunked (no Content-Length)", () => {
  let parsedPayloads: unknown[];
  let seenEvents: RequestEvent[];

  beforeEach(() => {
    vi.clearAllMocks();
    parsedPayloads = [];
    seenEvents = [];

    mocks.settings.mockImplementation(async (event: RequestEvent) => {
      seenEvents.push(event);
      const payload = await event.request.json();
      parsedPayloads.push(payload);
      return json({ success: true, data: payload });
    });
    mocks.media.mockImplementation(async (event: RequestEvent) => {
      seenEvents.push(event);
      const reader = event.request.body?.getReader();
      let total = 0;
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) total += value.byteLength;
        }
      }
      return json({ success: true, data: { total } });
    });
  });

  it("rejects a chunked body over the cap with 413 and never invokes the handler", async () => {
    const chunkSize = 64 * 1024;
    const planned = API_MAX_BODY_SIZE_BYTES + 4 * chunkSize;
    const source = createFillerSource(planned, chunkSize);
    const event = createWriteEvent({ path: "settings", body: source.stream });

    const response = await callApiDispatcher("POST", event);
    const body = (await response.json()) as { success: boolean; code: string };

    expect(response.status).toBe(413);
    expect(body.success).toBe(false);
    expect(body.code).toBe("PAYLOAD_TOO_LARGE");
    expect(mocks.settings).not.toHaveBeenCalled();
    expect(mocks.media).not.toHaveBeenCalled();

    // Incremental abort: the client is never drained to completion.
    expect(source.cancelled).toBe(true);
    expect(source.bytesPulled).toBeLessThan(planned);
    expect(source.bytesPulled).toBeLessThanOrEqual(API_MAX_BODY_SIZE_BYTES + 2 * chunkSize);
  });

  it("accepts a chunked body under the cap and hands the parsed payload to the handler", async () => {
    const payload = { key: "site-name", value: "SveltyCMS" };
    const source = createPayloadSource(encoder.encode(JSON.stringify(payload)), 7);
    const event = createWriteEvent({ path: "settings", body: source.stream });

    const response = await callApiDispatcher("POST", event);
    const body = (await response.json()) as { success: boolean; data: unknown };

    expect(response.status).toBe(200);
    expect(mocks.settings).toHaveBeenCalledTimes(1);
    expect(parsedPayloads).toEqual([payload]);
    expect(body).toMatchObject({ success: true, data: payload });
    expect(source.cancelled).toBe(false);
  });

  it("still rejects an over-cap chunked body on the raw dispatcher with the canonical 413", async () => {
    const chunkSize = 64 * 1024;
    const source = createFillerSource(API_MAX_BODY_SIZE_BYTES + 2 * chunkSize, chunkSize);
    const event = createWriteEvent({ path: "settings", body: source.stream });

    // `_handler` is the apiHandler-wrapped entry's inner function: it raises, and
    // `handleApiError` turns that into the JSON envelope asserted above.
    await expect(_handler(event)).rejects.toMatchObject({
      status: 413,
      code: "PAYLOAD_TOO_LARGE",
    });
    expect(mocks.settings).not.toHaveBeenCalled();
  });
});

describe("Dispatcher body limit — declared Content-Length", () => {
  let parsedPayloads: unknown[];
  let seenEvents: RequestEvent[];

  beforeEach(() => {
    vi.clearAllMocks();
    parsedPayloads = [];
    seenEvents = [];

    mocks.settings.mockImplementation(async (event: RequestEvent) => {
      seenEvents.push(event);
      const payload = await event.request.json();
      parsedPayloads.push(payload);
      return json({ success: true, data: payload });
    });
  });

  it("does not re-read or clone a within-cap body (same Request reaches the handler)", async () => {
    const payload = { key: "driver-mode", value: "on" };
    const raw = JSON.stringify(payload);
    const event = createWriteEvent({
      path: "settings",
      body: raw,
      headers: { "content-length": String(Buffer.byteLength(raw, "utf8")) },
    });

    const response = await callApiDispatcher("POST", event);

    expect(response.status).toBe(200);
    expect(mocks.settings).toHaveBeenCalledTimes(1);
    expect(parsedPayloads).toEqual([payload]);
    expect(seenEvents[0]!.request).toBe(event.request);
  });

  it("rejects an over-cap Content-Length with 413 before the handler runs", async () => {
    const event = createWriteEvent({
      path: "settings",
      body: "{}",
      headers: { "content-length": String(API_MAX_BODY_SIZE_BYTES + 1) },
    });

    const response = await callApiDispatcher("POST", event);
    const body = (await response.json()) as { code: string };

    expect(response.status).toBe(413);
    expect(body.code).toBe("PAYLOAD_TOO_LARGE");
    expect(mocks.settings).not.toHaveBeenCalled();
  });
});

describe("Dispatcher body limit — streaming route", () => {
  let seenEvents: RequestEvent[];

  beforeEach(() => {
    vi.clearAllMocks();
    seenEvents = [];
  });

  it("hands media/stream the live stream instead of buffering the body", async () => {
    const chunkSize = 64 * 1024;
    const planned = 8 * chunkSize;
    const source = createFillerSource(planned, chunkSize);
    const pulledAtHandlerStart: number[] = [];
    const pulledAfterFirstRead: number[] = [];

    mocks.media.mockImplementation(async (event: RequestEvent) => {
      seenEvents.push(event);
      const reader = event.request.body!.getReader();
      pulledAtHandlerStart.push(source.bytesPulled);
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (pulledAfterFirstRead.length === 0) pulledAfterFirstRead.push(source.bytesPulled);
        if (value) total += value.byteLength;
      }
      return json({ success: true, data: { total } });
    });

    const event = createWriteEvent({ path: "media/stream", body: source.stream });
    const response = await callApiDispatcher("POST", event);
    const body = (await response.json()) as { data: { total: number } };

    expect(response.status).toBe(200);
    expect(body.data.total).toBe(planned);
    // Streaming preserved: the dispatcher had not consumed the body before dispatching
    // and the handler's first read only pulled the leading chunks — an eager
    // read-into-memory wrapper would show `planned` in both counters.
    expect(pulledAtHandlerStart[0]!).toBeLessThan(planned);
    expect(pulledAfterFirstRead[0]!).toBeLessThan(planned);
    expect(source.cancelled).toBe(false);
  });

  it("bounds media/stream with the same ceiling without buffering it", async () => {
    const chunkSize = 64 * 1024;
    const planned = API_MAX_BODY_SIZE_BYTES + 4 * chunkSize;
    const source = createFillerSource(planned, chunkSize);

    mocks.media.mockImplementation(async (event: RequestEvent) => {
      seenEvents.push(event);
      const reader = event.request.body!.getReader();
      for (;;) {
        const { done } = await reader.read();
        if (done) break;
      }
      return json({ success: true });
    });

    const event = createWriteEvent({ path: "media/stream", body: source.stream });
    const response = await callApiDispatcher("POST", event);
    const body = (await response.json()) as { code: string };

    expect(response.status).toBe(413);
    expect(body.code).toBe("PAYLOAD_TOO_LARGE");
    expect(source.cancelled).toBe(true);
    expect(source.bytesPulled).toBeLessThan(planned);
    expect(source.bytesPulled).toBeLessThanOrEqual(API_MAX_BODY_SIZE_BYTES + 2 * chunkSize);
  });
});
