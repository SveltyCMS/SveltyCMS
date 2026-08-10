/**
 * @file tests/unit/security/source-adapters-egress.test.ts
 * @description
 * SSRF regression tests for the external content source adapters
 * (Drupal JSON:API / WordPress REST). The source URL is admin/user-supplied
 * input, so every fetch must be blocked by the egress guard when the target
 * resolves to a private or loopback address.
 */

import { describe, it, expect } from "vitest";
import {
  fetchDrupalData,
  fetchWordPressData,
} from "../../../src/services/content/importer/source-adapters";

describe("content importer source adapters — SSRF egress", () => {
  it("fetchWordPressData rejects loopback targets before any network I/O", async () => {
    await expect(fetchWordPressData("https://127.0.0.1:9000", "posts")).rejects.toThrow(
      /blocked|Blocked|private/i,
    );
  });

  it("fetchDrupalData rejects loopback targets before any network I/O", async () => {
    await expect(fetchDrupalData("https://127.0.0.1:9000", "article")).rejects.toThrow(
      /blocked|Blocked|private/i,
    );
  });

  it("fetchWordPressData rejects plain-HTTP targets in non-development environments", async () => {
    await expect(fetchWordPressData("http://example.com", "posts")).rejects.toThrow(
      /HTTP not allowed|Blocked/i,
    );
  });

  it("fetchDrupalData rejects RFC1918 private ranges", async () => {
    await expect(fetchDrupalData("https://10.0.0.5", "article")).rejects.toThrow(
      /blocked|Blocked|private/i,
    );
    await expect(fetchDrupalData("https://192.168.1.10", "article")).rejects.toThrow(
      /blocked|Blocked|private/i,
    );
  });

  it("fetchWordPressData rejects cloud metadata endpoints", async () => {
    await expect(fetchWordPressData("https://169.254.169.254", "posts")).rejects.toThrow(
      /blocked|Blocked|private|metadata/i,
    );
  });
});
