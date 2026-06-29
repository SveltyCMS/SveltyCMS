/**
 * @file scripts/upgrade.ts
 * @description SveltyCMS Enhanced Upgrade CLI
 *
 * Automates fetching updates, merging changes, running codemods,
 * and ensuring environment consistency.
 *
 * ### Flags
 * | Flag                  | Description                                          |
 * |-----------------------|------------------------------------------------------|
 * | --dry-run             | Print what would happen, make no changes             |
 * | --skip-tests          | Skip unit tests after upgrade                        |
 * | --skip-benchmarks     | Skip benchmark matrix after upgrade                  |
 * | --skip-db             | Skip database migration step                         |
 * | --skip-merge          | Skip fetch+merge (resume after manual conflict fix)  |
 * | --force               | Continue even with uncommitted changes (auto-stash)  |
 * | --branch=<name>       | Upstream branch to merge from (default: next)        |
 */

import { spawn, type SpawnOptions } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Self-contained ANSI colour helpers (no project imports — works mid-upgrade)
// ---------------------------------------------------------------------------

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: (s: string) => `\x1b[31m${s}${ANSI.reset}`,
  green: (s: string) => `\x1b[32m${s}${ANSI.reset}`,
  yellow: (s: string) => `\x1b[33m${s}${ANSI.reset}`,
  blue: (s: string) => `\x1b[34m${s}${ANSI.reset}`,
  cyan: (s: string) => `\x1b[36m${s}${ANSI.reset}`,
};

const pc = {
  bold: (s: string) => `${ANSI.bold}${s}${ANSI.reset}`,
  dim: (s: string) => `${ANSI.dim}${s}${ANSI.reset}`,
  red: ANSI.red,
  green: ANSI.green,
  yellow: ANSI.yellow,
  blue: ANSI.blue,
  cyan: ANSI.cyan,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_BRANCH = "next";
const UPSTREAM_URL = "https://github.com/SveltyCMS/SveltyCMS.git";

/**
 * Allowlist for branch names.
 * Prevents command injection via --branch=.
 */
const BRANCH_PATTERN = /^[a-zA-Z0-9._/-]{1,100}$/;

// ---------------------------------------------------------------------------
// CLI option parsing
// ---------------------------------------------------------------------------

interface UpgradeOptions {
  dryRun: boolean;
  skipTests: boolean;
  skipBenchmarks: boolean;
  skipDb: boolean;
  skipMerge: boolean;
  force: boolean;
  branch: string;
}

function parseOptions(): UpgradeOptions {
  const rawBranch =
    process.argv.find((a) => a.startsWith("--branch="))?.split("=")[1] ?? DEFAULT_BRANCH;

  if (!BRANCH_PATTERN.test(rawBranch)) {
    console.error(
      pc.red(
        `❌ Invalid --branch value: "${rawBranch}". ` +
          `Only alphanumerics, dots, hyphens, underscores, and forward slashes are allowed.`,
      ),
    );
    process.exit(1);
  }

  return {
    dryRun: process.argv.includes("--dry-run"),
    skipTests: process.argv.includes("--skip-tests"),
    skipBenchmarks: process.argv.includes("--skip-benchmarks"),
    skipDb: process.argv.includes("--skip-db"),
    skipMerge: process.argv.includes("--skip-merge"),
    force: process.argv.includes("--force"),
    branch: rawBranch,
  };
}

const cli = parseOptions();

// ---------------------------------------------------------------------------
// runCommand — no shell, proper error handling
// ---------------------------------------------------------------------------

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

interface RunOpts {
  /**
   * When true, capture stdout/stderr into the returned RunResult strings.
   * Output is also teed to the parent process unless silent is also set.
   */
  capture?: boolean;
  /** Suppress all output (implies capture internally). */
  silent?: boolean;
  /** Working directory for the child process. */
  cwd?: string;
}

/**
 * Spawns a command **without a shell**, eliminating injection risk.
 * Each argument is passed as a discrete array entry — never concatenated.
 *
 * Rejects if the process cannot be spawned (e.g. command not found).
 */
function runCommand(command: string, args: string[], runOpts: RunOpts = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const spawnOpts: SpawnOptions = {
      shell: false,
      stdio: runOpts.capture || runOpts.silent ? "pipe" : "inherit",
      cwd: runOpts.cwd ?? process.cwd(),
    };

    const proc = spawn(command, args, spawnOpts);

    let stdout = "";
    let stderr = "";

    if (proc.stdout)
      proc.stdout.on("data", (d: Buffer) => {
        stdout += d.toString();
        if (runOpts.capture && !runOpts.silent) process.stdout.write(d);
      });

    if (proc.stderr)
      proc.stderr.on("data", (d: Buffer) => {
        stderr += d.toString();
        if (runOpts.capture && !runOpts.silent) process.stderr.write(d);
      });

    proc.on("error", (err) => reject(new Error(`Failed to spawn "${command}": ${err.message}`)));

    proc.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

/** Runs a command and throws if it exits with a non-zero code. */
async function mustRun(
  command: string,
  args: string[],
  label: string,
  runOpts: RunOpts = {},
): Promise<RunResult> {
  const result = await runCommand(command, args, runOpts);
  if (result.code !== 0) {
    throw new UpgradeError(
      `${label} exited with code ${result.code}.`,
      result.stderr || result.stdout,
    );
  }
  return result;
}

// ---------------------------------------------------------------------------
// Structured error
// ---------------------------------------------------------------------------

class UpgradeError extends Error {
  constructor(
    message: string,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = "UpgradeError";
  }
}

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

async function assertGitRepo(): Promise<void> {
  if (!existsSync(join(process.cwd(), ".git"))) {
    throw new UpgradeError("Not a git repository. Run this script from the project root.");
  }
}

async function isGitDirty(): Promise<boolean> {
  const { stdout } = await mustRun("git", ["status", "--porcelain"], "git status", {
    capture: true,
    silent: true,
  });
  return stdout.trim().length > 0;
}

/** Returns the name of the remote that points at UPSTREAM_URL, adding it if absent. */
async function ensureRemote(): Promise<string> {
  // Use runCommand (not mustRun) — remote-not-found is expected, not an error
  const remoteResult = await runCommand(
    "git",
    ["remote", "get-url", "--all", "--push", "upstream"],
    {
      capture: true,
      silent: true,
    },
  );

  if (remoteResult.stdout.trim().includes(UPSTREAM_URL)) {
    return "upstream";
  }

  // Check if any remote (by any name) already points at the upstream URL.
  const { stdout: allRemotes } = await mustRun("git", ["remote", "-v"], "git remote -v", {
    capture: true,
    silent: true,
  });

  for (const line of allRemotes.split("\n")) {
    if (line.includes(UPSTREAM_URL) && line.includes("(fetch)")) {
      const name = line.split(/\s+/)[0];
      if (name) {
        log("info", `Using existing remote "${name}" for upstream.`);
        return name;
      }
    }
  }

  log("info", `Adding remote "upstream" → ${UPSTREAM_URL}`);
  if (!cli.dryRun) {
    await mustRun("git", ["remote", "add", "upstream", UPSTREAM_URL], "git remote add");
  }
  return "upstream";
}

/**
 * Creates a timestamped git tag as a rollback point before the merge.
 * Tag is local only — not pushed to any remote.
 */
async function createRollbackTag(): Promise<string> {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const tag = `pre-upgrade-${ts}`;

  if (!cli.dryRun) {
    await mustRun("git", ["tag", tag], "create rollback tag");
  }
  return tag;
}

/**
 * Detects whether the working tree has conflict markers after a merge attempt.
 */
async function hasConflicts(): Promise<boolean> {
  const { stdout } = await mustRun(
    "git",
    ["diff", "--name-only", "--diff-filter=U"],
    "git diff --diff-filter=U",
    { capture: true, silent: true },
  );
  return stdout.trim().length > 0;
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

type LogLevel = "info" | "warn" | "error" | "step" | "dry";

function log(level: LogLevel, message: string): void {
  const prefix: Record<LogLevel, string> = {
    step: pc.blue("▶"),
    info: pc.dim("  •"),
    warn: pc.yellow("⚠️ "),
    error: pc.red("❌"),
    dry: pc.yellow("  [Dry Run]"),
  };
  console.log(`${prefix[level]} ${message}`);
}

function dryLog(would: string): void {
  log("dry", `Would run: ${pc.cyan(would)}`);
}

function step(title: string): void {
  console.log();
  console.log(pc.bold(pc.blue(`▶ ${title}`)));
}

// ---------------------------------------------------------------------------
// Codemods
// ---------------------------------------------------------------------------

async function runCodemods(): Promise<void> {
  const codemodsDir = join(process.cwd(), "scripts", "codemods");
  if (!existsSync(codemodsDir)) return;

  const files = readdirSync(codemodsDir)
    .filter((f) => (f.endsWith(".ts") || f.endsWith(".js")) && !f.startsWith("_"))
    .sort();

  if (files.length === 0) return;

  step("Running codemods");

  for (const file of files) {
    const filePath = join(codemodsDir, file);
    log("info", `Executing ${file}…`);

    if (cli.dryRun) {
      dryLog(`bun ${filePath}`);
      continue;
    }

    await mustRun("bun", [filePath], `codemod ${file}`);
    log("info", `${pc.green("✓")} ${file}`);
  }
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

async function stepFetchAndMerge(remote: string, rollbackTag: string): Promise<void> {
  step(`Fetching updates from ${remote}/${cli.branch}`);

  if (cli.dryRun) {
    dryLog(`git fetch ${remote} ${cli.branch}`);
    dryLog(`git merge ${remote}/${cli.branch} --no-ff --no-commit`);
    return;
  }

  await mustRun("git", ["fetch", remote, cli.branch], "git fetch");

  log("info", "Merging (--no-ff --no-commit)…");
  const mergeResult = await runCommand("git", [
    "merge",
    `${remote}/${cli.branch}`,
    "--no-ff",
    "--no-commit",
  ]);

  // Check for actual conflicts first — non-zero exit can mean conflicts OR
  // fast-forwards OR unexpected git errors. Only treat conflicts as recovery.
  if (mergeResult.code !== 0) {
    if (await hasConflicts()) {
      console.log();
      console.log(pc.yellow("⚠️  Merge conflicts detected. Resolve them, then continue:"));
      console.log(pc.cyan(`  1.  Resolve conflicts in your editor`));
      console.log(pc.cyan(`  2.  git add .`));
      console.log(pc.cyan(`  3.  bun install`));
      console.log(pc.cyan(`  4.  bun run scripts/upgrade.ts --skip-merge`));
      console.log();
      console.log(pc.dim(`  To abort entirely: git merge --abort && git tag -d ${rollbackTag}`));
      throw new UpgradeError("Merge conflict — manual resolution required.");
    }

    // Non-conflict merge failure — internal git error, unexpected state
    throw new UpgradeError(
      `Merge failed unexpectedly (exit ${mergeResult.code}).`,
      mergeResult.stderr,
    );
  }
}

async function stepInstall(): Promise<void> {
  step("Updating dependencies");

  if (cli.dryRun) {
    dryLog("bun install");
    return;
  }

  await mustRun("bun", ["install"], "bun install");
}

async function stepDbMigration(): Promise<void> {
  step("Running database migrations");

  if (cli.dryRun) {
    dryLog("bun run db:push");
    return;
  }

  await mustRun("bun", ["run", "db:push"], "db:push");
}

async function stepTests(): Promise<void> {
  step("Running unit tests");

  if (cli.dryRun) {
    dryLog("bun run test:unit");
    return;
  }

  await mustRun("bun", ["run", "test:unit"], "unit tests");
}

async function stepBenchmarks(): Promise<void> {
  step("Running performance benchmarks (Enterprise Matrix)");

  if (cli.dryRun) {
    dryLog("bun run scripts/benchmark-matrix/index.ts --no-build");
    return;
  }

  await mustRun(
    "bun",
    ["run", "scripts/benchmark-matrix/index.ts", "--no-build"],
    "enterprise benchmarks",
  );
}

// ---------------------------------------------------------------------------
// Stash management (--force with dirty tree)
// ---------------------------------------------------------------------------

interface StashResult {
  stashed: boolean;
  label: string;
}

async function stashChanges(): Promise<StashResult> {
  const label = `upgrade-stash-${Date.now()}`;
  const { code } = await runCommand("git", ["stash", "push", "--include-untracked", "-m", label]);

  if (code !== 0) {
    throw new UpgradeError("Failed to stash working changes before upgrade.");
  }

  return { stashed: true, label };
}

async function popStash(label: string): Promise<void> {
  // Find the stash reference by label — git stash pop always pops stash@{0},
  // which is wrong if another stash was pushed between stash and pop.
  const { stdout } = await runCommand("git", ["stash", "list", "--format=%gd %gs"], {
    capture: true,
    silent: true,
  });

  const entry = stdout.split("\n").find((l) => l.includes(label));
  const ref = entry?.match(/^(stash@\{\d+\})/)?.[1] ?? "stash@{0}";

  await mustRun("git", ["stash", "pop", ref], "git stash pop");
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(pc.bold(pc.blue("\n🚀 SveltyCMS Upgrade Tool")));
  console.log(pc.dim("────────────────────────────────────────"));

  if (cli.dryRun) {
    console.log(pc.yellow("⚠️  DRY RUN — no changes will be made\n"));
  }

  await assertGitRepo();

  // --- Dirty working tree check ---
  const dirty = await isGitDirty();
  let stashResult: StashResult | null = null;

  if (dirty) {
    if (cli.force) {
      log("warn", "Working tree has uncommitted changes. Stashing them before upgrade…");
      if (!cli.dryRun) {
        stashResult = await stashChanges();
        log("info", "Changes stashed. They will be restored when the upgrade completes.");
      }
    } else {
      throw new UpgradeError(
        "Uncommitted changes detected.",
        "Commit or stash them, or use --force to auto-stash.",
      );
    }
  }

  // Declare rollbackTag outside try so it's accessible in the final summary
  let rollbackTag = "(dry-run — no tag created)";

  try {
    if (!cli.skipMerge) {
      const remote = await ensureRemote();

      step("Creating rollback tag");
      rollbackTag = await createRollbackTag();
      log("info", `Rollback tag: ${pc.cyan(rollbackTag)} (local only)`);
      log("info", `To roll back: ${pc.dim(`git reset --hard ${rollbackTag}`)}`);

      await stepFetchAndMerge(remote, rollbackTag);
    } else {
      log("info", "Skipping fetch and merge (--skip-merge).");
    }

    await stepInstall();
    await runCodemods();

    if (!cli.skipDb) await stepDbMigration();
    if (!cli.skipTests) await stepTests();
    if (!cli.skipBenchmarks) await stepBenchmarks();
  } finally {
    // Always restore stashed changes, even if a later step threw.
    if (stashResult?.stashed && !cli.dryRun) {
      log("info", "Restoring stashed changes…");
      await popStash(stashResult.label).catch((err) => {
        log("warn", `Failed to pop stash automatically: ${(err as Error).message}`);
        log("warn", `Restore manually with: git stash pop`);
      });
    }
  }

  console.log();
  console.log(pc.dim("────────────────────────────────────────"));
  if (cli.dryRun) {
    console.log(pc.green("✅ Dry run complete — no changes made."));
  } else {
    console.log(pc.green("✅ Upgrade complete! Review your changes and commit."));
    console.log(pc.dim(`   To undo: git reset --hard ${rollbackTag}`));
  }
}

main().catch((err) => {
  console.log();
  if (err instanceof UpgradeError) {
    log("error", err.message);
    if (err.detail) console.log(pc.dim(`  ${err.detail}`));
  } else {
    log("error", `Unexpected error: ${(err as Error).message}`);
    if (process.env.DEBUG) console.error(err);
  }
  process.exit(1);
});
