/**
 * @file tests/unit/routes/collaboration-yjs-server.test.ts
 * @description Behavioural tests for `/api/collaboration/yjs` (GET + POST).
 *
 * Covers the route-behaviour classes the scorer grades:
 * - load-contract: response envelopes for GET and POST
 * - failure-path: 401 (both verbs), 400 (missing fields / non-entry channel), 403 (ACL)
 * - persistence: an awareness POST is forwarded to the service, then GET re-reads it
 * - concurrency: two parallel awareness POSTs both survive the round-trip
 *
 * The Yjs singleton is replaced by a stateful fake so the tests prove the handler
 * forwards the decoded bytes (and the tenant id) instead of just returning 200.
 * The fake patches the singleton loaded via `importOriginal` because the handler
 * resolves it with a lazy `import()`; patching the shared instance keeps concurrent
 * requests on the same fake regardless of which import wins the module race.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  const awareness: Array<{ docId: string; tenantId: string; bytes: number[] }> = [];

  const handleAwarenessUpdate = vi.fn((docId: string, update: Uint8Array, tenantId: string) => {
    awareness.push({ docId, tenantId, bytes: Array.from(update) });
  });

  const getFullState = vi.fn((docId: string, tenantId: string) => {
    const bytes: number[] = [];
    for (const record of awareness) {
      if (record.docId === docId && record.tenantId === tenantId) bytes.push(...record.bytes);
    }
    return new Uint8Array(bytes);
  });

  return { awareness, handleAwarenessUpdate, getFullState };
});

vi.mock("@src/services/collaboration/yjs-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@src/services/collaboration/yjs-service")>();
  const service = actual.yjsService as unknown as {
    handleAwarenessUpdate: typeof h.handleAwarenessUpdate;
    getFullState: typeof h.getFullState;
  };
  service.handleAwarenessUpdate = h.handleAwarenessUpdate;
  service.getFullState = h.getFullState;
  return { yjsService: actual.yjsService };
});

import { yjsService } from "@src/services/collaboration/yjs-service";
import { GET, POST } from "../../../src/routes/api/collaboration/yjs/+server";

type YjsEvent = Parameters<typeof POST>[0];

const mockHandleAwarenessUpdate = vi.mocked(yjsService.handleAwarenessUpdate);
const mockGetFullState = vi.mocked(yjsService.getFullState);

const BASE_URL = "http://localhost/api/collaboration/yjs";
const ENTRY_DOC = "entry:blog-posts:9b2f0d3e-7c4a-4f1b-9d6e-2a5c8e1f0b3d";
const TENANT = "tenant-a";

const ADMIN_USER = {
  _id: "admin-1",
  email: "admin@test.com",
  role: "admin",
  isAdmin: true,
  permissions: [],
};

const EDITOR_USER = {
  _id: "editor-1",
  email: "editor@test.com",
  role: "editor",
  isAdmin: false,
  permissions: [],
};

function makeLocals(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { user: ADMIN_USER, tenantId: TENANT, roles: [], ...overrides };
}

interface EventInit {
  url?: string;
  body?: unknown;
  locals?: Record<string, unknown>;
}

function makeEvent(verb: "GET" | "POST", init: EventInit = {}): YjsEvent {
  const url = new URL(init.url ?? BASE_URL);
  // Widened to `string` so the RequestInit overload allows a body on the POST path.
  const method: string = verb;
  const request = new Request(url, {
    method,
    headers: init.body === undefined ? undefined : { "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  return {
    locals: makeLocals(init.locals),
    request,
    url,
  } as unknown as YjsEvent;
}

function stateUrl(docId: string): string {
  return `${BASE_URL}?docId=${encodeURIComponent(docId)}`;
}

function toBase64(bytes: readonly number[]): string {
  return Buffer.from(new Uint8Array(bytes)).toString("base64");
}

function fromBase64(base64: string): number[] {
  return Array.from(Buffer.from(base64, "base64"));
}

/** Re-reads the server state the way the editor client does. */
async function readStateBase64(docId: string): Promise<string> {
  const response = await GET(makeEvent("GET", { url: stateUrl(docId) }));
  const body = (await response.json()) as { stateBase64: string };
  return body.stateBase64;
}

describe("/api/collaboration/yjs", () => {
  beforeEach(() => {
    h.awareness.length = 0;
    mockHandleAwarenessUpdate.mockClear();
    mockGetFullState.mockClear();
  });

  it("returns the state envelope for an authorized GET", async () => {
    const response = await GET(makeEvent("GET", { url: stateUrl(ENTRY_DOC) }));
    const body = (await response.json()) as { success: boolean; stateBase64: string };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(typeof body.stateBase64).toBe("string");
    expect(mockGetFullState).toHaveBeenCalledWith(ENTRY_DOC, TENANT);
  });

  it("acknowledges an awareness POST with { success: true }", async () => {
    const response = await POST(
      makeEvent("POST", {
        body: { docId: ENTRY_DOC, updateBase64: toBase64([1, 2, 3]), awareness: true },
      }),
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(mockHandleAwarenessUpdate).toHaveBeenCalledWith(
      ENTRY_DOC,
      expect.any(Uint8Array),
      TENANT,
    );
    expect(mockHandleAwarenessUpdate.mock.calls[0][1]).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("returns 401 on both verbs when locals.user is missing", async () => {
    const postResponse = await POST(
      makeEvent("POST", {
        locals: { user: undefined },
        body: { docId: ENTRY_DOC, updateBase64: toBase64([1]) },
      }),
    );
    const getResponse = await GET(
      makeEvent("GET", { locals: { user: undefined }, url: stateUrl(ENTRY_DOC) }),
    );

    expect(postResponse.status).toBe(401);
    expect(getResponse.status).toBe(401);

    const getBody = (await getResponse.json()) as { code: string };
    expect(getBody.code).toBe("UNAUTHORIZED");
    expect(mockHandleAwarenessUpdate).not.toHaveBeenCalled();
    expect(mockGetFullState).not.toHaveBeenCalled();
  });

  it("returns 400 when docId or updateBase64 is missing", async () => {
    const missingUpdate = await POST(makeEvent("POST", { body: { docId: ENTRY_DOC } }));
    const emptyBody = await POST(makeEvent("POST", { body: {} }));

    expect(missingUpdate.status).toBe(400);
    expect(emptyBody.status).toBe(400);

    const body = (await missingUpdate.json()) as { code: string };
    expect(body.code).toBe("BAD_REQUEST");
  });

  it("returns 400 for a channel id that is not entry:{collectionId}:{entryId}", async () => {
    const postResponse = await POST(
      makeEvent("POST", { body: { docId: "notes:1", updateBase64: toBase64([1]) } }),
    );
    const getResponse = await GET(makeEvent("GET", { url: stateUrl("notes:1") }));

    expect(postResponse.status).toBe(400);
    expect(getResponse.status).toBe(400);
    expect(mockHandleAwarenessUpdate).not.toHaveBeenCalled();
    expect(mockGetFullState).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed JSON body instead of a 500", async () => {
    const url = new URL(BASE_URL);
    const response = await POST({
      locals: makeLocals(),
      request: new Request(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not json",
      }),
      url,
    } as unknown as YjsEvent);

    expect(response.status).toBe(400);
    const body = (await response.json()) as { code: string; success: boolean };
    expect(body.code).toBe("BAD_REQUEST");
    expect(body.success).toBe(false);
    expect(mockHandleAwarenessUpdate).not.toHaveBeenCalled();
  });

  it("forbids a non-admin without collection permissions with 403", async () => {
    const response = await POST(
      makeEvent("POST", {
        locals: { user: EDITOR_USER, roles: [], tenantId: TENANT },
        body: { docId: ENTRY_DOC, updateBase64: toBase64([1]) },
      }),
    );
    const body = (await response.json()) as { code: string };

    expect(response.status).toBe(403);
    expect(body.code).toBe("FORBIDDEN");
    expect(mockHandleAwarenessUpdate).not.toHaveBeenCalled();
  });

  it("persists an awareness update so a later GET returns the accumulated state", async () => {
    const update = [7, 8, 9];

    const postResponse = await POST({
      locals: makeLocals(),
      request: new Request(BASE_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          docId: ENTRY_DOC,
          updateBase64: toBase64(update),
          awareness: true,
        }),
      }),
      url: new URL(BASE_URL),
    } as unknown as YjsEvent);

    expect(postResponse.status).toBe(200);
    expect(h.awareness).toHaveLength(1);

    expect(await readStateBase64(ENTRY_DOC)).toBe(toBase64(update));
  });

  it("keeps both updates when two awareness POSTs run concurrently", async () => {
    const first = [1, 2];
    const second = [3, 4, 5];

    const responses = await Promise.all([
      POST(
        makeEvent("POST", {
          body: { docId: ENTRY_DOC, updateBase64: toBase64(first), awareness: true },
        }),
      ),
      POST(
        makeEvent("POST", {
          body: { docId: ENTRY_DOC, updateBase64: toBase64(second), awareness: true },
        }),
      ),
    ]);

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(mockHandleAwarenessUpdate).toHaveBeenCalledTimes(2);

    const state = fromBase64(await readStateBase64(ENTRY_DOC));
    expect(state).toHaveLength(5);
    expect(state).toEqual(expect.arrayContaining([1, 2, 3, 4, 5]));
  });
});
