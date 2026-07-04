/**
 * @file scripts/test-smart.ts
 * @description Smart Test Orchestrator — reads git diff and selects required test suites.
 *
 * ### The Three Gates
 *
 * Gate 1 — White-Box Unit:
 *   Shared deterministic harness. No ad-hoc mocks. Every bug fix adds a regression test.
 *
 * Gate 2 — Black-Box Integration:
 *   Real HTTP against SQLite. Identical adapter behavior. Unknown namespaces → 403.
 *
 * Gate 4 — Playwright E2E:
 *   Single canonical seeder. Semantic selectors only. No arbitrary waits.
 *
 * Note: Type check, lint, and slop scan are handled by the pre-commit hook
 * (gates 1 & 3), not by this orchestrator.
 *
 * ### Failure Policy
 * Flaky means unstable core. No "retry until green." Every failure must be root-caused.
 *
 * Usage:
 *   bun run scripts/test-smart.ts              # auto-detect from git diff
 *   bun run scripts/test-smart.ts --all        # run everything
 *   bun run scripts/test-smart.ts --suite=auth # run specific suite
 */

import { execSync } from "node:child_process";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Suite definitions — what to run when files change
// ---------------------------------------------------------------------------

interface SuiteRule {
  /** Glob patterns that trigger this suite */
  patterns: string[];
  /** Test command to execute */
  command: string;
  /** Human-readable label */
  label: string;
  /** Gate number (1-4) */
  gate: number;
}

const SUITE_RULES: SuiteRule[] = [
  // ── Gate 1: White-Box Unit ──────────────────────────────────────────────
  {
    label: "Auth & Security",
    gate: 1,
    patterns: [
      "src/routes/api/auth/**",
      "src/databases/auth/**",
      "src/hooks/handle-authentication.ts",
      "src/routes/(app)/login/**",
    ],
    command:
      "bun test tests/unit/hooks/authentication.test.ts tests/unit/hooks/defense-in-depth.test.ts tests/unit/auth-lockout.test.ts",
  },
  {
    label: "Authorization & RBAC",
    gate: 1,
    patterns: [
      "src/hooks/handle-authorization.ts",
      "src/routes/api/[...path]/+server.ts",
      "src/services/permissions/**",
      "src/databases/auth/roles/**",
    ],
    command:
      "bun test tests/unit/hooks/authorization.test.ts tests/unit/role-permission-access.test.ts",
  },
  {
    label: "Middleware & Setup",
    gate: 1,
    patterns: [
      "src/hooks/handle-system-state.ts",
      "src/hooks/handle-setup.ts",
      "src/hooks/handle-firewall.ts",
      "src/hooks/handle-rate-limit.ts",
      "src/hooks/handle-locale.ts",
      "src/hooks/handle-theme.ts",
      "src/hooks/add-security-headers.ts",
    ],
    command:
      "bun test tests/unit/hooks/system-state.test.ts tests/unit/hooks/setup.test.ts tests/unit/hooks/security-headers.test.ts",
  },
  {
    label: "Database Adapters",
    gate: 1,
    patterns: [
      "src/databases/mongo/**",
      "src/databases/sqlite/**",
      "src/databases/postgresql/**",
      "src/databases/mariadb/**",
      "src/databases/db.ts",
      "src/databases/dbInterface.ts",
    ],
    command: "bun run test:integration -- db",
  },
  {
    label: "Stores & State",
    gate: 1,
    patterns: ["src/stores/**"],
    command: "bun test tests/unit/stores/",
  },
  {
    label: "Utilities",
    gate: 1,
    patterns: ["src/utils/**"],
    command: "bun test tests/unit/utils/",
  },
  {
    label: "Widgets",
    gate: 1,
    patterns: ["src/widgets/**"],
    command: "bun test tests/unit/widgets/",
  },
  // ── Gate 2: Black-Box Integration ───────────────────────────────────────
  {
    label: "API Integration (SQLite)",
    gate: 2,
    patterns: ["src/routes/api/**", "src/hooks/handle-api-requests.ts", "src/services/**"],
    command: "bun run test:integration -- api --db=sqlite",
  },
  // ── Gate 4: E2E ─────────────────────────────────────────────────────────
  {
    label: "E2E Wizard",
    gate: 4,
    patterns: [
      "src/routes/setup/**",
      "src/components/setup/**",
      "tests/e2e/routes/setup/setup-wizard.spec.ts",
    ],
    command: "npx playwright test tests/e2e/routes/setup/setup-wizard.spec.ts --project=wizard",
  },
  {
    label: "E2E Auth",
    gate: 4,
    patterns: ["src/routes/(app)/login/**", "src/routes/api/auth/**", "tests/e2e/auth.setup.ts"],
    command: "npx playwright test --project=auth-setup",
  },
];

// ---------------------------------------------------------------------------
// Fallback: when change scope is unknown, fail closed → run the full core
// ---------------------------------------------------------------------------

const FULL_CORE_SUITE: SuiteRule = {
  label: "Full Core Suite (fail-closed)",
  gate: 0,
  patterns: ["*"],
  command: "bun run test:unit && bun run test:integration -- api --db=sqlite && bun run slop",
};

// ---------------------------------------------------------------------------
// Git diff helpers
// ---------------------------------------------------------------------------

function getChangedFiles(baseBranch = "origin/next"): string[] {
  try {
    // Try to diff against the merge-base so we catch all changes in the branch
    const mergeBase = execSync(`git merge-base HEAD ${baseBranch}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();

    const diff = execSync(`git diff --name-only ${mergeBase} HEAD`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });

    return diff
      .split("\n")
      .map((f) => f.trim())
      .filter((f) => f.length > 0);
  } catch {
    // Fallback: diff against HEAD~1
    try {
      const diff = execSync("git diff --name-only HEAD~1 HEAD", {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      return diff
        .split("\n")
        .map((f) => f.trim())
        .filter((f) => f.length > 0);
    } catch {
      console.warn("⚠️  Could not determine git diff. Running full core suite.");
      return ["*"];
    }
  }
}

function matchesPattern(file: string, pattern: string): boolean {
  // Simple glob matching: convert ** → .* , * → [^/]*
  const regexStr = pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "§§GLOBSTAR§§")
    .replace(/\*/g, "[^/]*")
    .replace(/§§GLOBSTAR§§/g, ".*");
  return new RegExp(`^${regexStr}$`).test(file);
}

// ---------------------------------------------------------------------------
// Suite selection
// ---------------------------------------------------------------------------

interface SelectedSuite {
  rule: SuiteRule;
  matchingFiles: string[];
}

function selectSuites(changedFiles: string[]): SelectedSuite[] {
  const selected: SelectedSuite[] = [];
  const seen = new Set<string>();

  for (const rule of SUITE_RULES) {
    const matchingFiles = changedFiles.filter((f) =>
      rule.patterns.some((p) => matchesPattern(f, p)),
    );

    if (matchingFiles.length > 0 && !seen.has(rule.label)) {
      seen.add(rule.label);
      selected.push({ rule, matchingFiles });
    }
  }

  // If nothing matched and we have changed files → fail closed → full core
  if (selected.length === 0 && changedFiles.length > 0) {
    console.warn(
      "\n⚠️  No specific suite matched changed files. FAIL-CLOSED → running full core suite.\n",
    );
    selected.push({ rule: FULL_CORE_SUITE, matchingFiles: changedFiles });
  }

  return selected;
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

async function runCommand(cmd: string, cwd: string): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const { spawn } = require("node:child_process");
    const [bin, ...args] = cmd.split(/\s+/);
    const proc = spawn(bin, args, {
      cwd,
      stdio: "inherit",
      shell: process.platform === "win32",
    });

    proc.on("close", (code: number) => {
      resolve({ code, output: "" });
    });
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const ROOT = join(import.meta.dirname, "..");
  const argv = process.argv.slice(2);

  // ── CLI flags ───────────────────────────────────────────────────────────
  const runAll = argv.includes("--all");
  const listOnly = argv.includes("--list");
  const unitOnly = argv.includes("--unit-only");
  const suiteFilter = argv.includes("--suite") ? argv[argv.indexOf("--suite") + 1] : null;

  if (unitOnly) {
    FULL_CORE_SUITE.command = "bun run test:unit";
  }

  // ── Determine changed files ─────────────────────────────────────────────
  const changedFiles = runAll ? ["*"] : getChangedFiles();

  if (changedFiles.length === 0) {
    console.log("✅ No changed files detected. Nothing to test.");
    return;
  }

  console.log(`\n📋 Changed files (${changedFiles.length}):`);
  for (const f of changedFiles.slice(0, 20)) {
    console.log(`   ${f}`);
  }
  if (changedFiles.length > 20) {
    console.log(`   ... and ${changedFiles.length - 20} more`);
  }

  // ── Select suites ───────────────────────────────────────────────────────
  let suites = selectSuites(changedFiles);

  if (unitOnly) {
    suites = suites.filter((s) => s.rule.gate === 1 || s.rule.gate === 0);
  }

  if (suiteFilter) {
    suites = suites.filter((s) => s.rule.label.toLowerCase().includes(suiteFilter.toLowerCase()));
    if (suites.length === 0) {
      console.error(`❌ No suite matches filter "${suiteFilter}"`);
      process.exit(1);
    }
  }

  // ── Print plan ──────────────────────────────────────────────────────────
  console.log("\n🧪 Smart Test Plan:");
  console.log("═".repeat(60));

  const byGate = new Map<number, SelectedSuite[]>();
  for (const s of suites) {
    const gate = s.rule.gate;
    if (!byGate.has(gate)) byGate.set(gate, []);
    byGate.get(gate)!.push(s);
  }

  for (const [gate, gsuites] of [...byGate.entries()].sort(([a], [b]) => a - b)) {
    const gateLabel = gate === 0 ? "FAIL-CLOSED" : `Gate ${gate}`;
    console.log(`\n  [${gateLabel}]`);
    for (const s of gsuites) {
      console.log(`    ${s.rule.label}`);
      console.log(`      → ${s.rule.command}`);
      if (s.matchingFiles.length <= 5) {
        for (const f of s.matchingFiles) {
          console.log(`        ${f}`);
        }
      } else {
        console.log(`        ${s.matchingFiles.length} matching files`);
      }
    }
  }

  if (listOnly) {
    console.log("\n✅ Listed only. Use without --list to execute.");
    return;
  }

  // ── Execute ─────────────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(60));
  console.log("🚀 Executing test suites...\n");

  const results: { label: string; gate: number; code: number }[] = [];
  let hasFailures = false;

  for (const { rule } of suites) {
    const start = Date.now();
    console.log(`\n▶ ${rule.label} (Gate ${rule.gate})`);
    console.log(`  $ ${rule.command}`);

    const { code } = await runCommand(rule.command, ROOT);
    const duration = ((Date.now() - start) / 1000).toFixed(1);

    results.push({ label: rule.label, gate: rule.gate, code });

    if (code === 0) {
      console.log(`  ✅ Passed (${duration}s)`);
    } else {
      console.log(`  ❌ Failed (${duration}s)`);
      hasFailures = true;
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(60));
  console.log("📊 Test Summary:");
  for (const r of results) {
    const status = r.code === 0 ? "✅" : "❌";
    console.log(`  ${status} Gate ${r.gate}: ${r.label}`);
  }

  if (hasFailures) {
    console.log("\n❌ Some suites failed. Root-cause each failure. Do NOT retry until green.");
    process.exit(1);
  }

  console.log("\n✅ All selected suites passed.\n");
}

main().catch((err) => {
  console.error("Smart runner crashed:", err);
  process.exit(1);
});
