/**
 * @file tests/unit/databases/adapter-wrap-hot-path.test.ts
 * @description wrap() settle contract: no extra async hop on skipMeta writes.
 *
 * ### Features:
 * - wrap is not an AsyncFunction
 * - skipMeta+isWrite returns a pooled success envelope
 * - sync throws still map to DatabaseResult errors
 */

import { describe, expect, it } from "vitest";
import { BaseAdapter } from "@src/databases/core/base-adapter";
import type { IBatchAdapter, ICrudAdapter } from "@src/databases/db-interface";

class WrapProbe extends BaseAdapter {
  constructor() {
    super();
    this.connected = true;
  }
  get batch(): IBatchAdapter {
    return {} as IBatchAdapter;
  }
  get crud(): ICrudAdapter {
    return {} as ICrudAdapter;
  }
  setConnected(value: boolean): void {
    this.connected = value;
  }
}

describe("BaseAdapter.wrap hot path", () => {
  it("is not an async function (no extra microtask wrapper)", () => {
    const adapter = new WrapProbe();
    expect(adapter.wrap.constructor.name).not.toBe("AsyncFunction");
  });

  it("skipMeta writes return the pooled success envelope", async () => {
    const adapter = new WrapProbe();
    const result = await adapter.wrap(async () => ({ _id: "doc-1" }), "INSERT_FAILED", undefined, {
      isWrite: true,
      skipMeta: true,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ _id: "doc-1" });
    expect(result.meta).toBeUndefined();
  });

  it("maps a rejected write onto INSERT_FAILED without throwing", async () => {
    const adapter = new WrapProbe();
    const result = await adapter.wrap(
      async () => {
        throw new Error("unique violation");
      },
      "INSERT_FAILED",
      undefined,
      { isWrite: true, skipMeta: true },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error?.code).toBe("INSERT_FAILED");
  });

  it("maps a synchronous throw onto the error envelope", async () => {
    const adapter = new WrapProbe();
    const result = await adapter.wrap(
      () => {
        throw new Error("sync");
      },
      "INSERT_FAILED",
      undefined,
      { isWrite: true, skipMeta: true },
    );
    expect(result.success).toBe(false);
  });

  it("returns NOT_CONNECTED without invoking fn", async () => {
    const adapter = new WrapProbe();
    adapter.setConnected(false);
    let called = false;
    const result = await adapter.wrap(
      async () => {
        called = true;
        return { ok: true };
      },
      "INSERT_FAILED",
      undefined,
      { isWrite: true, skipMeta: true },
    );
    expect(called).toBe(false);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error?.code).toBe("NOT_CONNECTED");
  });
});
