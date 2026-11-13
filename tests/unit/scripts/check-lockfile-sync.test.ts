/**
 * @file tests/unit/scripts/check-lockfile-sync.test.ts
 * @description Pins the package.json ↔ bun.lock parity check.
 *
 * `bun install --frozen-lockfile` hard-fails on drift, so this gate decides
 * whether CI bootstraps at all. The fixtures cover the three ways a direct
 * dependency can be out of sync (missing, range not satisfied, and the exact-pin
 * / non-registry escape hatches) plus the tolerant lockfile parser.
 */

import { describe, expect, it, vi } from "vitest";
import {
  findLockfileOffenders,
  parseBunLockContent,
  versionOf,
  type DeclaredDependency,
  type LockEntry,
} from "../../../scripts/check/check-lockfile-sync";

function lock(entries: Record<string, string>): Record<string, LockEntry> {
  return Object.fromEntries(
    Object.entries(entries).map(([name, resolved]) => [name, { resolved }]),
  );
}

describe("parseBunLockContent", () => {
  it("accepts a BOM and trailing commas", () => {
    const raw =
      '\uFEFF{"lockfileVersion":1,"packages":{"zod":["zod@3.23.8","",{}],"vitest":["vitest@2.1.0","",{},],},}';

    expect(parseBunLockContent(raw)).toEqual(lock({ zod: "zod@3.23.8", vitest: "vitest@2.1.0" }));
  });

  it("ignores package entries that are not [resolved, …] tuples", () => {
    const raw = '{"packages":{"real":["real@1.0.0","",{}],"meta":"not-a-tuple","empty":[]}}';

    expect(Object.keys(parseBunLockContent(raw))).toEqual(["real"]);
  });

  it("returns no entries when packages is absent", () => {
    expect(parseBunLockContent("{}")).toEqual({});
  });
});

describe("versionOf", () => {
  it("extracts the version from plain and scoped package ids", () => {
    expect(versionOf("zod@3.23.8")).toBe("3.23.8");
    expect(versionOf("@scope/pkg@1.2.3")).toBe("1.2.3");
  });

  it("returns the input when it carries no version separator", () => {
    expect(versionOf("plain-source")).toBe("plain-source");
  });
});

describe("findLockfileOffenders", () => {
  const satisfies = (version: string, range: string) =>
    version.split(".")[0] === range.replace("^", "").split(".")[0];

  it("accepts a lock entry inside the declared range", () => {
    const declared: DeclaredDependency[] = [["zod", "^3.23.0"]];

    expect(findLockfileOffenders(declared, lock({ zod: "zod@3.23.8" }), satisfies)).toEqual([]);
  });

  it("reports a direct dependency missing from bun.lock", () => {
    const declared: DeclaredDependency[] = [["zod", "^3.23.0"]];

    expect(findLockfileOffenders(declared, {}, satisfies)).toEqual([
      "zod@^3.23.0 — missing from bun.lock (run: bun install)",
    ]);
  });

  it("reports a resolved version outside the declared range", () => {
    const declared: DeclaredDependency[] = [["zod", "^4.0.0"]];

    expect(findLockfileOffenders(declared, lock({ zod: "zod@3.23.8" }), satisfies)).toEqual([
      "zod@^4.0.0 — bun.lock resolves 3.23.8 (run: bun install to sync the lockfile)",
    ]);
  });

  it("skips exact pins without asking the semver comparator", () => {
    const compare = vi.fn(() => false);
    const declared: DeclaredDependency[] = [["zod", "3.23.8"]];

    expect(findLockfileOffenders(declared, lock({ zod: "zod@3.23.8" }), compare)).toEqual([]);
    expect(compare).not.toHaveBeenCalled();
  });

  it("skips non-registry sources (file, git, link, workspace, http)", () => {
    const declared: DeclaredDependency[] = [
      ["local", "^1.0.0"],
      ["gitdep", "^1.0.0"],
      ["linked", "^1.0.0"],
      ["workspaced", "^1.0.0"],
      ["remote", "^1.0.0"],
    ];
    const entries = lock({
      local: "local@file:../local",
      gitdep: "gitdep@git+https://example.com/repo.git",
      linked: "linked@link:../linked",
      workspaced: "workspaced@workspace:*",
      remote: "remote@https://example.com/remote.tgz",
    });
    const compare = vi.fn(() => false);

    expect(findLockfileOffenders(declared, entries, compare)).toEqual([]);
    expect(compare).not.toHaveBeenCalled();
  });

  it("collects every offender instead of stopping at the first", () => {
    const declared: DeclaredDependency[] = [
      ["a", "^1.0.0"],
      ["b", "^2.0.0"],
      ["c", "^3.0.0"],
    ];

    const offenders = findLockfileOffenders(declared, lock({ c: "c@3.0.0" }), satisfies);

    expect(offenders).toHaveLength(2);
    expect(offenders[0]).toContain("a@^1.0.0");
    expect(offenders[1]).toContain("b@^2.0.0");
  });
});
