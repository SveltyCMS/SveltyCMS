/**
 * @file tests/unit/plugins/unified-data-hub/rest-write-utils.test.ts
 * @description REST write utility tests (SSRF path segments, field mapping).
 */

import { describe, expect, it } from "vitest";
import { FederationError } from "@plugins/unified-data-hub/types";
import {
  assertSafeRestEntryId,
  buildRestEntryUrl,
  mapVirtualWriteBody,
} from "@plugins/unified-data-hub/server/rest-write-utils";

describe("rest write utils", () => {
  it("rejects unsafe REST entry path segments", () => {
    expect(() => assertSafeRestEntryId("../etc")).toThrow(FederationError);
    expect(() => assertSafeRestEntryId("a/b")).toThrow(FederationError);
    expect(assertSafeRestEntryId("42")).toBe("42");
  });

  it("builds SSRF-validated entry URLs", () => {
    const url = buildRestEntryUrl("https://blog.example.com", "/wp-json/wp/v2/posts", "12", [
      "blog.example.com",
    ]);
    expect(url.pathname).toBe("/wp-json/wp/v2/posts/12");
  });

  it("maps virtual fields to upstream keys with WordPress draft default", () => {
    const body = mapVirtualWriteBody(
      {
        source: { platform: "wordpress" },
        fields: [
          { name: "title", label: "Title", sourceField: "title", type: "text" },
          { name: "slug", label: "Slug", sourceField: "slug", type: "text" },
        ],
      } as any,
      { title: "Hello", slug: "hello" },
    );
    expect(body.title).toBe("Hello");
    expect(body.slug).toBe("hello");
    expect(body.status).toBe("draft");
  });
});
