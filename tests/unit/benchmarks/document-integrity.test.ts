/**
 * @file tests/unit/benchmarks/document-integrity.test.ts
 * @description Unit guard for the benchmark dataset-integrity snapshots.
 *
 * Features:
 * - `snapshotDocument` — key set + serialized size, non-objects read as absent
 * - `compareDocumentSnapshots` — accepts a workload that writes (added fields, rewritten
 *   values), and fails on the two signatures of the 2026-09-22 database bug: a patch that
 *   REPLACED the document (fields disappear) and a value-level collapse (keys kept, size
 *   gone). Both directions are pinned, because a `success`-only assertion passes on all
 *   of them — which is how 30,940 collapsed documents were read as valid rows.
 */

import { describe, expect, it } from "vitest";
import {
  compareDocumentSnapshots,
  snapshotDocument,
} from "@tests/benchmarks/modules/document-integrity";

/** The seeded shape that the harness's own UPDATE scenario used to destroy. */
const seeded = () => ({
  _id: "20000000-0000-7000-8000-000000000001",
  title: "Updated Static Segment Baseline",
  body: "x".repeat(700),
  slug: "stable-segment",
  seo: { title: "s", description: "d" },
  tags: ["a", "b"],
  views: 0,
  tenantId: "global",
});

describe("snapshotDocument", () => {
  it("captures the sorted key set and the serialized size", () => {
    const snapshot = snapshotDocument(seeded());
    expect(snapshot.present).toBe(true);
    expect(snapshot.keys).toEqual([
      "_id",
      "body",
      "seo",
      "slug",
      "tags",
      "tenantId",
      "title",
      "views",
    ]);
    expect(snapshot.bytes).toBe(JSON.stringify(seeded()).length);
  });

  it("treats anything that is not a plain object as absent", () => {
    for (const value of [null, undefined, "doc", 7, [1, 2], true]) {
      expect(snapshotDocument(value)).toEqual({ present: false, keys: [], bytes: 0 });
    }
  });
});

describe("compareDocumentSnapshots", () => {
  it("accepts a workload that writes: added fields and rewritten values are expected", () => {
    const before = snapshotDocument(seeded());
    const after = snapshotDocument({
      ...seeded(),
      title: "Updated Static Segment Baseline",
      views: 12,
      updatedBy: "benchmark", // added by the write path
      updatedAt: "2026-09-22T12:00:00.000Z",
    });
    expect(compareDocumentSnapshots(before, after)).toBeNull();
  });

  it("fails when a patch dropped fields — the collapse signature", () => {
    const before = snapshotDocument(seeded());
    const after = snapshotDocument({ views: 789_038, updatedBy: "agent" });
    const failure = compareDocumentSnapshots(before, after, { label: "stable document X" });
    expect(failure).toContain("stable document X lost 7 field(s)");
    expect(failure).toContain("title");
    expect(failure).toContain("body");
  });

  it("fails when the keys survive but the content collapsed", () => {
    const before = snapshotDocument(seeded());
    const after = snapshotDocument({ ...seeded(), body: "", seo: {}, tags: [] });
    expect(compareDocumentSnapshots(before, after)).toContain("shrank from");
  });

  it("honours a custom byte floor", () => {
    // 121 bytes → 46 bytes is a 38 % ratio: below the default 50 % floor, above a 20 % one.
    const before = snapshotDocument({ _id: "1", body: "x".repeat(100) });
    const after = snapshotDocument({ _id: "1", body: "x".repeat(25) });
    expect(compareDocumentSnapshots(before, after)).toContain("shrank");
    expect(compareDocumentSnapshots(before, after, { minByteRatio: 0.2 })).toBeNull();
  });

  it("fails when the document no longer reads back", () => {
    const before = snapshotDocument(seeded());
    expect(compareDocumentSnapshots(before, snapshotDocument(null))).toContain(
      "no longer reads back",
    );
  });

  it("makes no claim when nothing was seeded", () => {
    // No pre-run document means there is no integrity statement to make — the guard must
    // not turn a missing seed into a benchmark failure.
    expect(compareDocumentSnapshots(snapshotDocument(null), snapshotDocument(seeded()))).toBeNull();
  });
});
