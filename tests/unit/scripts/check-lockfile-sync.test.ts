/**
 * @file tests/unit/scripts/check-lockfile-sync.test.ts
 * @description Pins the package.json ↔ bun.lock parity check.
 *
 * `bun install --frozen-lockfile` hard-fails on drift, so this gate decides
 * whether CI bootstraps at all. The fixtures cover the three ways a direct
 * dependency can be out of sync (missing, range not satisfied, and the exact-pin
 * / non-registry escape hatches) plus the tolerant lockfile parser.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  findDuplicateJsonKeys,
  findLockfileOffenders,
  findOverridesOffenders,
  findUndeclaredPackageImports,
  findWorkspaceLockfileOffenders,
  parseBunLockContent,
  parseBunLockData,
  resolveWorkspaceDirs,
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

describe("findDuplicateJsonKeys", () => {
  it("detects duplicate object keys in package.json while allowing nested identical keys", () => {
    const raw = JSON.stringify(
      {
        name: "root",
        workspaces: ["packages/*"],
        nested: { workspaces: ["ignored"] },
      },
      null,
      2,
    );
    expect(findDuplicateJsonKeys(raw)).toEqual([]);

    const withDup = `{
      "name": "root",
      "workspaces": ["packages/*"],
      "scripts": {},
      "workspaces": ["packages/*"]
    }`;
    const dups = findDuplicateJsonKeys(withDup);
    expect(dups).toHaveLength(1);
    expect(dups[0]).toContain('"workspaces"');
  });

  it("ignores keys inside array items or string values", () => {
    const raw = `{
      "description": "{\\"a\\": 1, \\"a\\": 2}",
      "items": [{"name": "one"}, {"name": "two"}]
    }`;
    expect(findDuplicateJsonKeys(raw)).toEqual([]);
  });
});

describe("workspace and override lockfile parity", () => {
  it("expands workspace globs and detects missing workspace entries in bun.lock", () => {
    const root = mkdtempSync(join(tmpdir(), "lockfile-ws-"));
    try {
      mkdirSync(join(root, "packages", "sdk"), { recursive: true });
      writeFileSync(
        join(root, "packages", "sdk", "package.json"),
        JSON.stringify({ name: "@sveltycms/sdk", version: "0.1.0" }),
      );
      expect(resolveWorkspaceDirs(root, ["packages/*"])).toEqual(["packages/sdk"]);

      const emptyLock = parseBunLockData(
        JSON.stringify({
          lockfileVersion: 1,
          workspaces: { "": { name: "root" } },
          packages: {},
        }),
      );

      const missingOffenders = findWorkspaceLockfileOffenders(
        [
          {
            dir: "packages/sdk",
            raw: '{"name":"@sveltycms/sdk","version":"0.1.0"}',
            manifest: { name: "@sveltycms/sdk", version: "0.1.0" },
          },
        ],
        emptyLock,
      );
      expect(missingOffenders).toEqual([
        'workspace "packages/sdk" is missing from bun.lock "workspaces"',
      ]);

      const syncedLock = parseBunLockData(
        JSON.stringify({
          lockfileVersion: 1,
          workspaces: {
            "": { name: "root" },
            "packages/sdk": { name: "@sveltycms/sdk", version: "0.1.0" },
          },
          packages: {
            "@sveltycms/sdk": ["@sveltycms/sdk@workspace:packages/sdk"],
          },
        }),
      );
      expect(
        findWorkspaceLockfileOffenders(
          [
            {
              dir: "packages/sdk",
              raw: '{"name":"@sveltycms/sdk","version":"0.1.0"}',
              manifest: { name: "@sveltycms/sdk", version: "0.1.0" },
            },
          ],
          syncedLock,
        ),
      ).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("flags mismatched overrides between package.json and bun.lock", () => {
    expect(findOverridesOffenders({ foo: "^1.2.0" }, { foo: "^1.0.0" })).toHaveLength(1);
    expect(findOverridesOffenders({ foo: "^1.2.0" }, { foo: "^1.2.0" })).toEqual([]);
  });

  it("flags bare third-party imports missing from declared dependencies", () => {
    const root = mkdtempSync(join(tmpdir(), "lockfile-imports-"));
    try {
      mkdirSync(join(root, "src"), { recursive: true });
      writeFileSync(
        join(root, "src", "ok.ts"),
        'import { formatDate } from "@utils/date";\nimport { parseAllDocuments } from "yaml";\nimport fs from "node:fs";\n',
      );
      writeFileSync(
        join(root, "src", "bad.ts"),
        'import { DOMParser } from "@xmldom/xmldom";\nexport const x = DOMParser;\n',
      );
      writeFileSync(
        join(root, "src", "comp.svelte"),
        '<script lang="ts">import { readVarUint } from "lib0/decoding";</script><p>import { ghost } from "fake";</p>',
      );

      const offenders = findUndeclaredPackageImports(root, new Set(["yaml"]), ["src"]);
      expect(offenders).toHaveLength(2);
      expect(offenders.some((line) => line.includes("@xmldom/xmldom"))).toBe(true);
      expect(offenders.some((line) => line.includes('"lib0"'))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
