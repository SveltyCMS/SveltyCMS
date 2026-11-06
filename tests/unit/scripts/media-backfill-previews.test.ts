/**
 * @file tests/unit/scripts/media-backfill-previews.test.ts
 * @description Unit tests for the document-preview backfill CLI helpers
 * (`scripts/media/backfill-previews.ts`). No database or storage is booted.
 */

import { describe, expect, it } from "vitest";
import {
  needsBackfill,
  parseBackfillArgs,
  type BackfillKindFilter,
} from "../../../scripts/media/backfill-previews";

describe("parseBackfillArgs", () => {
  it("defaults to a dry run across all document kinds", () => {
    expect(parseBackfillArgs([])).toEqual({
      apply: false,
      help: false,
      kind: "all",
      limit: null,
      tenantId: undefined,
    });
  });

  it("switches to apply mode", () => {
    expect(parseBackfillArgs(["--apply"]).apply).toBe(true);
  });

  it("lets the last mode flag win", () => {
    expect(parseBackfillArgs(["--apply", "--dry-run"]).apply).toBe(false);
    expect(parseBackfillArgs(["--dry-run", "--apply"]).apply).toBe(true);
  });

  it("parses limit, tenant and kind", () => {
    const args = parseBackfillArgs(["--limit=25", "--tenant=tenant-a", "--kind=csv"]);
    expect(args.limit).toBe(25);
    expect(args.tenantId).toBe("tenant-a");
    expect(args.kind).toBe("csv");
  });

  it("accepts every kind filter (case-insensitive)", () => {
    const kinds: readonly BackfillKindFilter[] = ["pdf", "csv", "office", "all"];
    for (const kind of kinds) {
      expect(parseBackfillArgs([`--kind=${kind}`]).kind).toBe(kind);
    }
    expect(parseBackfillArgs(["--kind=PDF"]).kind).toBe("pdf");
  });

  it.each(["--limit=abc", "--limit=0", "--limit=-3", "--limit=1.5", "--limit=", "--limit"])(
    "rejects an invalid limit (%s)",
    (flag) => {
      expect(() => parseBackfillArgs([flag])).toThrow(/limit/i);
    },
  );

  it.each(["--kind=doc", "--kind=delimited", "--kind=", "--kind"])(
    "rejects an invalid kind (%s)",
    (flag) => {
      expect(() => parseBackfillArgs([flag])).toThrow(/kind/i);
    },
  );

  it.each(["--tenant=", "--tenant"])("rejects an empty tenant (%s)", (flag) => {
    expect(() => parseBackfillArgs([flag])).toThrow(/tenant/i);
  });

  it("ignores unknown flags", () => {
    expect(parseBackfillArgs(["--verbose"]).kind).toBe("all");
  });

  it("supports --help and -h", () => {
    expect(parseBackfillArgs(["--help"]).help).toBe(true);
    expect(parseBackfillArgs(["-h"]).help).toBe(true);
  });
});

describe("needsBackfill", () => {
  const existingThumbnails = {
    thumbnail: { url: "/files/global/abc/thumbnail/abc.jpg", width: 200, height: 100 },
  };

  it("selects document rows whose thumbnail map is empty", () => {
    expect(needsBackfill("pdf", {})).toBe(true);
    expect(needsBackfill("delimited", {})).toBe(true);
    expect(needsBackfill("office", {})).toBe(true);
    expect(needsBackfill("pdf", undefined)).toBe(true);
    expect(needsBackfill("pdf", null)).toBe(true);
  });

  it("ignores assets with their own derivative path (image/video/audio)", () => {
    expect(needsBackfill(null, {})).toBe(false);
  });

  it("skips rows that already advertise a preview", () => {
    expect(needsBackfill("pdf", existingThumbnails)).toBe(false);
    expect(needsBackfill("office", existingThumbnails, "office")).toBe(false);
  });

  it("honours the kind filter (csv maps to the delimited detector family)", () => {
    expect(needsBackfill("pdf", {}, "pdf")).toBe(true);
    expect(needsBackfill("pdf", {}, "csv")).toBe(false);
    expect(needsBackfill("pdf", {}, "office")).toBe(false);

    expect(needsBackfill("delimited", {}, "csv")).toBe(true);
    expect(needsBackfill("delimited", {}, "pdf")).toBe(false);

    expect(needsBackfill("office", {}, "office")).toBe(true);
    expect(needsBackfill("office", {}, "all")).toBe(true);
  });
});
