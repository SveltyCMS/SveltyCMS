/**
 * @file tests/unit/scripts/check-hardcoded-copy.test.ts
 * @description Fixtures for the copy ratchet: a recorded string is accepted, a
 * new one fails, and a baseline entry the scan no longer produces is reported
 * stale so `--update` can prune it.
 */

import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  compareToBaseline,
  copyFingerprint,
  type CopyBaseline,
  type Offense,
} from "../../../scripts/check/check-hardcoded-copy";

const ROOT = process.cwd();

function offense(path: string, snippet: string): Offense {
  return { file: join(ROOT, ...path.split("/")), line: 1, snippet, reason: "fixture" };
}

function baseline(entries: string[]): CopyBaseline {
  return { generatedAt: "2026-11-13", note: "fixture", entries };
}

describe("copyFingerprint", () => {
  it("normalizes the path to POSIX and pairs it with the snippet", () => {
    expect(copyFingerprint(offense("src/routes/(app)/x/+page.svelte", "Save changes"))).toBe(
      "src/routes/(app)/x/+page.svelte::Save changes",
    );
  });

  it("keeps the same identity when only the line moves", () => {
    const before = offense("src/a.svelte", "Delete");
    const after = { ...before, line: 99, file: before.file };

    expect(copyFingerprint(after)).toBe(copyFingerprint(before));
  });
});

describe("compareToBaseline", () => {
  it("accepts every recorded string", () => {
    const current = [offense("src/a.svelte", "Save"), offense("src/b.svelte", "Cancel")];
    const { added, stale } = compareToBaseline(
      current,
      baseline(current.map((entry) => copyFingerprint(entry))),
    );

    expect(added).toEqual([]);
    expect(stale).toEqual([]);
  });

  it("fails one new string while keeping the accepted ones", () => {
    const accepted = offense("src/a.svelte", "Save");
    const introduced = offense("src/a.svelte", "Discard everything");

    const { added } = compareToBaseline(
      [accepted, introduced],
      baseline([copyFingerprint(accepted)]),
    );

    expect(added.map((entry) => entry.snippet)).toEqual(["Discard everything"]);
  });

  it("reports a removed string as stale but never as an addition", () => {
    const gone = offense("src/old.svelte", "Legacy label");
    const { added, stale } = compareToBaseline([], baseline([copyFingerprint(gone)]));

    expect(added).toEqual([]);
    expect(stale).toEqual(["src/old.svelte::Legacy label"]);
  });

  it("treats an identical string in a different file as new", () => {
    const original = offense("src/a.svelte", "Save");
    const copy = offense("src/c.svelte", "Save");

    const { added } = compareToBaseline([copy], baseline([copyFingerprint(original)]));

    expect(added).toHaveLength(1);
  });
});
