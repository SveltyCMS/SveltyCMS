/**
 * @file tests/unit/databases/resolve-sqlite-path.test.ts
 * @description
 * Regression guard for `resolveSqlitePath()` in src/databases/config-state.ts —
 * the SQLite connection-string builder that decides between `config/database/`
 * (real/dev data) and `config/test-database/` (harness scratch space).
 *
 * Incident this pins: the test branch used to `require("node:fs")` inside the
 * same `try` that returned the test path. In the esbuild-built background-worker
 * bundle that `require` throws ("Dynamic require of node:fs is not supported"),
 * the `catch` swallowed it, and every worker process wrote its DB into
 * `config/database/` — the user's real data folder. The return now lives outside
 * the `try` and the mkdir is best-effort, so a mkdir failure can never re-route.
 *
 * `isAutomatedTestHarness()` is always true under Vitest (VITEST=true), so the
 * dev-name branches are only reachable by overriding the detector — a boundary
 * mock (environment detection), not a partial stub of a core contract.
 *
 * ### Features:
 * - harness flag → config/test-database/ (flag dominates a dev-ish name)
 * - shared name classifier (test/bench/e2e/_functional) → config/test-database/
 * - plain dev names → config/database/
 * - explicit directory hosts (POSIX, Windows drive, relative) pass through
 * - ".sqlite" canonicalization (never doubled)
 * - mkdirSync failure cannot change the resolved path (worker-bundle regression)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const harnessState = vi.hoisted(() => ({ active: false }));

vi.mock("@utils/private-config-policy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@utils/private-config-policy")>();
  return { ...actual, isAutomatedTestHarness: () => harnessState.active };
});

import { resolveSqlitePath } from "@src/databases/config-state";

beforeEach(() => {
  harnessState.active = false;
});

describe("resolveSqlitePath — harness routing", () => {
  it("routes to config/test-database/ when the harness flag is set (even for a dev-ish name)", () => {
    harnessState.active = true;

    expect(resolveSqlitePath("127.0.0.1", "sveltycms")).toBe(
      "config/test-database/sveltycms.sqlite",
    );
    expect(resolveSqlitePath(undefined, "probe_plainA")).toBe(
      "config/test-database/probe_plainA.sqlite",
    );
  });

  it("routes isolated-DB names to config/test-database/ without the flag (shared classifier)", () => {
    // One name per classifier branch: test / bench / bench / e2e / _functional.
    for (const name of [
      "sveltycms_test",
      "benchmark_shared",
      "bench_parent",
      "e2e_auth",
      "smoke_functional",
    ]) {
      expect(resolveSqlitePath("127.0.0.1", name)).toBe(`config/test-database/${name}.sqlite`);
    }
  });

  it("keeps plain dev names on config/database/", () => {
    for (const name of ["sveltycms", "sveltycms_probe", "content"]) {
      expect(resolveSqlitePath("127.0.0.1", name)).toBe(`config/database/${name}.sqlite`);
      expect(resolveSqlitePath(undefined, name)).toBe(`config/database/${name}.sqlite`);
    }
  });

  it("rejects production-like names even when they contain 'test' (classifier reject-list)", () => {
    // enforceTestSafety() would hard-fail this name in TEST_MODE; routing it to
    // the dev folder keeps both call sites consistent instead of inventing a
    // third interpretation of "looks like a test DB".
    expect(resolveSqlitePath("127.0.0.1", "test_production")).toBe(
      "config/database/test_production.sqlite",
    );
  });
});

describe("resolveSqlitePath — network vs explicit directory hosts", () => {
  it("treats localhost aliases and IPs as network addresses, not directories", () => {
    for (const host of ["localhost", "127.0.0.1", "0.0.0.0", "10.20.30.40"]) {
      expect(resolveSqlitePath(host, "content")).toBe("config/database/content.sqlite");
    }
  });

  it("uses an explicit POSIX directory host as-is", () => {
    expect(resolveSqlitePath("/var/lib/svelty", "content")).toBe("/var/lib/svelty/content.sqlite");
  });

  it("does not double a trailing separator", () => {
    expect(resolveSqlitePath("/var/lib/svelty/", "content")).toBe("/var/lib/svelty/content.sqlite");
  });

  it("accepts Windows drive and relative directory hosts", () => {
    // Separator style is preserved; Windows accepts mixed separators.
    expect(resolveSqlitePath("D:\\data\\svelty", "content")).toBe(
      "D:\\data\\svelty/content.sqlite",
    );
    expect(resolveSqlitePath("./local-data", "content")).toBe("./local-data/content.sqlite");
  });
});

describe("resolveSqlitePath — extension canonicalization", () => {
  it("never doubles the .sqlite extension", () => {
    expect(resolveSqlitePath("127.0.0.1", "content.sqlite")).toBe("config/database/content.sqlite");
    expect(resolveSqlitePath("127.0.0.1", "benchmark_shared.sqlite")).toBe(
      "config/test-database/benchmark_shared.sqlite",
    );
  });
});

describe("resolveSqlitePath — best-effort directory creation", () => {
  afterEach(() => {
    harnessState.active = false;
  });

  it("returns the test-database path even when mkdirSync throws (worker-bundle regression)", () => {
    // Force a REAL mkdir failure instead of mocking node:fs: point cwd at an
    // existing FILE, so `<file>/config/test-database` can never be created
    // (ENOTDIR on POSIX, ENOTDIR/EEXIST on Windows) — the same class of failure
    // the esbuild-built worker hit via `require("node:fs")`.
    const blockingBase = join(process.cwd(), "package.json");
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(blockingBase);
    try {
      // Self-check the premise: the mkdir really does throw for this base.
      expect(() =>
        mkdirSync(join(blockingBase, "config", "test-database"), { recursive: true }),
      ).toThrow();

      expect(resolveSqlitePath("127.0.0.1", "probe_test_worker")).toBe(
        "config/test-database/probe_test_worker.sqlite",
      );
      expect(resolveSqlitePath("127.0.0.1", "bench_parent")).toBe(
        "config/test-database/bench_parent.sqlite",
      );
      // Non-test names must still route to the dev folder with mkdir broken.
      expect(resolveSqlitePath("127.0.0.1", "sveltycms")).toBe("config/database/sveltycms.sqlite");
    } finally {
      cwdSpy.mockRestore();
    }
  });
});
