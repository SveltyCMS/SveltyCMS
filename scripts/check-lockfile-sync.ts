/**
 * @file scripts/check-lockfile-sync.ts
 * @description
 * Verifies that every dependency range declared in package.json is satisfied
 * by the resolved version recorded in bun.lock.
 *
 * Why this exists:
 * - `bun install --frozen-lockfile` (CI Bootstrap) hard-fails when the
 *   manifest and lockfile disagree, which skipped every downstream CI job.
 * - Pre-commit gates (format/lint/unit) cannot see this because they never
 *   re-resolve dependencies — so a package.json bump without a lockfile
 *   regeneration used to pass locally and break CI.
 *
 * This is a pure static check (~ms, no network, no node_modules writes):
 * - every direct dependency must exist in bun.lock
 * - its resolved version must satisfy the declared semver range
 *
 * Usage: bun run scripts/check-lockfile-sync.ts
 * Exit: 0 when in sync, 1 with a list of offenders otherwise.
 */

import { readFileSync } from "node:fs";

const FAIL_PREFIX = "❌ lockfile-sync";

interface LockEntry {
  /** First element of a bun.lock package entry: "name@resolvedVersion". */
  resolved: string;
}

function parseBunLock(path: string): Record<string, LockEntry> {
  const raw = readFileSync(path, "utf-8")
    .replace(/^\uFEFF/, "")
    .replace(/,\s*([\]}])/g, "$1");
  const data = JSON.parse(raw) as { packages?: Record<string, unknown> };
  const entries: Record<string, LockEntry> = {};
  for (const [name, info] of Object.entries(data.packages ?? {})) {
    if (Array.isArray(info) && typeof info[0] === "string") {
      entries[name] = { resolved: info[0] };
    }
  }
  return entries;
}

function versionOf(resolved: string): string {
  const at = resolved.lastIndexOf("@");
  return at > 0 ? resolved.slice(at + 1) : resolved;
}

const pkgJson = JSON.parse(readFileSync("package.json", "utf-8")) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};
const lock = parseBunLock("bun.lock");

const declared: Array<[string, string]> = [
  ...Object.entries(pkgJson.dependencies ?? {}),
  ...Object.entries(pkgJson.devDependencies ?? {}),
  ...Object.entries(pkgJson.optionalDependencies ?? {}),
];

const offenders: string[] = [];
for (const [name, range] of declared) {
  const entry = lock[name];
  if (!entry) {
    offenders.push(`${name}@${range} — missing from bun.lock (run: bun install)`);
    continue;
  }
  const version = versionOf(entry.resolved);
  if (version === range || /^(http|file:|git|link:|workspace:)/.test(version)) {
    continue; // exact pin or non-registry source — nothing to satisfy
  }
  if (!Bun.semver.satisfies(version, range)) {
    offenders.push(
      `${name}@${range} — bun.lock resolves ${version} (run: bun install to sync the lockfile)`,
    );
  }
}

if (offenders.length > 0) {
  console.error(`${FAIL_PREFIX}: package.json and bun.lock are out of sync (${offenders.length}):`);
  for (const line of offenders) console.error(`  - ${line}`);
  process.exit(1);
}

console.log(`✅ lockfile-sync: ${declared.length} direct dependencies in sync with bun.lock`);
