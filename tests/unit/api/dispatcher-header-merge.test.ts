/**
 * @file tests/unit/api/dispatcher-header-merge.test.ts
 * @description Case-insensitive merge between a handler response and the dispatcher defaults.
 *
 * Features:
 * - a handler `cache-control` never duplicates the dispatcher `Cache-Control`
 * - novel handler headers are preserved
 * - the dispatcher value wins on a collision (HTTP names are case-insensitive)
 */

import { describe, expect, it } from "vitest";
import { mergeResponseHeaders } from "@src/routes/api/[...path]/response-headers";

describe("dispatcher response header merge", () => {
  it("keeps the dispatcher default when a handler header collides case-insensitively", () => {
    const merged = mergeResponseHeaders(
      { "Cache-Control": "private, must-revalidate", "X-API-Version": "1", ETag: '"abc"' },
      new Headers({ "cache-control": "public, max-age=60", "x-request-id": "rid-1" }),
    );

    expect(merged["Cache-Control"]).toBe("private, must-revalidate");
    expect(merged["cache-control"]).toBeUndefined();
    expect(merged.ETag).toBe('"abc"');
    expect(merged["x-request-id"]).toBe("rid-1");
  });

  it("copies every novel header when nothing collides", () => {
    const merged = mergeResponseHeaders(
      { "X-API-Version": "1" },
      new Headers({ "content-type": "application/json", "x-total-count": "7" }),
    );

    expect(merged["content-type"]).toBe("application/json");
    expect(merged["x-total-count"]).toBe("7");
    expect(merged["X-API-Version"]).toBe("1");
  });
});
