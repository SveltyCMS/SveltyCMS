/**
 * @file tests/unit/ci/e2e-partition.test.ts
 * @description Pins the E2E shard partition: every chromium spec must match
 * exactly one `SHARD_GROUPS` grep.
 *
 * `--grep` is the only selector CI uses (`--grep` + `--shard` silently drops
 * most tests), so a spec that matches no group **never runs in CI** and one that
 * matches two runs twice. Both failures are invisible in a green run:
 *
 * - `smoke.spec.ts` (auth → CRUD → persistence) and `layout-shift.spec.ts` were
 *   matching zero groups until this contract existed.
 * - `routes/dashboard/accessibility.spec.ts` was matching Media & Dashboard *and*
 *   Auth & Branding, paying for the axe audit twice.
 *
 * The chromium ignores below mirror the `chromium` project in
 * `playwright.config.ts`; the other projects cover those specs.
 *
 * @see .github/workflows/e2e-matrix.ts
 * @see playwright.config.ts
 */

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SHARD_GROUPS } from "../../../.github/workflows/e2e-matrix.ts";

const E2E_ROOT = fileURLToPath(new URL("../../../tests/e2e/", import.meta.url));

/** Specs owned by the `wizard`, `firstuser`, `auth-setup` or `oauth` projects. */
const NON_CHROMIUM_SPECS = new Set([
  "routes/setup/setup-wizard.spec.ts",
  "routes/login/login.spec.ts",
  "routes/login/signup.spec.ts",
  "routes/login/oauth.spec.ts",
]);

function collectSpecs(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectSpecs(full, found);
    else if (entry.endsWith(".spec.ts")) found.push(full);
  }
  return found;
}

const specs = collectSpecs(E2E_ROOT)
  .map((full) => full.slice(E2E_ROOT.length).replaceAll("\\", "/"))
  .filter((rel) => !NON_CHROMIUM_SPECS.has(rel));

/** Playwright hands `--grep` the OS-separated path, so both forms must match. */
const pathForms = (rel: string): string[] => [rel, rel.replaceAll("/", "\\")];

describe("E2E shard partition", () => {
  it("matches every chromium spec exactly once", () => {
    const groups = SHARD_GROUPS.map((group) => ({ name: group.name, re: new RegExp(group.grep) }));
    const unmatched: string[] = [];
    const duplicated: string[] = [];

    for (const spec of specs) {
      const hits = groups
        .filter((group) => pathForms(spec).some((form) => group.re.test(form)))
        .map((group) => group.name);
      if (hits.length === 0) unmatched.push(spec);
      if (hits.length > 1) duplicated.push(`${spec} → ${hits.join(" + ")}`);
    }

    expect(unmatched, `specs that would never run in CI:\n${unmatched.join("\n")}`).toEqual([]);
    expect(duplicated, `specs that would run twice:\n${duplicated.join("\n")}`).toEqual([]);
  });

  it("leaves no shard empty", () => {
    // An empty grep group spins up a runner that fails on "no tests found".
    const groups = SHARD_GROUPS.map((group) => ({ name: group.name, re: new RegExp(group.grep) }));
    const empty = groups.filter(
      (group) => !specs.some((spec) => pathForms(spec).some((form) => group.re.test(form))),
    );
    expect(empty.map((group) => group.name)).toEqual([]);
  });

  it("keeps shard names unique (they name the CI job and the artifact)", () => {
    expect(new Set(SHARD_GROUPS.map((group) => group.name)).size).toBe(SHARD_GROUPS.length);
  });
});
