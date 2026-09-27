#!/usr/bin/env bun
/**
 * @file scripts/git-safe.ts
 * @description Hardened Git wrapper + shared git utilities.
 *
 * ### CLI mode (git replacement):
 *   Blocks --no-verify on commit/push. Usage:
 *     bun run scripts/git-safe.ts commit -m "msg"
 *     bun run scripts/git-safe.ts push
 *     bun run scripts/git-safe.ts push --release[=auto|patch|minor|major]
 *
 * ### Library mode (imported by test-smart.ts):
 *   import { getChangedPaths, resolveDiffBase } from "./git-safe";
 *
 * ### Features:
 * - blocks --no-verify on commit and push
 * - `push --release` arms the post-gate SemVer bump in the pre-push hook
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
      // No shell: array args must reach git verbatim (shell: true on Windows
      // joins them unquoted, word-splitting -m "multi word message").
      shell: false,
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

const RELEASE_KINDS = ["auto", "patch", "minor", "major"] as const;
export type ReleaseKind = (typeof RELEASE_KINDS)[number];

/**
 * Splits `--release[=kind]` out of a `git push` argv. git has no such flag, so
 * the wrapper consumes it and exports `SVELTY_RELEASE` for the pre-push hook
 * instead — git never forwards hook arguments, but every hook inherits the
 * environment of the git process that spawned it.
 * Throws on an unknown kind so a typo cannot quietly arm the default bump.
 * Exported for unit tests.
 */
export function extractReleaseRequest(argv: string[]): {
  args: string[];
  kind: ReleaseKind | null;
} {
  const index = argv.findIndex((arg) => arg === "--release" || arg.startsWith("--release="));
  if (index === -1) return { args: [...argv], kind: null };

  const flag = argv[index]!;
  const kind = flag.includes("=") ? flag.slice(flag.indexOf("=") + 1) : "auto";
  if (!(RELEASE_KINDS as readonly string[]).includes(kind)) {
    throw new Error(`--release=${kind} is not a bump kind (${RELEASE_KINDS.join("|")})`);
  }

  const args = [...argv];
  args.splice(index, 1);
  if (args.some((arg) => arg === "--release" || arg.startsWith("--release="))) {
    throw new Error("--release given more than once — pass a single bump kind");
  }
  return { args, kind: kind as ReleaseKind };
}

/** Consumes `--release` in place (args + environment) after reporting the arming. */
function armReleaseMode(args: string[]): void {
  let request: { args: string[]; kind: ReleaseKind | null };
  try {
    request = extractReleaseRequest(args);
  } catch (error) {
    console.error(`\n🛑 ${error instanceof Error ? error.message : String(error)}\n`);
    return process.exit(1);
  }
  if (!request.kind) return;

  args.length = 0;
  args.push(...request.args);
  process.env.SVELTY_RELEASE = request.kind;
  console.log(
    `\n🔖 Release mode armed (${request.kind}) — once the pre-push gate is green,\n` +
      `   scripts/version.ts writes the next SemVer version, the manifest is committed as\n` +
      `   \`chore(release): bump version to vX.Y.Z\` and the push that publishes it is printed.\n`,
  );
}

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

  if (subcommand === "push") {
    armReleaseMode(args);
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
    // No shell: preserves argument boundaries (see gitOutput note).
    shell: false,
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
