#!/usr/bin/env bun
/**
 * @file scripts/lint/lint-tenant-api.ts
 * @description AST-based tenant-isolation API hygiene linter with parallel processing.
 *
 * Uses ts-morph for context-aware AST analysis instead of fragile regex matching.
 * Files are read and parsed in parallel across available CPU cores.
 *
 * ### Rules:
 * 1. Ban positional `tenantId?: DatabaseId | null` parameters on media/content/auth
 *    adapter implementations (last-arg must be options bag).
 * 2. Flag `bypassTenantCheck: true` in product code outside the allowlist
 *    (prefer `withSystemScope(reason)` / branded systemScope).
 * 3. Flag auto-bypass defaults on `assertTenantContext`
 *    (`options ?? { bypassTenantCheck: true }`).
 * 4. Verify `system-tenant-scope.ts` exports required brand helpers.
 *
 * Exit 1 on violations. Run: `bun run lint:tenant`
 */

import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { cpus } from "node:os";
import {
  Project,
  SyntaxKind,
  type Node,
  type SourceFile,
  type FunctionLikeDeclaration,
} from "ts-morph";

const ROOT = join(import.meta.dirname, "../..");
const SRC = join(ROOT, "src");
const CONCURRENCY = Math.max(1, cpus().length);

/** Paths allowed to set bypassTenantCheck (system, setup, auth bootstrap, plugins, tests). */
const BYPASS_ALLOWLIST: RegExp[] = [
  /[/\\]setup[/\\]/,
  /[/\\]setup-check\.ts$/,
  /[/\\]db-init\.ts$/,
  /[/\\]boot-engine\.ts$/,
  /[/\\]engine\.server\.ts$/,
  /[/\\]demo-cleanup\.ts$/,
  /[/\\]migrated-media\.server\.ts$/,
  /[/\\]magic-link\.ts$/,
  /[/\\]handle-authorization\.ts$/,
  /[/\\]handle-authentication\.ts$/,
  /[/\\]relational-system\.ts$/,
  /[/\\]tenant-adapter\.ts$/,
  /[/\\]mongo-db-adapter\.ts$/,
  /[/\\]website-token-methods\.ts$/,
  /[/\\]website-token\.ts$/,
  /[/\\]pagespeed[/\\]migrations\.ts$/,
  /[/\\]plugins[/\\]registry\.ts$/,
  /[/\\]plugins[/\\]settings\.ts$/,
  /[/\\]handlers[/\\]auth\.ts$/,
  /[/\\]handlers[/\\]setup\.ts$/,
  /[/\\]handlers[/\\]testing\.ts$/,
  /[/\\]login[/\\]/,
  /[/\\]user[/\\]\+page\.server\.ts$/,
  /[/\\]tenant-service\.ts$/,
  /[/\\]telemetry-service\.ts$/,
  /[/\\]scheduled-jobs\.ts$/,
  /[/\\]auth-namespace\.ts$/,
  /[/\\]media-namespace\.ts$/,
  /[/\\]populate-resolver\.ts$/,
  /[/\\]\+layout\.server\.ts$/,
  /scripts[/\\]/,
  /tests[/\\]/,
];

/**
 * Only these files are scanned for positional tenantId (media/content/auth surfaces).
 * System/theme/job adapters still use positional tenant — migrate separately.
 */
const POSITIONAL_SCAN_FILES: string[] = [
  join(SRC, "databases", "core", "relational-media.ts"),
  join(SRC, "databases", "core", "relational-content.ts"),
  join(SRC, "databases", "core", "relational-auth.ts"),
  join(SRC, "databases", "core", "relational-system.ts"),
  join(SRC, "databases", "mongodb", "media-module.ts"),
  join(SRC, "databases", "mongodb", "media-methods.ts"),
  join(SRC, "databases", "mongodb", "content-methods.ts"),
  join(SRC, "databases", "mongodb", "auth-user.ts"),
  join(SRC, "databases", "mongodb", "job.ts"),
];

/** IMediaAdapter block in db-interface — scan only between markers. */
const DB_INTERFACE = join(SRC, "databases", "db-interface.ts");

const FAIL_CLOSED_SURFACES: string[] = [
  join(SRC, "databases", "core", "relational-system.ts"),
  join(SRC, "databases", "mongodb", "job.ts"),
  join(SRC, "databases", "mongodb", "theme-methods.ts"),
];

const REQUIRED_SCOPE_EXPORTS = [
  "createSystemTenantScope",
  "isSystemTenantScope",
  "hasTenantBypass",
  "withSystemScope",
];

// ─── Types ──────────────────────────────────────────────────────────────────

/** One tenant-isolation hygiene violation, located by file and 1-based line. */
export interface TenantApiViolation {
  file: string;
  line: number;
  message: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  try {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === "paraglide") continue;
      const p = join(dir, name);
      let st;
      try {
        st = statSync(p);
      } catch {
        continue;
      }
      if (st.isDirectory()) out.push(...collectTsFiles(p));
      else if (name.endsWith(".ts") && !name.endsWith(".d.ts")) out.push(p);
    }
  } catch {
    /* permission errors */
  }
  return out;
}

/** Get changed .ts files from git (for incremental scanning). */
function getChangedSourceFiles(): string[] {
  const seen = new Set<string>();
  const add = (output: string) => {
    for (const f of output
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)) {
      if (
        f &&
        (f.startsWith("src/") || f.startsWith("scripts/")) &&
        f.endsWith(".ts") &&
        !f.endsWith(".d.ts")
      ) {
        seen.add(f);
      }
    }
  };
  const ops = [
    ["git", "diff", "--name-only", "--diff-filter=ACM"],
    ["git", "diff", "--name-only", "--cached", "--diff-filter=ACM"],
    ["git", "ls-files", "--others", "--exclude-standard"],
    ["git", "diff", "--name-only", "HEAD", "--diff-filter=ACM"],
  ];
  for (const [cmd, ...args] of ops) {
    try {
      add(execSync([cmd, ...args].join(" "), { encoding: "utf8", cwd: ROOT }));
    } catch {
      /* ok */
    }
  }
  return [...seen].filter((f) => existsSync(join(ROOT, f)));
}

/**
 * True when a project-relative path may set `bypassTenantCheck`.
 * Exported so the documented allowlist escape hatch is pinned by tests.
 */
export function isAllowlistedPath(relPath: string): boolean {
  const posix = relPath.replace(/\\/g, "/");
  return BYPASS_ALLOWLIST.some((re) => re.test(posix));
}

function isPositionalTenantId(param: Node): boolean {
  const text = param.getText();
  const paramDecl = param.asKind(SyntaxKind.Parameter);
  if (!paramDecl) return false;
  const hasOptional = paramDecl.hasQuestionToken() || text.includes("?");
  if (!hasOptional) return false;
  if (!text.includes("tenantId")) return false;

  const typeNode = paramDecl.getTypeNode();
  if (!typeNode) return false;
  const typeKind = typeNode.getKind();
  if (typeKind === SyntaxKind.TypeLiteral || typeKind === SyntaxKind.IntersectionType) {
    return false;
  }
  if (typeKind !== SyntaxKind.UnionType) return false;

  const typeText = typeNode.getText();
  return /\b(DatabaseId|string)\b.*\|\s*null/.test(typeText);
}

function getLineNumber(sourceFile: SourceFile, node: Node): number {
  return sourceFile.getLineAndColumnAtPos(node.getStart()).line;
}

// ─── Rule 1: Positional tenantId detection (AST) ────────────────────────────

function checkPositionalTenantId(filePath: string, violations: TenantApiViolation[]): void {
  try {
    const content = readFileSync(filePath, "utf8");
    violations.push(...findPositionalTenantViolations(content, relative(ROOT, filePath)));
  } catch {
    /* file may not exist or parse — skip */
  }
}

/**
 * Pure core for rule 1: a positional `tenantId?: DatabaseId | null` parameter on
 * a media/content/auth surface. The options bag must be the last argument.
 */
export function findPositionalTenantViolations(
  content: string,
  relPath: string,
): TenantApiViolation[] {
  const violations: TenantApiViolation[] = [];
  const project = new Project({ useInMemoryFileSystem: true });
  const sourceFile = project.createSourceFile("module.ts", content);

  // Walk all function-like declarations
  const visit = (node: Node) => {
    const funcNode =
      node.asKind(SyntaxKind.MethodDeclaration) ||
      node.asKind(SyntaxKind.MethodSignature) ||
      node.asKind(SyntaxKind.FunctionDeclaration) ||
      node.asKind(SyntaxKind.ArrowFunction);
    if (funcNode) {
      const params = (funcNode as unknown as FunctionLikeDeclaration).getParameters();
      for (let i = 0; i < params.length; i++) {
        const param = params[i];
        if (!param.isKind(SyntaxKind.Parameter)) continue;
        const paramText = param.getText();
        if (!paramText.includes("tenantId")) continue;
        if (paramText.startsWith("{")) continue;
        if (funcNode.isKind(SyntaxKind.PropertySignature)) continue;

        const isLastParam = i === params.length - 1;
        if (isLastParam) {
          const typeNode = param.getTypeNode();
          const typeText = typeNode?.getText() ?? "";
          if (
            typeText.includes("BaseQueryOptions") ||
            typeText.includes("QueryOptions") ||
            typeText.includes("FindOptions") ||
            typeText.includes("Record<") ||
            (typeText.includes("{") && !typeText.includes("DatabaseId"))
          ) {
            continue;
          }
        }

        if (isPositionalTenantId(param)) {
          const line = getLineNumber(sourceFile, param);
          violations.push({
            file: `${relPath}:${line}`,
            line,
            message: "positional tenantId — use options?: BaseQueryOptions as last arg",
          });
        }
      }
    }

    node.forEachChild(visit);
  };
  sourceFile.forEachChild(visit);
  return violations;
}

/** Check db-interface.ts IMediaAdapter/IContentAdapter/IAuthAdapter blocks. */
function checkInterfaceBlocks(violations: TenantApiViolation[]): void {
  if (!existsSync(DB_INTERFACE)) return;

  try {
    const content = readFileSync(DB_INTERFACE, "utf8");
    violations.push(...findInterfaceTenantViolations(content, "src/databases/db-interface.ts"));
  } catch {
    /* skip */
  }
}

/**
 * Pure core for the adapter interface declarations: a positional `tenantId`
 * parameter on `IMediaAdapter` / `IContentAdapter` / `IAuthAdapter` / `ISystemAdapter`.
 */
export function findInterfaceTenantViolations(
  content: string,
  relPath: string,
): TenantApiViolation[] {
  const violations: TenantApiViolation[] = [];
  const project = new Project({ useInMemoryFileSystem: true });
  const sourceFile = project.createSourceFile("db-interface.ts", content);

  const targetInterfaces = ["IMediaAdapter", "IContentAdapter", "IAuthAdapter", "ISystemAdapter"];

  for (const iface of sourceFile.getInterfaces()) {
    if (!targetInterfaces.includes(iface.getName())) continue;

    for (const method of iface.getMethods()) {
      const params = method.getParameters();
      for (let i = 0; i < params.length; i++) {
        const param = params[i];
        const paramText = param.getText();

        if (!paramText.includes("tenantId")) continue;

        const isLastParam = i === params.length - 1;
        if (isLastParam) {
          const typeText = param.getTypeNode()?.getText() ?? "";
          if (
            typeText.includes("BaseQueryOptions") ||
            typeText.includes("QueryOptions") ||
            typeText.includes("FindOptions") ||
            typeText.includes("Record<")
          ) {
            continue;
          }
        }

        if (isPositionalTenantId(param)) {
          const line = getLineNumber(sourceFile, param);
          violations.push({
            file: `${relPath}:${line}`,
            line,
            message: "positional tenantId — use options?: BaseQueryOptions",
          });
        }
      }
    }
  }
  return violations;
}

// ─── Rule 2: bypassTenantCheck outside allowlist (AST) ──────────────────────

function checkBypassAllowlist(filePath: string, violations: TenantApiViolation[]): void {
  const raw = readFileSync(filePath, "utf8");
  violations.push(...findBypassTenantCheckViolations(raw, relative(ROOT, filePath)));
}

/**
 * Pure core for rule 2: `bypassTenantCheck: true` in product code.
 * The `BYPASS_ALLOWLIST` escape hatch is applied here — per file, never globally.
 */
export function findBypassTenantCheckViolations(
  content: string,
  relPath: string,
): TenantApiViolation[] {
  if (isAllowlistedPath(relPath)) return [];
  if (!content.includes("bypassTenantCheck")) return [];

  const violations: TenantApiViolation[] = [];
  const project = new Project({ useInMemoryFileSystem: true });
  const sourceFile = project.createSourceFile("module.ts", content);

  const visit = (node: Node) => {
    // Find object literal property assignments `bypassTenantCheck: true`
    if (node.getKind() === SyntaxKind.PropertyAssignment) {
      const name = node.getSymbol()?.getName() ?? node.getFirstChild()?.getText() ?? "";
      if (name === "bypassTenantCheck") {
        const initializer = node.getLastChild()?.getText();
        if (initializer === "true") {
          const line = getLineNumber(sourceFile, node);
          violations.push({
            file: `${relPath}:${line}`,
            line,
            message:
              "bypassTenantCheck: true outside allowlist — use withSystemScope(reason) or add path to allowlist",
          });
        }
      }
    }
    node.forEachChild(visit);
  };
  sourceFile.forEachChild(visit);
  return violations;
}

// ─── Rule 3: Auto-bypass defaults on assertTenantContext (AST) ───────────────

function checkAutoBypassDefaults(filePath: string, violations: TenantApiViolation[]): void {
  const raw = readFileSync(filePath, "utf8");
  violations.push(...findAutoBypassViolations(raw, relative(ROOT, filePath)));
}

/** Pure core for rule 3: `assertTenantContext(options ?? { bypassTenantCheck: true })`. */
export function findAutoBypassViolations(content: string, relPath: string): TenantApiViolation[] {
  const violations: TenantApiViolation[] = [];
  const project = new Project({ useInMemoryFileSystem: true });
  const sourceFile = project.createSourceFile("module.ts", content);

  const visit = (node: Node) => {
    if (node.getKind() === SyntaxKind.CallExpression) {
      const callText = node.getText();
      // Match: assertTenantContext(options ?? { bypassTenantCheck: true })
      if (
        callText.includes("assertTenantContext") &&
        callText.includes("??") &&
        callText.includes("bypassTenantCheck") &&
        callText.includes("true")
      ) {
        const line = getLineNumber(sourceFile, node);
        violations.push({
          file: `${relPath}:${line}`,
          line,
          message:
            "auto-bypass default (options ?? { bypassTenantCheck: true }) is banned — callers must pass withSystemScope or tenantId",
        });
      }
    }
    node.forEachChild(visit);
  };
  sourceFile.forEachChild(visit);
  return violations;
}

// ─── Rule 4: System tenant scope exports (AST) ──────────────────────────────

const SCOPE_FILE_LABEL = "src/databases/system-tenant-scope.ts";

function checkScopeExports(violations: TenantApiViolation[]): void {
  const scopeFile = join(SRC, "databases", "system-tenant-scope.ts");
  let raw: string | null = null;
  try {
    raw = existsSync(scopeFile) ? readFileSync(scopeFile, "utf8") : null;
  } catch {
    // Unreadable module → reported exactly like a missing one.
    raw = null;
  }
  violations.push(...findScopeExportViolations(raw));
}

/**
 * Pure core for rule 4: the branded system-scope module must export every
 * helper callers branch on. `null` means the module itself is missing.
 */
export function findScopeExportViolations(content: string | null): TenantApiViolation[] {
  if (content === null) {
    return [{ file: SCOPE_FILE_LABEL, line: 0, message: "missing branded system scope module" }];
  }

  const violations: TenantApiViolation[] = [];
  try {
    const project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile("system-tenant-scope.ts", content);

    const exportedFunctions = new Set(
      sourceFile
        .getFunctions()
        .filter((f) => f.isExported())
        .map((f) => f.getName() ?? ""),
    );

    for (const name of REQUIRED_SCOPE_EXPORTS) {
      if (!exportedFunctions.has(name)) {
        violations.push({
          file: SCOPE_FILE_LABEL,
          line: 0,
          message: `missing export function ${name}`,
        });
      }
    }
  } catch {
    return [{ file: SCOPE_FILE_LABEL, line: 0, message: "missing branded system scope module" }];
  }
  return violations;
}

// ─── Orchestration ──────────────────────────────────────────────────────────

async function main() {
  const violations: TenantApiViolation[] = [];
  const start = performance.now();

  const fullScan = process.argv.includes("--full") || process.argv.includes("--all");

  // ── Rule 1a: Implementation files (parallel) ──────────────────────────────
  await Promise.all(
    POSITIONAL_SCAN_FILES.map((file) =>
      Promise.resolve().then(() => checkPositionalTenantId(file, violations)),
    ),
  );

  // ── Rule 1b: Interface declarations ───────────────────────────────────────
  checkInterfaceBlocks(violations);

  // ── Rule 2: bypassTenantCheck (parallel across files) ──────────────────────
  const changedFiles = fullScan ? [] : getChangedSourceFiles();
  const allTsFiles =
    changedFiles.length > 0 ? changedFiles.map((f) => join(ROOT, f)) : collectTsFiles(SRC);

  if (changedFiles.length > 0) {
    console.log(`  Incremental scan: ${changedFiles.length} changed file(s)`);
  } else {
    console.log(`  Full scan: ${allTsFiles.length} file(s)`);
  }

  // Process in parallel batches to avoid overwhelming memory with ts-morph projects
  for (let i = 0; i < allTsFiles.length; i += CONCURRENCY) {
    const batch = allTsFiles.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map((file) =>
        Promise.resolve().then(() => {
          try {
            checkBypassAllowlist(file, violations);
          } catch {
            /* parse errors — skip */
          }
        }),
      ),
    );
  }

  // ── Rule 3: Auto-bypass defaults (parallel) ───────────────────────────────
  await Promise.all(
    FAIL_CLOSED_SURFACES.filter((f) => existsSync(f)).map((file) =>
      Promise.resolve().then(() => checkAutoBypassDefaults(file, violations)),
    ),
  );

  // ── Rule 4: Branded scope exports ─────────────────────────────────────────
  checkScopeExports(violations);

  const elapsed = (performance.now() - start).toFixed(0);

  // ── Report ────────────────────────────────────────────────────────────────
  if (violations.length) {
    console.error(`\n❌ Tenant API lint: ${violations.length} violation(s) in ${elapsed}ms\n`);
    for (const v of violations) {
      console.error(`  ${v.file}`);
    }
    console.error("");
    process.exit(1);
  }

  console.log(
    `✅ Tenant API lint: options-last + systemScope brand + fail-closed themes/jobs + bypass allowlist OK (${elapsed}ms)`,
  );
  process.exit(0);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error("Fatal lint error:", err);
    process.exit(2);
  });
}
