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
import fs, { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

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

  if (subcommand === "install-alias") {
    installGitSafeAlias();
    return;
  }

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
          console.error("║    bun run verify:push                                       ║");
          console.error("║    bun run scripts/precheck.ts --plan     (dry-run)          ║");
          console.error("║                                                              ║");
        }
        console.error("║  True emergency? Use raw system git with --no-verify:       ║");
        const rawPath = IS_WINDOWS ? "git.exe" : "/usr/bin/git";
        console.error(`║    ${rawPath} ${subcommand} --no-verify ...                  ║`);
        console.error("║  This bypass is logged and will be visible in your shell.    ║");
        console.error("║                                                              ║");
        console.error("╚══════════════════════════════════════════════════════════════╝");
        console.error("");
        process.exit(1);
      }
    }

    // Warn if hooks might not be configured (commit and push)
    if (subcommand === "commit" || subcommand === "push") {
      const hookPath = checkHooksConfig();
      if (!hookPath) {
        console.error("");
        console.error("⚠️  Git hooks path is not set to .githooks/");
        console.error("   Run: git config core.hooksPath .githooks");
        console.error("");
        console.error("   Without this, pre-commit and pre-push checks won't run.");
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

function installGitSafeAlias() {
  const scriptPath = path.resolve(process.argv[1]);

  if (IS_WINDOWS) {
    try {
      const psResult = spawnSync("powershell", ["-Command", "Write-Output $PROFILE"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      const profilePath = psResult.stdout?.trim();
      if (profilePath) {
        const psFunction = `\nfunction git { & bun run "${scriptPath}" @args }\n`;
        const profileDir = path.dirname(profilePath);
        if (!existsSync(profileDir)) {
          fs.mkdirSync(profileDir, { recursive: true });
        }
        let existing = "";
        if (existsSync(profilePath)) {
          existing = readFileSync(profilePath, "utf8");
        }
        if (existing.includes(scriptPath)) {
          console.log(
            `✅ git-safe alias function is already present in your PowerShell profile: ${profilePath}`,
          );
        } else {
          writeFileSync(profilePath, existing + psFunction);
          console.log(
            `\n✅ Successfully added git-safe alias function to your PowerShell profile: ${profilePath}`,
          );
          console.log(`ℹ️  Please reload your shell or run: . $PROFILE\n`);
        }
        return;
      }
    } catch (e) {
      console.error("❌ Failed to resolve PowerShell profile path:", e);
    }
  }

  const home = homedir();
  const rcFiles = [".zshrc", ".bashrc", ".bash_profile"].map((f) => path.join(home, f));
  let modified = false;

  for (const rcPath of rcFiles) {
    if (existsSync(rcPath)) {
      let content = readFileSync(rcPath, "utf8");
      const aliasLine = `\nalias git='bun run "${scriptPath}"'\n`;
      if (content.includes(scriptPath)) {
        console.log(`✅ git-safe alias is already present in ${rcPath}`);
        modified = true;
        continue;
      }
      writeFileSync(rcPath, content + aliasLine);
      console.log(`✅ Successfully added git-safe alias to ${rcPath}`);
      modified = true;
    }
  }

  if (modified) {
    console.log(`ℹ️  Please reload your shell or run: source ~/.bashrc (or ~/.zshrc)`);
  } else {
    console.log(
      `❌ Could not locate a shell config file (.bashrc, .zshrc, or PowerShell profile).`,
    );
    console.log(`ℹ️  You can manually add: alias git='bun run "${scriptPath}"'`);
  }
}

main();
