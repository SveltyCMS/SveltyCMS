#!/usr/bin/env bun
/**
 * @file scripts/git-safe.ts
 * @description Hardened Git wrapper that prevents bypassing the quality gate pipeline.
 *
 * SveltyCMS uses a tiered validation pipeline (pre-commit → pre-push → CI).
 * Standard `git --no-verify` trivially bypasses all client-side hooks. This
 * wrapper enforces policy by rejecting `--no-verify` and guiding developers
 * through the correct workflow.
 *
 * ### What it blocks:
 * - `git commit --no-verify` / `git push --no-verify`
 * - Any `--no-verify` flag on commit or push subcommands
 *
 * ### Usage (instead of raw git):
 *   bun run scripts/git-safe.ts commit -m "message"
 *   bun run scripts/git-safe.ts push
 *
 * ### Shell alias (add to ~/.bashrc, ~/.zshrc, or PowerShell profile):
 *   alias git='bun run scripts/git-safe.ts'   # full replacement
 *   alias gs='bun run scripts/git-safe.ts'     # side-by-side
 *
 * ### Features:
 * - blocks --no-verify on commit and push
 * - passes through all other git commands untouched
 * - provides clear guidance on fixing validation failures
 */

import { spawnSync } from "node:child_process";

const IS_WINDOWS = process.platform === "win32";

// Commands we enforce policy on
const PROTECTED_COMMANDS = new Set(["commit", "push"]);

// Flags we block
const BLOCKED_FLAGS = ["--no-verify", "-n"];

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    // No args → just pass through to git (shows git help)
    runGit([]);
    return;
  }

  const subcommand = args[0];

  // Only enforce policy on protected commands
  if (PROTECTED_COMMANDS.has(subcommand)) {
    const remainingArgs = args.slice(1);

    // Check for blocked flags
    for (const flag of BLOCKED_FLAGS) {
      if (remainingArgs.includes(flag)) {
        console.error("");
        console.error("╔══════════════════════════════════════════════════════════════╗");
        console.error("║  🛑  --no-verify is blocked by project policy               ║");
        console.error("╠══════════════════════════════════════════════════════════════╣");
        console.error("║                                                              ║");
        console.error("║  The SveltyCMS quality gate pipeline exists to catch:        ║");
        console.error("║    • Formatting violations                                   ║");
        console.error("║    • Type errors before they reach CI                        ║");
        console.error("║    • Broken unit tests                                       ║");
        console.error("║    • Missing AdminPageShell / legacy class usage             ║");
        console.error("║    • Documentation lint issues                               ║");
        console.error("║                                                              ║");
        console.error("║  If the gate is failing, FIX the issue — don't bypass it.   ║");
        console.error("║                                                              ║");
        if (subcommand === "commit") {
          console.error("║  Pre-commit fails? Run:                                      ║");
          console.error("║    bun run format && bun run lint                            ║");
          console.error("║                                                              ║");
        }
        if (subcommand === "push") {
          console.error("║  Pre-push fails? Run the full gate locally:                  ║");
          console.error("║    bun run scripts/quality-gate.ts                           ║");
          console.error("║                                                              ║");
        }
        console.error("║  True emergency? Use raw git with --no-verify (explicit):    ║");
        console.error("║    /usr/bin/git " + subcommand + " --no-verify ...           ║");
        console.error("║  This bypass is logged and will be visible in your shell.    ║");
        console.error("║                                                              ║");
        console.error("╚══════════════════════════════════════════════════════════════╝");
        console.error("");
        process.exit(1);
      }
    }

    // Warn if hooks might not be configured
    if (subcommand === "commit") {
      const hookPath = checkHooksConfig();
      if (!hookPath) {
        console.error("");
        console.error("⚠️  Git hooks path is not set to .githooks/");
        console.error("   Run: git config core.hooksPath .githooks");
        console.error("");
        console.error("   Without this, pre-commit checks won't run.");
        console.error("   Continuing anyway (CI will catch issues)...");
        console.error("");
      }
    }
  }

  // Pass through to real git
  runGit(args);
}

function checkHooksConfig(): string | null {
  try {
    const result = spawnSync("git", ["config", "core.hooksPath"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      shell: IS_WINDOWS,
    });
    return result.stdout?.trim() || null;
  } catch {
    return null;
  }
}

function runGit(args: string[]) {
  const result = spawnSync("git", args, {
    stdio: "inherit",
    shell: IS_WINDOWS,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

main();
