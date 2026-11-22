/**
 * @file tests/unit/media/media-folder-validation.test.ts
 * @description Media folder guard (`validateMediaFolder`).
 *
 * ### Features:
 * - Accepts both shapes the upload lanes send: a folder id and a path
 * - Rejects traversal, empty/relative segments, drive/scheme separators
 * - Rejects control / zero-width characters and over-long values
 * - Pure (no adapter, no filesystem)
 */

import { describe, expect, it } from "vitest";
import { validateMediaFolder } from "@utils/media/media-utils";

function accepted(value: string): string {
  const result = validateMediaFolder(value);
  expect(result.ok, `expected "${value}" to be accepted`).toBe(true);
  return result.ok ? result.folder : "";
}

function rejected(value: string): void {
  expect(validateMediaFolder(value).ok, `expected "${value}" to be rejected`).toBe(false);
}

describe("validateMediaFolder", () => {
  it("accepts the id and path shapes the upload lanes send", () => {
    expect(accepted("global")).toBe("global");
    expect(accepted("0192f3a0-7c1e-7d4b-9b7a-2f6c1d9e8a10")).toBe(
      "0192f3a0-7c1e-7d4b-9b7a-2f6c1d9e8a10",
    );
    expect(accepted("collections/posts")).toBe("collections/posts");
    expect(accepted("images/2026/Q4")).toBe("images/2026/Q4");
  });

  it("keeps localized folder names", () => {
    expect(accepted("Ordner/Überblick")).toBe("Ordner/Überblick");
    expect(accepted("документы/2026")).toBe("документы/2026");
    expect(accepted("مجلد/صور")).toBe("مجلد/صور");
  });

  it("trims surrounding whitespace", () => {
    expect(accepted("  collections/posts  ")).toBe("collections/posts");
  });

  it("rejects empty and whitespace-only values", () => {
    rejected("");
    rejected("   ");
    rejected("\t");
  });

  it("rejects traversal and relative segments", () => {
    rejected("../etc");
    rejected("a/../b");
    rejected("./x");
    rejected("a/./b");
    rejected("a/..");
  });

  it("rejects absolute paths and empty segments", () => {
    rejected("/etc");
    rejected("trailing/");
    rejected("a//b");
  });

  it("rejects drive, scheme and Windows-illegal characters", () => {
    rejected("C:evil");
    rejected("\\\\server\\share");
    rejected("a\\b");
    rejected("a?b");
    rejected('a"b');
    rejected("a|b");
    rejected("a*b");
    rejected("a<b");
  });

  it("rejects control and zero-width characters", () => {
    rejected("a\u0000b");
    rejected("a\u0007b");
    rejected("a\u200bb");
    rejected("a\u2028b");
  });

  it("caps the value length", () => {
    expect(accepted("a".repeat(255))).toHaveLength(255);
    rejected("a".repeat(256));
  });
});
