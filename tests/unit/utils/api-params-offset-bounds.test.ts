/**
 * @file tests/unit/utils/api-params-offset-bounds.test.ts
 * @description Proves the collection query parser emits integer LIMIT/OFFSET
 * values for any client input.
 *
 * `parseCollectionQueryParams` used `Number()` for `offset` (and `Math.min` for
 * `limit`) with only an `isNaN` guard, so `offset=Infinity` and `offset=1.5` /
 * `limit=2.7` reached the adapter's `OFFSET ?` / `LIMIT ?` bind unchanged. Its
 * sibling `parsePaginationQueryParams` uses `parseInt`, so the two parsers
 * disagreed on the same query string.
 */

import { describe, expect, it } from "vitest";
import {
  clampPageSize,
  parseCollectionQueryParams,
  parseVirtualCollectionQueryParams,
} from "@utils/api-params";

describe("parseCollectionQueryParams numeric bounds", () => {
  it("falls back to 0 for a non-finite offset", () => {
    expect(parseCollectionQueryParams(new URLSearchParams("offset=Infinity")).offset).toBe(0);
    expect(parseCollectionQueryParams(new URLSearchParams("offset=-Infinity")).offset).toBe(0);
  });

  it("floors a fractional offset to an integer", () => {
    expect(parseCollectionQueryParams(new URLSearchParams("offset=1.5")).offset).toBe(1);
    expect(parseCollectionQueryParams(new URLSearchParams("offset=7.999")).offset).toBe(7);
  });

  it("falls back to 0 for an offset beyond the safe-integer range", () => {
    expect(parseCollectionQueryParams(new URLSearchParams("offset=9007199254740993")).offset).toBe(
      0,
    );
  });

  it("floors a fractional limit", () => {
    expect(parseCollectionQueryParams(new URLSearchParams("limit=2.7")).limit).toBe(2);
  });

  it("keeps clampPageSize integral for every caller", () => {
    expect(clampPageSize(2.7)).toBe(2);
    expect(clampPageSize(0.5)).toBe(1);
    expect(clampPageSize(Number.POSITIVE_INFINITY)).toBe(50);
  });

  it("applies the same bounds to the virtual-collection parser", () => {
    const params = parseVirtualCollectionQueryParams(
      new URLSearchParams("limit=2.7&offset=Infinity"),
    );
    expect(params.limit).toBe(2);
    // Optional offset: an unusable value is ignored, never forwarded as Infinity.
    expect(params.offset).toBeUndefined();
    expect(parseVirtualCollectionQueryParams(new URLSearchParams("offset=4.9")).offset).toBe(4);
  });
});
