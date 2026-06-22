/**
 * @file tests/unit/utils/log-export.test.ts
 * @description Unit tests for admin log export redaction.
 */

import { describe, it, expect } from "vitest";
import { buildLogExport, redactLogLine } from "@src/utils/log-export";

describe("log-export", () => {
  it("should redact sensitive key/value pairs in log lines", () => {
    const redacted = redactLogLine("2026-01-01 token=abc123 password: hunter2");
    expect(redacted).toContain("[REDACTED]");
    expect(redacted).not.toContain("abc123");
    expect(redacted).not.toContain("hunter2");
  });

  it("should return a valid export envelope", async () => {
    const result = await buildLogExport({
      type: "latest",
      format: "text",
      level: "__no_matching_level__",
    });
    expect(result.contentType).toContain("text/plain");
    expect(result.filename).toMatch(/sveltycms-logs/);
  });
});
