/**
 * @file tests/unit/plugins/unified-data-hub/federated-cursor.test.ts
 * @description Per-source cursor pagination tests (v3 stable).
 */

import { describe, expect, it } from "vitest";
import { FederationError } from "@plugins/unified-data-hub/types";
import {
  buildNextCursor,
  decodeSourceCursor,
  encodeSourceCursor,
  resolveCursorOffset,
} from "@plugins/unified-data-hub/server/federated-cursor";

describe("federated cursor v3 stable", () => {
  it("round-trips cursor for slug and connector", () => {
    const cursor = encodeSourceCursor({
      slug: "bench-articles",
      connectorId: "c1",
      offset: 25,
    });
    expect(decodeSourceCursor(cursor, "bench-articles", "c1")).toBe(25);
  });

  it("rejects cursor slug mismatch", () => {
    const cursor = encodeSourceCursor({
      slug: "bench-articles",
      connectorId: "c1",
      offset: 10,
    });
    expect(() => decodeSourceCursor(cursor, "other", "c1")).toThrow(FederationError);
  });

  it("cursor takes precedence over offset", () => {
    const cursor = encodeSourceCursor({
      slug: "bench-articles",
      connectorId: "c1",
      offset: 50,
    });
    expect(resolveCursorOffset({ cursor, offset: 0 }, "bench-articles", "c1")).toBe(50);
  });

  it("emits nextCursor when more rows remain", () => {
    const next = buildNextCursor({
      slug: "bench-articles",
      connectorId: "c1",
      currentOffset: 0,
      rowCount: 25,
      total: 100,
      limit: 25,
    });
    expect(next).toBeTruthy();
    expect(decodeSourceCursor(next!, "bench-articles", "c1")).toBe(25);
  });

  it("omits nextCursor on final page", () => {
    expect(
      buildNextCursor({
        slug: "bench-articles",
        connectorId: "c1",
        currentOffset: 75,
        rowCount: 25,
        total: 100,
        limit: 25,
      }),
    ).toBeUndefined();
  });
});
