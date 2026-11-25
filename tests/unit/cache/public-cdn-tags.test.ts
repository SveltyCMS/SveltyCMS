/**
 * @file tests/unit/cache/public-cdn-tags.test.ts
 * @description Unit tests for Surrogate-Key / Cache-Tag headers on public vs authenticated collection reads.
 */

import { describe, expect, it } from "vitest";
import {
  buildPublicCdnTagHeaders,
  collectionEtagResponseHeaders,
} from "@src/services/cache/collection-etag";

describe("Public CDN Surrogate-Key and Cache-Tag headers", () => {
  it("formats list Surrogate-Key and Cache-Tag headers scoped by tenant and collection", () => {
    expect(buildPublicCdnTagHeaders("t1", "posts")).toEqual({
      "Surrogate-Key": "t:t1 c:posts",
      "Cache-Tag": "t:t1,c:posts",
    });

    expect(buildPublicCdnTagHeaders(null, "posts")).toEqual({
      "Surrogate-Key": "t:global c:posts",
      "Cache-Tag": "t:global,c:posts",
    });
  });

  it("includes entry tag for public point reads", () => {
    expect(buildPublicCdnTagHeaders("t1", "posts", "entry-99")).toEqual({
      "Surrogate-Key": "t:t1 c:posts e:entry-99",
      "Cache-Tag": "t:t1,c:posts,e:entry-99",
    });
  });

  it("omits CDN tags on authenticated ETag headers by default and includes them when public", () => {
    const authed = collectionEtagResponseHeaders('W/"123"');
    expect(authed["Surrogate-Key"]).toBeUndefined();
    expect(authed["Cache-Tag"]).toBeUndefined();
    expect(authed.ETag).toBe('W/"123"');

    const anon = collectionEtagResponseHeaders('W/"123"', {
      tenantId: "t1",
      collectionId: "posts",
      entryId: "entry-99",
    });
    expect(anon["Surrogate-Key"]).toBe("t:t1 c:posts e:entry-99");
    expect(anon["Cache-Tag"]).toBe("t:t1,c:posts,e:entry-99");
    expect(anon.ETag).toBe('W/"123"');
  });
});
