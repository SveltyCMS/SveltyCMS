/**
 * @vitest-environment node
 * @file tests/unit/hooks/fast-lane-write-policy.test.ts
 * @description Security invariants for the opt-in write fast lane.
 *
 * The write lane carries mutation bodies, so it must (a) stay OFF unless
 * `SVELTY_FAST_LANE_WRITE=1`, (b) never consume a request body it cannot answer,
 * and (c) reproduce adapter-node's client-address failure mode so rate-limit
 * bucketing cannot diverge from the pipeline.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tryCollectionWriteLane: vi.fn(),
}));

vi.mock("@src/hooks/handle-collection-write-lane", () => ({
  tryCollectionWriteLane: mocks.tryCollectionWriteLane,
}));
vi.mock("@src/hooks/handle-collection-read-lane", () => ({
  isSimpleCollectionRead: () => false,
  tryCollectionReadLane: vi.fn(async () => null),
}));
vi.mock("@src/hooks/lane-state-gate", () => ({
  isLaneServingAllowed: () => true,
}));

type Dispatch = (input: Record<string, unknown>) => Promise<unknown>;

/** Fresh module registry per test so the `SVELTY_FAST_LANE_WRITE` boot read is re-evaluated. */
async function loadDispatcher(): Promise<Dispatch> {
  vi.resetModules();
  const mod = await import("@src/hooks/fast-lane.server");
  mod.installFastLanes();
  const dispatch = (globalThis as Record<string, unknown>)[mod.FAST_LANE_REGISTRY] as
    | Dispatch
    | undefined;
  if (!dispatch) throw new Error("fast-lane dispatcher not published");
  return dispatch;
}

function writeInput(overrides: Record<string, unknown> = {}) {
  const readBody = vi.fn(async () => new TextEncoder().encode(JSON.stringify({ title: "x" })));
  const input: Record<string, unknown> = {
    method: "PATCH",
    url: "/api/collections/posts/entry-1",
    origin: "http://127.0.0.1:4173",
    headers: { cookie: "__Host-auth_sessions=s1" },
    readBody,
  };
  return { input: { ...input, ...overrides }, readBody };
}

describe("fast-lane write policy", () => {
  beforeEach(() => {
    mocks.tryCollectionWriteLane.mockReset();
    process.env.SVELTY_FAST_LANE = "1";
  });

  afterEach(() => {
    delete process.env.SVELTY_FAST_LANE;
    delete process.env.SVELTY_FAST_LANE_WRITE;
    delete (globalThis as Record<string, unknown>).__SVELTY_FAST_LANES__;
  });

  it("leaves the write lane unregistered unless SVELTY_FAST_LANE_WRITE=1", async () => {
    delete process.env.SVELTY_FAST_LANE_WRITE;
    const dispatch = await loadDispatcher();
    const { input, readBody } = writeInput();

    await expect(dispatch(input)).resolves.toBeNull();
    expect(mocks.tryCollectionWriteLane).not.toHaveBeenCalled();
    expect(readBody).not.toHaveBeenCalled();
  });

  it("declines without consuming the body when the write lane falls through", async () => {
    process.env.SVELTY_FAST_LANE_WRITE = "1";
    // Simulate the pipeline decline: the lane calls its `resolve` fall-through.
    mocks.tryCollectionWriteLane.mockImplementation(
      async ({ resolve }: { resolve: (e: unknown) => Promise<unknown> }) => resolve({}),
    );
    const dispatch = await loadDispatcher();
    const { input, readBody } = writeInput();

    await expect(dispatch(input)).resolves.toBeNull();
    expect(mocks.tryCollectionWriteLane).toHaveBeenCalledTimes(1);
    // The invariant that makes the lane safe: a declined request is untouched.
    expect(readBody).not.toHaveBeenCalled();
  });

  it("serves a committed write and reads the body exactly once", async () => {
    process.env.SVELTY_FAST_LANE_WRITE = "1";
    mocks.tryCollectionWriteLane.mockImplementation(
      async ({ event }: { event: { request: Request } }) => {
        const body = (await event.request.json()) as { title: string };
        return new Response(JSON.stringify({ success: true, data: { title: body.title } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    );
    const dispatch = await loadDispatcher();
    const { input, readBody } = writeInput();

    const out = (await dispatch(input)) as {
      status: number;
      headers: Record<string, string>;
      body: string | Uint8Array;
    };
    expect(out.status).toBe(200);
    expect(readBody).toHaveBeenCalledTimes(1);
    expect(out.headers["content-length"]).toBeDefined();
    expect(new TextDecoder().decode(out.body as Uint8Array)).toContain('"title":"x"');
  });

  it("fails closed on the client address exactly like adapter-node", async () => {
    process.env.SVELTY_FAST_LANE_WRITE = "1";
    let captured: { getClientAddress: () => string } | null = null;
    mocks.tryCollectionWriteLane.mockImplementation(
      async ({ event }: { event: { getClientAddress: () => string } }) => {
        captured = event;
        return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
      },
    );
    const dispatch = await loadDispatcher();

    // No address resolved by the entry → adapter-node would throw → getClientIp
    // falls back to 0.0.0.0. The lane must throw, not invent an address.
    await dispatch(writeInput({ clientAddress: undefined }).input);
    expect(captured).not.toBeNull();
    expect(() =>
      (captured as unknown as { getClientAddress: () => string }).getClientAddress(),
    ).toThrow();

    await dispatch(writeInput({ clientAddress: "203.0.113.7" }).input);
    expect((captured as unknown as { getClientAddress: () => string }).getClientAddress()).toBe(
      "203.0.113.7",
    );
  });
});
