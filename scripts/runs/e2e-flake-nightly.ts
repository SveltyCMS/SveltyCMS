#!/usr/bin/env bun
/**
 * @file scripts/runs/e2e-flake-nightly.ts
 * @description Run the newest E2E specs repeatedly to surface host-contention flakes.
 *
 * A single E2E run cannot distinguish a real flake from a one-off. This probe
 * picks the N most recently modified spec files under `tests/e2e` (by last commit
 * time) and reruns them with `--repeat-each`, so an unstable test surfaces as
 * `flaky` (a repeat that needed the retry) or `failed` in the JSON report
 * instead of hiding behind a single green run.
 *
 * Usage:
 *   bun run scripts/runs/e2e-flake-nightly.ts              # probe 20 newest specs
 *   bun run scripts/runs/e2e-flake-nightly.ts --list       # print the selection, no run
 *   bun run scripts/runs/e2e-flake-nightly.ts --count=8
 *   bun run scripts/runs/e2e-flake-nightly.ts --repeat-each=5
 *
 * Features:
 * - selection = `git log -1 --format=%ct -- <file>` desc, path asc as tie-break
 * - untracked specs fall back to filesystem mtime (a brand-new spec is newest)
 * - `--list` writes only spec paths to stdout (pipe-friendly); diagnostics to stderr
 * - delegates to `scripts/runs/run-e2e.ts --no-build` so wizard → auth-setup →
 *   chromium project wiring and CI env parity are inherited, not duplicated
 * - propagates the Playwright exit code
 */

import { spawn, spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname =
  typeof import.meta.dirname !== "undefined"
    ? import.meta.dirname
    : dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const E2E_DIR = join(ROOT, "tests", "e2e");
const RUN_E2E = join(ROOT, "scripts", "runs", "run-e2e.ts");

const DEFAULT_COUNT = 20;
const DEFAULT_REPEAT_EACH = 3;

interface SpecFile {
  path: string;
  updatedAt: number;
}

function arg(name: string, fallback = ""): string {
  const hit = process.argv.find((item) => item.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function numberArg(name: string, fallback: number): number {
  const value = Number.parseInt(arg(name, String(fallback)), 10);
  return Number.isFinite(value) ? value : fallback;
}

function toPosix(path: string): string {
  return path.split(sep).join("/");
}

function collectSpecs(directory: string): string[] {
  const found: string[] = [];
  const pending: string[] = [directory];

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;

    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) pending.push(full);
      else if (entry.isFile() && entry.name.endsWith(".spec.ts")) found.push(full);
    }
  }

  return found;
}

/** Last commit time (seconds) for a repo-relative path, or null when untracked. */
function lastCommitSeconds(repoPath: string): number | null {
  const result = spawnSync("git", ["log", "-1", "--format=%ct", "--", repoPath], {
    cwd: ROOT,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) return null;

  const raw = (result.stdout ?? "").trim();
  if (!raw) return null;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function mtimeSeconds(fullPath: string): number {
  try {
    return Math.floor(statSync(fullPath).mtimeMs / 1000);
  } catch {
    return 0;
  }
}

function selectSpecs(count: number): SpecFile[] {
  const specs = collectSpecs(E2E_DIR).map((full) => {
    const path = toPosix(relative(ROOT, full));
    return { path, updatedAt: lastCommitSeconds(path) ?? mtimeSeconds(full) };
  });

  specs.sort((a, b) => {
    if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
    if (a.path < b.path) return -1;
    if (a.path > b.path) return 1;
    return 0;
  });

  return specs.slice(0, Math.max(0, count));
}

function describe(selected: SpecFile[]): void {
  const when = (seconds: number) => new Date(seconds * 1000).toISOString();
  console.error(`[flake-nightly] ${selected.length} spec(s), newest first:`);
  for (const spec of selected) {
    console.error(`  ${when(spec.updatedAt)}  ${spec.path}`);
  }
}

async function main(): Promise<number> {
  const count = numberArg("count", DEFAULT_COUNT);
  const repeatEach = Math.max(1, numberArg("repeat-each", DEFAULT_REPEAT_EACH));
  const selected = selectSpecs(count);

  if (selected.length === 0) {
    console.error(`[flake-nightly] no *.spec.ts files found under ${E2E_DIR}`);
    return 1;
  }

  if (hasFlag("list")) {
    describe(selected);
    for (const spec of selected) console.log(spec.path);
    return 0;
  }

  describe(selected);

  const forwarded = [
    "--no-build",
    `--repeat-each=${repeatEach}`,
    ...selected.map((spec) => spec.path),
  ];

  console.error(`[flake-nightly] bun run scripts/runs/run-e2e.ts ${forwarded.join(" ")}\n`);

  const exitCode = await new Promise<number>((resolvePromise) => {
    const child = spawn(process.execPath, ["run", RUN_E2E, ...forwarded], {
      cwd: ROOT,
      stdio: "inherit",
      env: process.env,
      windowsHide: true,
    });
    child.on("close", (code) => resolvePromise(code ?? 1));
    child.on("error", (error) => {
      console.error("[flake-nightly] failed to start run-e2e:", error);
      resolvePromise(1);
    });
  });

  return exitCode;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error("[flake-nightly] crashed:", error);
    process.exit(1);
  });
