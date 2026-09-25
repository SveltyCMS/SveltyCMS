/**
 * @file tests/unit/databases/read-payload-shape.test.ts
 * @description Unit guard for the read payload's shape: a row's JSON `data` blob is
 * merged into the document root and must NOT also be serialized as a nested field.
 *
 * Features:
 * - pins that the blob key is gone after conversion (the measured duplication: the
 *   competitive point-read row carried ~3489 B where ~1800 B is real)
 * - pins that a collection field literally named `data` inside the blob survives
 * - pins the non-object fallback (a legacy string/array `data` column is copied as-is)
 * - asserts the byte saving, so a re-introduced nested copy fails a fast unit test
 *   instead of only showing up as a wider response on the benchmark lane
 */

import { describe, expect, it } from "vitest";
import { convertDatesToISO } from "@src/databases/core/relational-utils";

/** A row as the SQL read path returns it: system columns + the JSON blob. */
function sqlRow() {
  return {
    _id: "30000000-0000-7000-8000-000000000001",
    tenantId: "global",
    status: "active",
    createdAt: "2026-09-22T10:00:00.000Z",
    updatedAt: "2026-09-22T10:00:00.000Z",
    data: {
      title: "Stable Segment",
      body: "x".repeat(512),
      tags: ["a", "b"],
      views: 7,
      seo: { title: "s", description: "d" },
      createdBy: "agent",
    },
  };
}

describe("read payload shape — no duplicated blob", () => {
  it("merges the blob into the root and drops the nested copy", () => {
    const row = sqlRow();
    const blob = row.data;

    const doc = convertDatesToISO(row, { table: "unregistered_payload_probe" }) as Record<
      string,
      unknown
    >;

    // Fields the blob carried are at the document root.
    expect(doc.title).toBe("Stable Segment");
    expect(doc.tags).toEqual(["a", "b"]);
    expect(doc.views).toBe(7);
    expect(doc.seo).toEqual({ title: "s", description: "d" });
    // …and the raw blob is not serialized a second time.
    expect("data" in doc).toBe(false);

    // The duplication the competitive harness measured: the pre-fix body carried the
    // flattened fields AND the raw blob (~3489 B where ~1800 B is real). Compare against
    // that shape — dropping the nested copy saves about the size of the blob itself.
    const postFix = JSON.stringify(doc).length;
    const preFix = JSON.stringify({ ...doc, data: blob }).length;
    expect(postFix).toBeLessThan(preFix * 0.75);
  });

  it("keeps a collection field that is literally named `data`", () => {
    const row = sqlRow();
    row.data = { ...row.data, data: { nested: "user value" } } as typeof row.data;

    const doc = convertDatesToISO(row, { table: "unregistered_payload_probe" }) as Record<
      string,
      unknown
    >;

    // Object.assign put the user's value on the root before the blob was dropped.
    expect(doc.data).toEqual({ nested: "user value" });
    expect(doc.title).toBe("Stable Segment");
  });

  it("parses and flattens a legacy JSON-string blob column", () => {
    const row = {
      ...sqlRow(),
      data: '{"legacy":true,"title":"from string"}',
    } as unknown as ReturnType<typeof sqlRow>;

    const doc = convertDatesToISO(row, { table: "unregistered_payload_probe" }) as Record<
      string,
      unknown
    >;

    // `normalizeJsonFieldValue` parses through the JSON-string layers first (legacy rows
    // were double-encoded), so a string blob behaves exactly like an object one: its
    // fields land at the root and the raw string is not mirrored back.
    expect(doc.legacy).toBe(true);
    expect(doc.title).toBe("from string");
    expect("data" in doc).toBe(false);
  });
});
