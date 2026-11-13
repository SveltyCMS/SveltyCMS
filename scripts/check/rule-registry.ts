/**
 * @file scripts/check/rule-registry.ts
 * @description Single-owner registry for the read-only fast check suite.
 *
 * `scripts/check/run-fast-checks.ts` used to own the check list inline, which
 * meant every consumer (runner, tests, docs) could drift from the gates that
 * actually execute. This module is the only place a check is declared: id,
 * script, args, kind and owning subsystem all live here.
 *
 * `kind` is the rule's execution model, not its severity:
 * - `static` — text/regex pass over the source tree
 * - `ast` — TypeScript/Svelte AST analysis (must expose a pure core function)
 * - `policy` — repository convention / ratchet assertion
 * - `assurance` — aggregated assurance gate (advisory SLA, threat model, …)
 *
 * Usage:
 *   bun run scripts/check/run-fast-checks.ts
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface CheckSpec {
  id: string;
  script: string;
  args?: readonly string[];
  kind: "static" | "ast" | "policy" | "assurance";
  /** Owning subsystem, e.g. "design-system", "security", "tests". */
  owner: string;
}

/** Repository root, resolved from this module rather than `process.cwd()`. */
const REPO_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));

export const FAST_CHECKS: readonly CheckSpec[] = [
  {
    id: "consolidate-shades",
    script: "scripts/lint/consolidate-shades.ts",
    args: ["--check"],
    kind: "policy",
    owner: "design-system",
  },
  { id: "lint-widgets", script: "scripts/lint/lint-widgets.ts", kind: "policy", owner: "widgets" },
  {
    id: "lint-e2e-hydration",
    script: "scripts/lint/lint-e2e-hydration.ts",
    args: ["--check"],
    kind: "static",
    owner: "tests",
  },
  {
    id: "lint-trivial-assertions",
    script: "scripts/lint/lint-trivially-true-assertions.ts",
    args: ["--check"],
    kind: "static",
    owner: "tests",
  },
  {
    id: "lint-e2e-actionability",
    script: "scripts/lint/lint-e2e-actionability.ts",
    kind: "static",
    owner: "tests",
  },
  {
    id: "marketplace-conformance",
    script: "scripts/marketplace/conformance.ts",
    kind: "policy",
    owner: "marketplace",
  },
  {
    id: "check-route-behaviour",
    script: "scripts/check/check-route-behaviour.ts",
    args: ["--check", "--min=99"],
    kind: "policy",
    owner: "tests",
  },
  {
    id: "check-route-manifest",
    script: "scripts/check/check-route-manifest.ts",
    kind: "policy",
    owner: "tests",
  },
  {
    id: "check-integration-isolation",
    script: "scripts/test/check-integration-isolation.ts",
    args: ["--check"],
    kind: "policy",
    owner: "tests",
  },
  {
    id: "check-lockfile-sync",
    script: "scripts/check/check-lockfile-sync.ts",
    kind: "policy",
    owner: "release",
  },
  {
    id: "check-seam-assertions",
    script: "scripts/check/check-seam-assertions.ts",
    kind: "static",
    owner: "tests",
  },
  {
    id: "version-verify",
    script: "scripts/version.ts",
    args: ["--verify"],
    kind: "policy",
    owner: "release",
  },
  {
    id: "security-assurance",
    script: "scripts/security/security-assurance.ts",
    kind: "assurance",
    owner: "security",
  },
  {
    id: "check-ast-gates",
    script: "scripts/check/run-ast-gates.ts",
    kind: "ast",
    owner: "architecture",
  },
  {
    id: "check-route-efficiency",
    script: "scripts/check/check-route-efficiency.ts",
    args: ["--check"],
    kind: "policy",
    owner: "architecture",
  },
  {
    id: "check-translations",
    script: "scripts/check/check-translations.ts",
    kind: "policy",
    owner: "i18n",
  },
  {
    id: "check-hardcoded-copy",
    script: "scripts/check/check-hardcoded-copy.ts",
    args: ["--check"],
    kind: "policy",
    owner: "i18n",
  },
  {
    id: "check-source-lints",
    script: "scripts/check/run-source-lints.ts",
    kind: "ast",
    owner: "architecture",
  },
];

/** Conservative AST-rule contract: the scanner must expose a pure core function. */
const AST_PURE_CORE_EXPORT = /^\s*export\s+(?:async\s+)?function\s+[A-Za-z_$][\w$]*/m;

/**
 * Verifies the registry is internally consistent and points at real files.
 *
 * Returns one human-readable error per problem (empty array = healthy) so both
 * the runner (fail fast before spawning) and the unit suite can assert it.
 */
export function assertRuleRegistryIntegrity(root: string = REPO_ROOT): string[] {
  const errors: string[] = [];
  const firstIndexById = new Map<string, number>();

  for (const [index, spec] of FAST_CHECKS.entries()) {
    const firstIndex = firstIndexById.get(spec.id);
    if (firstIndex === undefined) {
      firstIndexById.set(spec.id, index);
    } else {
      errors.push(
        `Duplicate check id "${spec.id}" at index ${index} (first declared at index ${firstIndex}).`,
      );
    }

    const absoluteScript = resolve(root, spec.script);
    if (!existsSync(absoluteScript)) {
      errors.push(`Check "${spec.id}" points to a missing script: ${spec.script}`);
      continue;
    }

    if (spec.kind === "ast") {
      let source: string;
      try {
        source = readFileSync(absoluteScript, "utf8");
      } catch (error) {
        errors.push(
          `Check "${spec.id}" is kind "ast" but ${spec.script} could not be read: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        continue;
      }
      if (!AST_PURE_CORE_EXPORT.test(source)) {
        errors.push(
          `Check "${spec.id}" is kind "ast" but ${spec.script} exports no pure function ` +
            `(expected an "export function …" core that fixtures can call).`,
        );
      }
    }
  }

  return errors;
}
