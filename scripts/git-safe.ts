#!/usr/bin/env bun
/**
 * @file scripts/git-safe.ts
 * @description Hardened Git wrapper + shared git utilities.
 *
 * ### CLI mode (git replacement):
 *   Blocks --no-verify on commit/push. Usage:
 *     bun run scripts/git-safe.ts commit -m "msg"
 *     bun run scripts/git-safe.ts push
 *
 * ### Library mode (imported by test-smart.ts):
 *   import { getChangedPaths, resolveDiffBase } from "./git-safe";
 *
 * ### Features:
 * - blocks --no-verify on commit and push
 * - provides git utility functions for change detection
 * - passes through all other git commands untouched
 */

import { spawnSync } from "node:child_process";
import fs, { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const IS_WINDOWS = process.platform === "win32";

// ── Shared git utilities (library mode) ──────────────────────────

export function gitOutput(args: string[]): string {
  try {
    const result = spawnSync("git", args, {
      encoding: "utf8" as const,
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      shell: IS_WINDOWS,
    });
    return (result.stdout || "").trim();
  } catch {
    return "";
  }
}

export function gitRefExists(ref: string): boolean {
  const result = spawnSync("git", ["show-ref", "--verify", "--quiet", ref], {
    cwd: process.cwd(),
    stdio: "ignore",
    shell: IS_WINDOWS,
  });
  return result.status === 0;
}

export function resolveDiffBase(): string {
  const upstream = gitOutput(["rev-parse", "--abbrev-ref", "@{upstream}"]).trim();
  if (upstream && gitRefExists(upstream)) return upstream;
  for (const ref of ["origin/next", "next", "origin/main", "main"]) {
    if (gitRefExists(ref)) return ref;
  }
  return "HEAD~1";
}

export function getChangedPaths(): string[] {
  try {
    const base = resolveDiffBase();
    const files = new Set<string>();
    const baseDiff = gitOutput(["diff", "--name-only", `${base}...HEAD`]);
    if (baseDiff) {
      for (const line of baseDiff.split("\n")) {
        if (line.trim()) files.add(line.trim().replace(/\\/g, "/"));
      }
    }
    const unstagedDiff = gitOutput(["diff", "--name-only"]);
    if (unstagedDiff) {
      for (const line of unstagedDiff.split("\n")) {
        if (line.trim()) files.add(line.trim().replace(/\\/g, "/"));
      }
    }
    const statusPorcelain = gitOutput(["status", "--porcelain"]);
    if (statusPorcelain) {
      for (const line of statusPorcelain.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("?? ")) {
          files.add(trimmed.slice(3).replace(/\\/g, "/"));
        } else if (trimmed && !trimmed.includes("->")) {
          const parts = trimmed.split(/\s+/);
          if (parts.length >= 2) {
            files.add(parts[parts.length - 1].replace(/\\/g, "/"));
          }
        }
      }
    }
    return [...files].filter((f) => existsSync(f));
  } catch {
    return [];
  }
}

// ── CLI mode (git replacement) ──────────────────────────────────

const PROTECTED_COMMANDS = new Set(["commit", "push"]);
const BLOCKED_FLAGS = ["--no-verify", "-n"];

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    runGit([]);
    return;
  }

  const subcommand = args[0];

  if (subcommand === "install-alias") {
    installGitSafeAlias();
    return;
  }

  if (PROTECTED_COMMANDS.has(subcommand)) {
    const remainingArgs = args.slice(1);

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
        console.error("║    • Security regressions                                    ║");
        console.error("║                                                              ║");
        console.error("║  If the gate is failing, FIX the issue — don't bypass it.   ║");
        console.error("║                                                              ║");
        if (subcommand === "commit") {
          console.error("║  Run: git commit (the hooks will auto-fix formatting)        ║");
        }
        if (subcommand === "push") {
          console.error("║  Run: git push (pre-push builds + audits automatically)      ║");
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
  if (result.status !== 0) process.exit(result.status ?? 1);
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
        if (!existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });
        let existing = "";
        if (existsSync(profilePath)) existing = readFileSync(profilePath, "utf8");
        if (existing.includes(scriptPath)) {
          console.log(`✅ git-safe alias already present in PowerShell profile: ${profilePath}`);
        } else {
          writeFileSync(profilePath, existing + psFunction);
          console.log(`\n✅ Added git-safe alias to PowerShell profile: ${profilePath}`);
          console.log(`ℹ️  Reload: . $PROFILE\n`);
        }
        return;
      }
    } catch (e) {
      console.error("❌ Failed to resolve PowerShell profile:", e);
    }
  }
  const home = homedir();
  for (const rc of [".zshrc", ".bashrc", ".bash_profile"].map((f) => path.join(home, f))) {
    if (existsSync(rc)) {
      let content = readFileSync(rc, "utf8");
      const line = `\nalias git='bun run "${scriptPath}"'\n`;
      if (content.includes(scriptPath)) {
        console.log(`✅ git-safe alias already present in ${rc}`);
      } else {
        writeFileSync(rc, content + line);
        console.log(`✅ Added git-safe alias to ${rc}`);
      }
    }
  }
}

if (import.meta.main) main();
