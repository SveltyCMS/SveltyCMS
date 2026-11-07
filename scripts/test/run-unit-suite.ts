#!/usr/bin/env bun
/**
 * @file scripts/test/run-unit-suite.ts
 * @description Runs a Vitest suite and enforces the test-inventory floor.
 *
 * The gate script exists because a green suite only proves that the tests which
 * ran passed. It cannot prove that every test which *should* have run did: a
 * subset run was once reported as the full suite, and a renamed file silently
 * stopped executing. Emitting the machine-readable report from inside the same
 * invocation removes the chance of validating a stale or partial JSON file.
 *
 * Features:
 * - Passes every forwarded argument to Vitest unchanged (subset runs still work)
 * - Adds the JSON reporter alongside the console reporter (CI keeps `dot`)
 * - Runs `check-test-inventory.ts` after a full-suite run only
 * - Skips the ratchet for subset runs (`--changed`, positional filters) with an
 *   explicit message, so a deliberate partial run is never silently accepted
 *
 * Usage:
 *   bun run scripts/test/run-unit-suite.ts
 *   bun run scripts/test/run-unit-suite.ts --coverage
 *   bun run scripts/test/run-unit-suite.ts --config=vitest.dom.config.ts --layer=components
 *   bun run scripts/test/run-unit-suite.ts tests/unit/api          # subset → no ratchet
 */

import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const VITEST_ENTRY = join(ROOT, "node_modules", "vitest", "vitest.mjs");
const INVENTORY_SCRIPT = join(ROOT, "scripts", "check", "check-test-inventory.ts");

/** Flags that consume the next argument; a following value is not a filter. */
const VALUE_FLAGS = new Set([
  "--reporter",
  "--outputFile",
  "--pool",
  "--poolOptions",
  "--maxWorkers",
  "--minWorkers",
  "--environment",
  "--project",
  "--sequence",
  "--testTimeout",
  "--hookTimeout",
  "--bail",
  "--retry",
  "--dir",
  "--exclude",
  "--coverage.reportsDirectory",
]);

interface WrapperOptions {
  layer: string;
  forwarded: string[];
}

function parseWrapperArgs(argv: readonly string[]): WrapperOptions {
  let layer = "unit";
  const forwarded: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith("--layer=")) {
      layer = arg.slice("--layer=".length);
      continue;
    }
    forwarded.push(arg);
    if (VALUE_FLAGS.has(arg) && index + 1 < argv.length) {
      forwarded.push(argv[index + 1]);
      index += 1;
    }
  }
  return { layer, forwarded };
}

/** A positional filter, `--changed`, or `--shard` means only part of the suite ran. */
function isSubsetRun(forwarded: readonly string[]): boolean {
  let index = 0;
  while (index < forwarded.length) {
    const arg = forwarded[index];
    if (!arg.startsWith("-")) return true;
    if (VALUE_FLAGS.has(arg)) {
      index += 2;
      continue;
    }
    if (arg.startsWith("--changed") || arg.startsWith("--shard")) return true;
    index += 1;
  }
  return false;
}

function main(argv: readonly string[]): number {
  const { layer, forwarded } = parseWrapperArgs(argv);
  const reportPath = join(ROOT, ".vitest", `${layer}-report.json`);
  const subset = isSubsetRun(forwarded);

  const reporters = forwarded.some(
    (arg) => arg === "--reporter" || arg.startsWith("--reporter=") || arg.startsWith("--reporter."),
  )
    ? []
    : [`--reporter=${process.env.CI ? "dot" : "default"}`, "--reporter=json"];

  const result = spawnSync(
    // Node, not `process.execPath`: under Bun the setup file resolves the
    // `bun:test` globals branch and fails outside the Bun runner. The npm
    // scripts have always invoked Vitest through Node for this reason.
    "node",
    [VITEST_ENTRY, "run", ...reporters, `--outputFile=${reportPath}`, ...forwarded],
    { cwd: ROOT, stdio: "inherit" },
  );

  if (result.error) {
    console.error(`⚠️  Could not start Vitest (${result.error.message}).`);
    return 1;
  }

  const exitCode = result.status ?? 1;
  if (exitCode !== 0) return exitCode;

  if (subset) {
    console.log("ℹ️  Subset run — test-inventory ratchet skipped (full suite required).");
    return 0;
  }

  const inventory = spawnSync(
    "bun",
    [INVENTORY_SCRIPT, `--layer=${layer}`, `--report=${reportPath}`],
    { cwd: ROOT, stdio: "inherit" },
  );

  if (inventory.error) {
    console.error(`⚠️  Could not run the test-inventory check (${inventory.error.message}).`);
    return 1;
  }
  return inventory.status ?? 1;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
