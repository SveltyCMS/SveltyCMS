/**
 * @file scripts/check/check-svelte-diagnostics.ts
 * @description Fail the quality gate on svelte-check **warnings**, not just errors.
 *
 * `svelte-check --threshold warning` only widens what is *printed* — the process
 * still exits 0 (verified on 2026-10-23), so `bun run check` used to pass while
 * the editor diagnostics panel listed 10 `state_referenced_locally` warnings.
 * This runs the machine reporter and exits 1 for either severity, so the gate and
 * the editor agree.
 *
 * ### Features:
 * - One `file:line:col — message` line per finding
 * - Fails on warnings as well as errors
 * - Preserves a real crash/tool failure (no parsed diagnostics + non-zero exit)
 */

import { spawnSync } from "node:child_process";

const BIN = "node_modules/svelte-check/bin/svelte-check";

const result = spawnSync("node", [BIN, "--tsconfig", "./tsconfig.json", "--output", "machine"], {
  encoding: "utf8",
});

const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;

/** Machine reporter: `<ts> ERROR "file" line:col "message"` (message may contain \n). */
const DIAGNOSTIC = /^\d+ (ERROR|WARNING) "([^"]+)" (\d+:\d+) "(.*)"$/;

const findings: string[] = [];
for (const line of output.split(/\r?\n/)) {
  const match = DIAGNOSTIC.exec(line);
  if (!match) continue;
  const summary = match[4].split("\\n")[0].trim();
  findings.push(`  ${match[1]} ${match[2]}:${match[3]} — ${summary}`);
}

if (findings.length > 0) {
  console.error(`svelte-check found ${findings.length} diagnostic(s):`);
  console.error(findings.join("\n"));
  console.error("\nWarnings are gated: fix them or make the intent explicit (e.g. `untrack`).");
  process.exit(1);
}

// No parsable diagnostics but the tool exited non-zero → a real failure, not a clean run.
if (result.status !== 0) {
  console.error(output.trim() || `svelte-check exited with ${result.status}`);
  process.exit(result.status ?? 1);
}

console.log("svelte-check: 0 errors, 0 warnings");
