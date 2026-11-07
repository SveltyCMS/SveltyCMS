/**
 * @file scripts/lint/lint-tenant-scope.ts
 * @description Fails when `withSystemScope()` is spread into the same query
 * options object as a live `tenantId`.
 *
 * `withSystemScope()` brands the call as system-scoped, which makes
 * `hasTenantBypass()` true and therefore empties the tenant predicate
 * (`buildRawTenantClause` / `getTenantCondition`). Passing it together with a
 * real tenantId silently turns a tenant-scoped read into a cross-tenant read.
 * The same bug shipped twice: `content/engine.server.ts` (structure delete
 * re-read) and `populate-resolver.ts` (relation targets).
 *
 * Correct shape:
 *   { tenantId, ...(tenantId ? {} : withSystemScope("bootstrap")) }
 * Incorrect shape:
 *   { tenantId, ...withSystemScope("bootstrap") }
 *
 * Usage:
 *   bun run scripts/lint/lint-tenant-scope.ts [--quiet]
 * Exit code: 0 on clean, 1 on any violation.
 *
 * Features:
 * - Pure `findTenantScopeConflicts()` core (unit-tested with fixtures)
 * - Conditional spreads are allowed; only an unconditional bypass is flagged
 * - Line suppression: `lint-tenant-scope: allow`
 */

import ts from "typescript";
import { readSourceFiles, scriptBlocks, type SourceFile } from "./lib/source-files";

export interface TenantScopeOffense {
  file: string;
  line: number;
  detail: string;
}

const ALLOW_COMMENT = "lint-tenant-scope: allow";
const EXCLUDED_PREFIXES = ["src/types/", "src/paraglide/"];
/**
 * Bootstrap seeders write as the system principal for a tenant that may not be
 * persisted yet (setup-wizard ordering, E2E seeding). Their system scope is
 * intentional and reviewed; a new file needs an explicit entry here.
 */
const BOOTSTRAP_ALLOWLIST: ReadonlySet<string> = new Set([
  "src/services/setup/seed.ts",
  "src/routes/api/[...path]/handlers/testing/testing-seed.ts",
]);

/** True when the expression is a call to `withSystemScope(...)`. */
function isWithSystemScopeCall(node: ts.Node): boolean {
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression;
  if (ts.isIdentifier(callee)) return callee.text === "withSystemScope";
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text === "withSystemScope";
  return false;
}

/** Strip parentheses / `as` / `!` wrappers from an expression. */
function unwrapExpression(node: ts.Expression): ts.Expression {
  let current = node;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

/** True when the object literal declares a `tenantId` property. */
function objectHasTenantId(objectLiteral: ts.ObjectLiteralExpression): boolean {
  for (const property of objectLiteral.properties) {
    if (ts.isShorthandPropertyAssignment(property)) {
      if (property.name.text === "tenantId") return true;
      continue;
    }
    if (!ts.isPropertyAssignment(property)) continue;
    const name = property.name;
    const key = ts.isIdentifier(name) ? name.text : ts.isStringLiteralLike(name) ? name.text : null;
    if (key === "tenantId") return true;
  }
  return false;
}

function lineHasAllowComment(lines: readonly string[], lineIndex: number): boolean {
  return (
    lines[lineIndex]?.includes(ALLOW_COMMENT) === true ||
    lines[lineIndex - 1]?.includes(ALLOW_COMMENT) === true
  );
}

/**
 * Pure core — fixtures in `tests/unit/scripts/lint-tenant-scope.test.ts`.
 */
export function findTenantScopeConflicts(files: readonly SourceFile[]): TenantScopeOffense[] {
  const offenses: TenantScopeOffense[] = [];

  for (const file of files) {
    if (EXCLUDED_PREFIXES.some((prefix) => file.path.startsWith(prefix))) continue;
    if (BOOTSTRAP_ALLOWLIST.has(file.path)) continue;
    if (!file.path.endsWith(".ts") && !file.path.endsWith(".svelte")) continue;
    const lines = file.source.split(/\r?\n/);

    for (const block of scriptBlocks(file)) {
      if (!block.text.includes("withSystemScope")) continue;
      const sourceFile = ts.createSourceFile(
        file.path,
        block.text,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );

      const report = (node: ts.Node) => {
        const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        const lineIndex = position.line + block.lineOffset;
        if (lineHasAllowComment(lines, lineIndex)) return;
        offenses.push({
          file: file.path,
          line: lineIndex + 1,
          detail: "withSystemScope() is unconditional next to a live tenantId",
        });
      };

      const visit = (node: ts.Node): void => {
        if (
          ts.isSpreadAssignment(node) &&
          isWithSystemScopeCall(unwrapExpression(node.expression)) &&
          ts.isObjectLiteralExpression(node.parent) &&
          objectHasTenantId(node.parent)
        ) {
          report(node);
        } else if (
          ts.isPropertyAssignment(node) &&
          isWithSystemScopeCall(unwrapExpression(node.initializer)) &&
          ts.isObjectLiteralExpression(node.parent) &&
          objectHasTenantId(node.parent)
        ) {
          report(node);
        }
        ts.forEachChild(node, visit);
      };

      visit(sourceFile);
    }
  }

  return offenses;
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function main(): void {
  const quiet = process.argv.includes("--quiet") || process.argv.includes("--ci");
  const files = readSourceFiles();
  const offenses = findTenantScopeConflicts(files);

  if (offenses.length === 0) {
    if (!quiet) {
      console.log(`✅ tenant scope: no unconditional system-scope bypass (${files.length} files).`);
    }
    return;
  }

  console.error(`❌ tenant scope: ${offenses.length}`);
  for (const offense of offenses) {
    console.error(`   ${offense.file}:${offense.line} — ${offense.detail}`);
  }
  console.error(
    '\n   Use `...(tenantId ? {} : withSystemScope("bootstrap"))` when a read may be tenant-less.',
  );
  process.exitCode = 1;
}

if (import.meta.main) main();
