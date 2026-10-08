/**
 * @file tests/unit/services/indexnow.test.ts
 * @description Unit tests for the IndexNow service's pure helpers: CSPRNG key
 * generation (format + uniqueness) and the submission payload (host, key,
 * fixed keyLocation, urlList).
 */

import { describe, expect, it } from "vitest";
import {
  buildIndexNowSubmission,
  generateIndexNowKey,
} from "@src/services/content/seo/indexnow.server";

describe("generateIndexNowKey", () => {
  it("generates 32-char lowercase hex keys (CSPRNG-backed)", () => {
    const key = generateIndexNowKey();
    expect(key).toMatch(/^[0-9a-f]{32}$/);
  });

  it("does not repeat across generations", () => {
    const keys = new Set(Array.from({ length: 50 }, () => generateIndexNowKey()));
    expect(keys.size).toBe(50);
  });
});

describe("buildIndexNowSubmission", () => {
  it("builds the payload with host, key, fixed keyLocation and urlList", () => {
    const submission = buildIndexNowSubmission(
      "https://example.com",
      "0123456789abcdef0123456789abcdef",
      ["https://example.com/about"],
    );
    expect(submission.endpoint).toBe("https://api.indexnow.org/indexnow");
    expect(submission.body).toEqual({
      host: "example.com",
      key: "0123456789abcdef0123456789abcdef",
      keyLocation: "https://example.com/indexnow.txt",
      urlList: ["https://example.com/about"],
    });
  });

  it("strips trailing slashes from the origin in keyLocation", () => {
    const submission = buildIndexNowSubmission("https://example.com/", "key", []);
    expect(submission.body.keyLocation).toBe("https://example.com/indexnow.txt");
  });

  it("throws on a malformed origin (fail-fast, never submits a bad host)", () => {
    expect(() => buildIndexNowSubmission("not-a-url", "key", [])).toThrow();
  });
});
