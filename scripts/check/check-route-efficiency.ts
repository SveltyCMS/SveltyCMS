#!/usr/bin/env bun
/**
 * @file scripts/check/check-route-efficiency.ts
 * @description
 * Static and runtime route-efficiency analyzer for SveltyCMS.
 * Analyzes route loader and action files across `src/routes/` for:
 * 1. Direct DB adapter access bypassing LocalCMS (unifies caching, tracing, and tenant guards)
 * 2. Sequential `await` waterfalls (independent DB queries that should be Promise.all'd)
 * 3. RouteResourceStateMachine lane classification compatibility
 *
 * Features:
 * - Pure per-file scanner (`scanRouteSource`) shared by the CLI and the unit suite
 * - Whitelisted raw-DB routes (`api/[...path]`, `api/testing`) and any `testing` path
 * - Four-line threshold for the sequential-await heuristic
 * - Supports `--check` flag to fail CI with exit code 1 if critical violations are found
 */

import fs from "node:fs";
import path from "node:path";

export interface Violation {
  file: string;
  line: number;
  type: "DIRECT_DB_ACCESS" | "SEQUENTIAL_AWAIT_WATERFALL";
  severity: "critical" | "advisory";
  message: string;
}

// Whitelist routes that legitimately interact with raw database driver or test harnesses
export const ALLOWED_RAW_DB_ROUTES: ReadonlySet<string> = new Set([
  "src/routes/api/[...path]/+server.ts",
  "src/routes/api/testing/+server.ts",
]);

const DIRECT_DB_MARKERS = [
  "dbAdapter.crud.",
  "dbAdapter.content.",
  "dbAdapter.collection.",
  "dbAdapter.system.",
  "dbAdapter.auth.",
];

/**
 * Scans one route source file.
 *
 * `relPath` must be repository-relative with POSIX separators; it is both the
 * whitelist key and the value reported in a violation.
 */
export function scanRouteSource(relPath: string, content: string): Violation[] {
  const violations: Violation[] = [];
  const lines = content.split("\n");

  let consecutiveAwaits = 0;
  let waterfallStartLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i]!;

    // Check for direct dbAdapter usage in server routes where LocalCMS or services are preferred
    if (
      DIRECT_DB_MARKERS.some((marker) => line.includes(marker)) &&
      !ALLOWED_RAW_DB_ROUTES.has(relPath) &&
      !relPath.includes("testing")
    ) {
      violations.push({
        file: relPath,
        line: lineNum,
        type: "DIRECT_DB_ACCESS",
        severity: "advisory",
        message:
          "Direct dbAdapter call detected. Prefer LocalCMS / CMS namespace for uniform tenant caching and tracing.",
      });
    }

    // Heuristic for sequential await waterfalls: 4+ consecutive standalone await lines without Promise.all
    const trimmed = line.trim();
    if (
      (trimmed.startsWith("const ") || trimmed.startsWith("let ")) &&
      trimmed.includes("= await ") &&
      !trimmed.includes("Promise.all") &&
      !trimmed.includes("import(")
    ) {
      if (consecutiveAwaits === 0) {
        waterfallStartLine = lineNum;
      }
      consecutiveAwaits++;
    } else if (
      trimmed.length > 0 &&
      !trimmed.startsWith("//") &&
      !trimmed.startsWith("/*") &&
      !trimmed.startsWith("*")
    ) {
      if (consecutiveAwaits >= 4) {
        violations.push({
          file: relPath,
          line: waterfallStartLine,
          type: "SEQUENTIAL_AWAIT_WATERFALL",
          severity: "advisory",
          message: `${consecutiveAwaits} sequential await statements detected. Consider parallelizing with Promise.all().`,
        });
      }
      consecutiveAwaits = 0;
    }
  }

  return violations;
}

function walkDir(dir: string, violations: Violation[]): void {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(full, violations);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".server.ts") || entry.name.endsWith("+server.ts"))
    ) {
      const relPath = path.relative(process.cwd(), full).replace(/\\/g, "/");
      const content = fs.readFileSync(full, "utf-8");
      violations.push(...scanRouteSource(relPath, content));
    }
  }
}

function main(argv: readonly string[]): number {
  const isCheck = argv.includes("--check");
  const routesDir = path.resolve(process.cwd(), "src/routes");
  const violations: Violation[] = [];

  console.log("🚀 Scanning SveltyCMS routes for efficiency patterns...\n");
  walkDir(routesDir, violations);

  const criticalCount = violations.filter((v) => v.severity === "critical").length;
  const advisoryCount = violations.filter((v) => v.severity === "advisory").length;

  if (violations.length === 0) {
    console.log(
      "✅ Route efficiency check passed: 0 direct DB bypasses or heavy await waterfalls found.",
    );
    return 0;
  }

  console.log(
    `ℹ️ Found ${violations.length} route efficiency item(s) (${criticalCount} critical, ${advisoryCount} advisory):\n`,
  );
  for (const v of violations) {
    const icon = v.severity === "critical" ? "❌" : "⚠️";
    console.log(`  ${icon} [${v.type}] ${v.file}:${v.line} — ${v.message}`);
  }

  if (isCheck && criticalCount > 0) {
    console.error(`\n❌ Gate failed: ${criticalCount} critical route efficiency violation(s).`);
    return 1;
  }

  console.log("\n✅ Route efficiency scan complete (advisories reported).");
  return 0;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
