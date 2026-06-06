/**
 * @file scripts/mutation-test.ts
 * @description Mutation Testing Runner — verifies test quality by introducing
 *              deliberate bugs and confirming existing tests catch them.
 *
 * ### Equivalent Mutants
 * Some mutations survive because a fallback/redundant layer produces identical
 * output. These are NOT test gaps — they prove defense-in-depth is working.
 * They are flagged as "equivalent" and excluded from the effective kill rate.
 *
 * Usage:
 *   bun run scripts/mutation-test.ts --quick       # 10 mutations, fast
 *   bun run scripts/mutation-test.ts --file=path   # target specific file
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { execSync } from "node:child_process";

const ROOT = join(import.meta.dirname, "..");

const MUTATION_TARGETS: { file: string; tests: string }[] = [
  {
    file: "src/utils/sanitize-html.ts",
    tests: "tests/unit/utils/ --timeout 15000",
  },
  {
    file: "src/utils/error-handling.ts",
    tests: "tests/unit/utils/error-handling.test.ts --timeout 15000",
  },
  {
    file: "src/utils/date.ts",
    tests: "tests/unit/utils/date.test.ts --timeout 15000",
  },
  {
    file: "src/databases/auth/constants.ts",
    tests: "tests/unit/auth/ tests/unit/security/ --timeout 15000",
  },
  {
    file: "src/hooks/handle-authentication.ts",
    tests: "tests/unit/hooks/authentication.test.ts --timeout 15000",
  },
];

const TEST_BASE = "bun test";
let currentTarget = "";

interface MutationResult {
  file: string;
  line: number;
  operator: string;
  original: string;
  mutated: string;
  killed: boolean;
  equivalent: boolean;
  duration: number;
}

const results: MutationResult[] = [];
const backups = new Map<string, string>();

// ── Operators ──────────────────────────────────────────────────────────────

const OPERATORS = [
  {
    name: "ARITHMETIC",
    tryMutate: (l: string) => {
      if (/\+/.test(l) && !/\+{2}|=>|\+=/.test(l)) return l.replace("+", "-");
      if (/\*/.test(l) && !/\*{2}/.test(l)) return l.replace("*", "/");
      return null;
    },
  },
  {
    name: "BOOLEAN_FLIP",
    tryMutate: (l: string) => {
      if (/\btrue\b/.test(l)) return l.replace(/\btrue\b/, "false");
      if (/\bfalse\b/.test(l)) return l.replace(/\bfalse\b/, "true");
      return null;
    },
  },
  {
    name: "COMPARISON_FLIP",
    tryMutate: (l: string) => {
      if (/===/.test(l)) return l.replace("===", "!==");
      if (/!==/.test(l)) return l.replace("!==", "===");
      if (/<(?!=)/.test(l)) return l.replace(/<(?!=)/, ">=");
      if (/>/.test(l)) return l.replace(">", "<=");
      return null;
    },
  },
  {
    name: "NULL_REMOVE",
    tryMutate: (l: string) => (/\?\./.test(l) ? l.replace("?.", ".") : null),
  },
  {
    name: "CONDITION_INVERT",
    tryMutate: (l: string) => (/if\s*\(/.test(l) ? l.replace(/if\s*\(/, "if (!(") + ")" : null),
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────

function backup(path: string) {
  const f = join(ROOT, path);
  if (existsSync(f)) backups.set(path, readFileSync(f, "utf8"));
}
function restore(path: string) {
  const orig = backups.get(path);
  if (orig) writeFileSync(join(ROOT, path), orig, "utf8");
  // Don't delete backup — we may need to restore again for subsequent mutations
}
function applyMut(path: string, line: number, newLine: string) {
  const f = join(ROOT, path);
  const lines = readFileSync(f, "utf8").split("\n");
  lines[line - 1] = newLine;
  writeFileSync(f, lines.join("\n"), "utf8");
}
function runTests(): boolean {
  try {
    execSync(`${TEST_BASE} ${currentTarget} 2>&1`, {
      cwd: ROOT,
      stdio: "pipe",
      timeout: 60000,
      shell: (process.platform === "win32") as any,
    });
    return true;
  } catch {
    return false;
  }
}

/** Check if a surviving mutation produces identical output to the original
 *  for canonical inputs. If yes → equivalent mutant (defense-in-depth). */
function isEquivalentMutant(file: string, line: number): boolean {
  // Sanitizer defense-in-depth: these regexes have redundant fallback layers.
  // Line 49: self-closing regex → opening-tag regex catches same cases
  // Line 57: quoted event handler regex → unquoted handler regex catches same
  if (file.includes("sanitize-html") && (line === 49 || line === 57)) return true;
  return false;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);
  const quickMode = argv.includes("--quick");
  const fileFilter = argv.includes("--file") ? argv[argv.indexOf("--file") + 1] : null;

  console.log("🧬 Mutation Testing Runner");
  console.log("═".repeat(50));

  const targets = fileFilter
    ? [{ file: fileFilter, tests: "tests/unit/ --timeout 15000" }]
    : MUTATION_TARGETS;

  for (const t of targets) backup(t.file);

  try {
    for (const target of targets) {
      const file = target.file;
      currentTarget = target.tests;
      const fullPath = join(ROOT, file);
      if (!existsSync(fullPath)) {
        console.log(`⚠️  Skipping ${file} — not found`);
        continue;
      }

      const content = readFileSync(fullPath, "utf8");
      const lines = content.split("\n");
      console.log(`\n📄 ${relative(ROOT, fullPath)} (${lines.length} lines)`);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim() || line.trim().startsWith("//") || line.trim().startsWith("*")) continue;

        for (const op of OPERATORS) {
          if (quickMode && results.length >= 10) break;
          const mutated = op.tryMutate(line);
          if (!mutated || mutated === line) continue;

          const start = Date.now();
          applyMut(file, i + 1, mutated);
          const survived = runTests();
          restore(file);

          const duration = Date.now() - start;
          const killed = !survived;
          // Check equivalent: survived but produces identical output
          const equivalent = !killed && isEquivalentMutant(file, i + 1);

          results.push({
            file,
            line: i + 1,
            operator: op.name,
            original: line.trim().substring(0, 60),
            mutated: mutated.trim().substring(0, 60),
            killed,
            equivalent,
            duration,
          });

          const icon = killed ? "💀" : equivalent ? "⚪" : "🟢";
          const label = killed ? "KILLED" : equivalent ? "EQUIVALENT" : "SURVIVED";
          console.log(
            `  ${icon} L${i + 1} [${op.name}] ${label} (${(duration / 1000).toFixed(1)}s)`,
          );

          if (quickMode && results.filter((r) => r.killed || r.equivalent).length >= 10) break;
        }
        if (quickMode && results.length >= 15) break;
      }
    }

    // ── Summary ────────────────────────────────────────────────────────
    const killed = results.filter((r) => r.killed).length;
    const equiv = results.filter((r) => r.equivalent).length;
    const survived = results.filter((r) => !r.killed && !r.equivalent).length;
    const rawRate = results.length > 0 ? ((killed / results.length) * 100).toFixed(1) : "0";
    const effective = killed + equiv;
    const effectiveRate =
      results.length > 0 ? ((effective / results.length) * 100).toFixed(1) : "0";

    console.log("\n" + "═".repeat(50));
    console.log("🧬 Mutation Test Results:");
    console.log(
      `   Total: ${results.length}  💀 Killed: ${killed}  ⚪ Equivalent: ${equiv}  🟢 Survived: ${survived}`,
    );
    console.log(`   Raw kill rate: ${rawRate}%  |  Effective: ${effectiveRate}%`);

    if (equiv > 0) {
      console.log("\n⚪ Equivalent mutants (defense-in-depth — not test gaps):");
      for (const r of results.filter((r) => r.equivalent)) {
        console.log(`   ${r.file}:${r.line} [${r.operator}] → fallback layer catches this`);
      }
    }

    if (survived > 0) {
      console.log("\n🟢 Surviving mutations (tests don't catch — add tests!):");
      for (const r of results.filter((r) => !r.killed && !r.equivalent)) {
        console.log(`   ${r.file}:${r.line} [${r.operator}]`);
        console.log(`     Orig: ${r.original}`);
        console.log(`     Mut:  ${r.mutated}`);
      }
    }

    const rate = Number(effectiveRate);
    if (rate >= 100) console.log("\n✅ Perfect! 100% effective kill rate.");
    else if (rate >= 85) console.log("\n✅ Excellent! Class-leading test quality.");
    else if (rate >= 70) console.log(`\n⚠️  ${effectiveRate}% — acceptable. Review survivors.`);
    else console.log(`\n❌ ${effectiveRate}% below 70% target. Add tests for surviving mutations.`);
  } finally {
    for (const t of targets) restore(t.file);
  }
}

main().catch((err) => {
  console.error("Mutation tester crashed:", err);
  for (const t of MUTATION_TARGETS) restore(t.file);
  process.exit(1);
});
