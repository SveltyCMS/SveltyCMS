#!/usr/bin/env bun
/**
 * @file scripts/check/analyze-linkmap.ts
 * @description Vite 8 / Rolldown TypeScript AST & Module-Graph Linkmap Analyzer for SveltyCMS.
 *
 * Features:
 * - Uses TypeScript's native AST parser (`ts.createSourceFile`) for accurate import/export extraction
 * - Explicit allowlist with documented reasons for SvelteKit, 3-pillar widget, plugin, email, and worker conventions
 * - Separates static client reachability from dynamic `import()` edges to detect true static client->server leaks
 * - Tracks 6 hard gate counters (`runtimeCycleCount`, `passThroughBarrelCount`, `clientServerLeakCount`,
 *   `dataLayerInversions`, `clientNodeLeaks`, `testInvariantViolations`)
 * - Ratchets 3 advisory counters (cross-route smuggling, deep relative imports, zombie islands)
 * - Protects public-API barrels: a barrel with runtime consumers that disappears fails the gate
 * - `--check` gate fails when a hard counter rises, an advisory rises, or a public-API barrel is removed
 * - Incremental extraction cache (size+mtime per file): `--changed` re-parses only changed files
 * - `--no-cache` forces a full re-parse; `--cache-stats` prints reuse telemetry
 */

import { existsSync, globSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { pathAliases } from "../../path-aliases";
import { isClientEntrypoint, isServerOnlyPath } from "../lint/lib/module-boundary";

// Re-exported for existing callers/fixtures: the definition lives in
// `scripts/lint/lib/module-boundary.ts` so the AST gates cannot drift.
export { isClientEntrypoint, isServerOnlyPath } from "../lint/lib/module-boundary";

export interface ImportEdge {
  specifier: string;
  resolvedPath: string | null;
  isTypeOnly: boolean;
  isDynamic: boolean;
  isReExport: boolean;
  importedSymbols: string[];
}

export interface ExportedSymbol {
  name: string;
  isTypeOnly: boolean;
  line: number;
}

export interface ModuleNode {
  relPath: string;
  ext: ".ts" | ".svelte";
  loc: number;
  bytes: number;
  area: string;
  allowlistReason: string | null;
  isClientEntry: boolean;
  isServerOnly: boolean;
  isBarrel: boolean;
  isReExportBridge: boolean;
  hasTopLevelSideEffects: boolean;
  imports: ImportEdge[];
  exports: ExportedSymbol[];
  runtimeImporters: string[];
  staticRuntimeImporters: string[];
  typeImporters: string[];
  testImporters: string[];
}

export interface BarrelCandidate {
  relPath: string;
  loc: number;
  reExportCount: number;
  ownExportCount: number;
  runtimeFanIn: number;
  testFanIn: number;
  transitiveRuntimeModules: number;
  /** Runtime + test importers that depend on this entry point. */
  consumerCount: number;
  /** True when at least one runtime module imports the barrel (a public API). */
  publicApi: boolean;
  category: "pass-through-barrel" | "mixed-barrel" | "re-export-bridge";
}

export interface SingleCallerCandidate {
  childPath: string;
  childLoc: number;
  parentPath: string;
  parentLoc: number;
  sameDirectory: boolean;
  sameArea: boolean;
  testImporterCount: number;
}

export interface UnusedSymbolCandidate {
  relPath: string;
  symbolName: string;
  line: number;
  usedInTestsOnly: boolean;
}

export interface CycleGroup {
  nodes: string[];
  size: number;
}

export interface ClientBoundaryFinding {
  relPath: string;
  loc: number;
  bytes: number;
  staticClientImporters: string[];
  runtimeServerImporters: string[];
  isStaticServerLeak: boolean;
  reason: string;
}

export type SmellKind =
  | "zombie-island"
  | "cross-route-smuggling"
  | "data-layer-inversion"
  | "client-node-leak"
  | "deep-relative-import"
  | "test-invariant-violation";

export interface ArchitecturalSmell {
  kind: SmellKind;
  file: string;
  detail: string;
  severity: "error" | "warning";
}

export interface SmellSummary {
  zombieIslands: number;
  crossRouteSmugglings: number;
  dataLayerInversions: number;
  clientNodeLeaks: number;
  deepRelativeImports: number;
  testInvariantViolations: number;
  /**
   * Shared client+server modules above the review threshold. Advisory and
   * ratcheted: the number may fall freely, never rise. It is filled in by
   * `analyzeWorkspaceLinkmap` after the boundary pass (the smell detector does
   * not compute the review list).
   */
  clientBoundaryCandidates: number;
}

export interface LinkmapSummary {
  generatedAt: string;
  totalFiles: number;
  totalLoc: number;
  totalBytes: number;
  runtimeEdgeCount: number;
  typeEdgeCount: number;
  barrelCount: number;
  passThroughBarrelCount: number;
  reExportBridgeCount: number;
  microFileCount: number;
  singleCallerCount: number;
  sameDirUntestedSingleCallerCount: number;
  orphanFileCount: number;
  unusedRuntimeExportCount: number;
  testOnlyRuntimeExportCount: number;
  runtimeCycleCount: number;
  clientServerLeakCount: number;
  clientReachableFiles: number;
  clientReachableKB: number;
  byArea: Record<
    string,
    {
      files: number;
      loc: number;
      microFiles: number;
      barrels: number;
      singleCallers: number;
    }
  >;
  smellSummary?: SmellSummary;
  /** Non-entry barrels that at least one runtime module imports (protected entry points). */
  publicApiBarrelPaths: string[];
}

export interface LinkmapSourceInput {
  path: string;
  source: string;
}

export interface LinkmapOptions {
  /** Reuse per-file extraction when size + mtime are unchanged (default: true). */
  useCache?: boolean;
  /** Already-read sources from a shared loader (avoids re-reading for a second gate). */
  sources?: readonly LinkmapSourceInput[];
  /** Override the cache file path (defaults to `tests/benchmarks/results/linkmap-file-cache.json`). */
  cachePath?: string;
  /**
   * Explain one module (client/server classification, reachability, importers,
   * smells, allowlist reason). The result is attached as `report.explain`; the
   * full node graph is never serialized.
   */
  explainPath?: string;
}

/** One file's extraction result, cached by size+mtime so `--changed` only re-parses changed files. */
export interface CachedFileAnalysis {
  relPath: string;
  bytes: number;
  mtimeMs: number;
  loc: number;
  ext: ".ts" | ".svelte";
  area: string;
  isBarrel: boolean;
  isReExportBridge: boolean;
  isClientEntry: boolean;
  isServerOnly: boolean;
  hasTopLevelSideEffects: boolean;
  reExportCount: number;
  ownExportCount: number;
  allowlistReason: string | null;
  imports: ImportEdge[];
  exports: ExportedSymbol[];
  deepRelativeImports: string[];
}

interface LinkmapFileCache {
  version: 1;
  srcFileListHash: string;
  files: Record<string, CachedFileAnalysis>;
}

export interface LinkmapReport {
  summary: LinkmapSummary;
  barrels: BarrelCandidate[];
  singleCallers: SingleCallerCandidate[];
  orphanFiles: Array<{ relPath: string; loc: number; area: string; testImporterCount: number }>;
  unusedExports: UnusedSymbolCandidate[];
  runtimeCycles: CycleGroup[];
  clientServerLeaks: ClientBoundaryFinding[];
  clientBoundaryReviewCandidates: ClientBoundaryFinding[];
  smells: ArchitecturalSmell[];
  /** Present only when `options.explainPath` was supplied (`--explain`). */
  explain?: ModuleExplain;
}

/** Answer to "why is this file classified/reported this way?" (`--explain`). */
export interface ModuleExplain {
  relPath: string;
  found: boolean;
  classification?: {
    area: string;
    loc: number;
    bytes: number;
    clientEntry: boolean;
    serverOnly: boolean;
    barrel: boolean;
    reExportBridge: boolean;
    allowlistReason: string | null;
  };
  reachability?: {
    staticClient: boolean;
    server: boolean;
    runtimeImporters: string[];
    staticClientImporters: string[];
    testImporterCount: number;
  };
  /** Why the file was or was not reported as an orphan / smell / candidate. */
  findings?: {
    orphan: boolean;
    clientServerLeak: boolean;
    clientBoundaryCandidate: boolean;
    deepRelativeImports: number;
    unusedRuntimeExports: string[];
    smells: Array<{ kind: string; severity: string; detail: string }>;
  };
  notes: string[];
}

export interface GateCheckResult {
  passed: boolean;
  violations: string[];
  deltas: Array<{
    key: "runtimeCycleCount" | "passThroughBarrelCount" | "clientServerLeakCount";
    label: string;
    baseline: number;
    current: number;
    delta: number;
  }>;
  /** Advisory counters are ratcheted: they may fall freely, never rise. */
  advisoryDeltas: Array<{
    key:
      | "crossRouteSmugglings"
      | "deepRelativeImports"
      | "zombieIslands"
      | "clientBoundaryCandidates";
    label: string;
    baseline: number;
    current: number;
    delta: number;
  }>;
  /**
   * Static client bundle budget. Growth is allowed up to `allowance` (a small
   * tolerance over the baseline); anything above it is a violation, so a real
   * bundle regression cannot hide behind the noise of a rename.
   */
  budgetDeltas: Array<{
    key: "clientReachableKB" | "clientReachableFiles";
    label: string;
    baseline: number;
    current: number;
    delta: number;
    allowance: number;
  }>;
  /** Public-API barrels present in the baseline but missing now (deleted entry point). */
  publicApiRemovals: string[];
}

const ALIAS_ENTRIES = Object.entries(pathAliases).map(([alias, target]) => ({
  alias,
  target: target.replace(/^\.\//, ""),
}));

/**
 * Explicit allowlist with reasons for framework conventions, dynamic registries, and worker entries.
 * Prevents false-positive orphan and single-caller alarms on files required by architectural contract.
 */
export const CONVENTION_ALLOWLIST: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /^src\/hooks\.(?:client|server|ws)\.ts$/,
    reason: "SvelteKit runtime hook entrypoint",
  },
  {
    pattern: /^src\/routes\/(?:.*\/)?\+?(?:page|layout|server|error)(?:\.[^/]+)?\.(?:ts|svelte)$/,
    reason: "SvelteKit route / layout / error module",
  },
  {
    pattern: /^src\/routes\/.*\.remote\.ts$/,
    reason: "SvelteKit 3 remote function RPC module",
  },
  {
    pattern: /^src\/routes\/\(app\)\/dashboard\/widgets\/[^/]+\/index\.svelte$/,
    reason: "Dashboard widget package discovered via import.meta.glob",
  },
  {
    pattern: /^src\/widgets\/(?:core|custom)\/[^/]+\/(?:index\.ts|input\.svelte|display\.svelte)$/,
    reason: "3-pillar widget contract (definition + input + display)",
  },
  {
    pattern: /^src\/plugins\/[^/]+\/index(?:\.server)?\.ts$/,
    reason: "Plugin manifest / server lifecycle entrypoint",
  },
  {
    pattern: /^src\/plugins\/[^/]+\/(?:components|ui)\/[^/]+\.svelte$/,
    reason: "Plugin UI slot / column component loaded via manifest or import.meta.glob",
  },
  {
    pattern: /^src\/plugins\/webmcp\/init(?:\.server)?\.ts$/,
    reason: "WebMCP client/server bootstrap entrypoint",
  },
  {
    pattern: /^src\/plugins\/smart-importer\/cli\.ts$/,
    reason: "Package CLI entrypoint (`bun run migrate`)",
  },
  {
    pattern: /^src\/components\/emails\/[^/]+\.svelte$/,
    reason: "Email template rendered dynamically by better-svelte-email",
  },
  {
    pattern: /^src\/databases\/(?:sqlite|postgresql|mariadb|mongodb)\/.*adapter\.ts$/,
    reason: "Database engine adapter entrypoint",
  },
  {
    pattern: /^src\/services\/background\/background-(?:entry|supervisor|runtime-env)\.ts$/,
    reason: "Standalone esbuild background worker / supervisor entrypoint (vite.config.ts)",
  },
  {
    pattern: /^src\/services\/collaboration\/yjs-sync-server\.ts$/,
    reason: "Standalone esbuild Yjs collaboration server entrypoint (vite.config.ts)",
  },
  {
    pattern: /^src\/services\/ai-client\/ai\.worker\.ts$/,
    reason: "Browser Web Worker entrypoint loaded via new URL(..., import.meta.url)",
  },
  {
    pattern: /^src\/services\/ai-client\/index\.ts$/,
    reason: "Client-side LiteRT.js ML inference library entrypoint",
  },
  {
    pattern: /^src\/content\/module-worker\.server\.ts$/,
    reason: "Node Worker thread copied by copyWorkerFilePlugin (vite.config.ts)",
  },
  {
    pattern: /^src\/databases\/auth\/index\.ts$/,
    reason: "Auth subsystem entry barrel (implementation in auth-service.ts)",
  },
  {
    pattern: /^src\/components\/ui\/[^/]+\.svelte$/,
    reason: "Design-system UI primitive (@components/ui)",
  },
  {
    pattern: /^src\/components\/image-editor\/widgets\/[^/]+\/index\.ts$/,
    reason: "Image editor tool widget manifest entry",
  },
  {
    pattern: /^src\/utils\/reactive-search-params\.svelte\.ts$/,
    reason: "Standard reactive URL search params rune helper (AGENTS.md §3.10)",
  },
  {
    pattern: /^src\/widgets\/custom\/seo\/components\/[^/]+\.svelte$/,
    reason: "SEO widget subcomponents (heatmap, meta-input, robots-meta-input, previews)",
  },
  {
    pattern: /^src\/widgets\/core\/rich-text\/components\/[^/]+\.svelte$/,
    reason: "Rich text widget dialog and editor subcomponents",
  },
  {
    pattern: /^src\/widgets\/missing-widget\.svelte$/,
    reason: "Widget fallback placeholder component for unresolvable widgets",
  },
  {
    pattern: /^src\/routes\/\(app\)\/dashboard\/widget-sdk\.ts$/,
    reason: "Dashboard widget SDK contract and developer utility barrel",
  },
  {
    pattern: /^src\/utils\/offline-draft-sync\.ts$/,
    reason: "Offline draft sync / PWA optimistic sync contract",
  },
  {
    pattern:
      /^src\/plugins\/smart-importer\/(?:ai-co-pilot|blueprints|hooks|polish|utils\/[^/]+)\.ts$/,
    reason: "Smart Importer migration engine and AI copilot modules",
  },
  {
    pattern: /^src\/utils\/(?:vite-plugin-[^/]+|setup-check-fast|v8-shim)\.ts$/,
    reason: "Vite config / package.json sideEffects bootstrap utility",
  },
];

const toKebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

export function getAllowlistReason(relPath: string): string | null {
  for (const entry of CONVENTION_ALLOWLIST) {
    if (entry.pattern.test(relPath)) return entry.reason;
  }
  return null;
}

export function isFrameworkOrConfigEntrypoint(relPath: string): boolean {
  return getAllowlistReason(relPath) !== null;
}

/**
 * Strips comments safely while preserving line count.
 */
export function stripCommentsPreserveLines(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, "");
}

/**
 * Extract script blocks AND template dynamic `import(...)` expressions from `.svelte` files,
 * or return full source for `.ts`.
 */
export function extractAnalyzableCode(source: string, ext: ".ts" | ".svelte"): string {
  if (ext === ".ts") return source;
  const blocks: string[] = [];
  const scriptRe = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  for (let m = scriptRe.exec(source); m; m = scriptRe.exec(source)) {
    blocks.push(m[1] ?? "");
  }
  // Also capture `{#await import('...')}` in Svelte markup outside <script>
  const withoutScripts = source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  const templateImports: string[] = [];
  const dynRe = /\bimport\s*\(\s*["']([^"'\n]+)["']\s*\)/g;
  for (let m = dynRe.exec(withoutScripts); m; m = dynRe.exec(withoutScripts)) {
    templateImports.push(`import("${m[1]}");`);
  }
  if (templateImports.length > 0) {
    blocks.push(templateImports.join("\n"));
  }
  return blocks.join("\n");
}

/**
 * Resolve a module specifier to a workspace-relative path (`src/...`).
 */
export function resolveSpecifier(
  specifier: string,
  importerRelPath: string,
  knownFiles: ReadonlySet<string>,
): string | null {
  if (!specifier || specifier.startsWith("node:") || specifier.startsWith("bun:")) return null;
  if (
    specifier.startsWith("$app/") ||
    specifier.startsWith("$env/") ||
    specifier.startsWith("\0")
  ) {
    return null;
  }

  let candidateBase: string | null = null;

  if (specifier.startsWith("/src/")) {
    candidateBase = specifier.slice(1);
  } else {
    for (const { alias, target } of ALIAS_ENTRIES) {
      if (specifier === alias) {
        candidateBase = target;
        break;
      }
      if (specifier.startsWith(`${alias}/`)) {
        candidateBase = `${target}/${specifier.slice(alias.length + 1)}`;
        break;
      }
    }
  }

  if (!candidateBase && specifier.startsWith(".")) {
    const dir = path.posix.dirname(importerRelPath);
    candidateBase = path.posix.normalize(path.posix.join(dir, specifier));
  }

  if (!candidateBase) return null;

  const cleanBase = candidateBase.split("?")[0]!;

  const candidates = [
    cleanBase,
    `${cleanBase}.ts`,
    `${cleanBase}/index.ts`,
    `${cleanBase}.svelte`,
    `${cleanBase}.svelte.ts`,
    `${cleanBase}/index.svelte`,
  ];

  if (cleanBase.endsWith(".js")) {
    const stem = cleanBase.slice(0, -3);
    candidates.push(`${stem}.ts`, `${stem}.svelte.ts`);
  }

  for (const c of candidates) {
    if (knownFiles.has(c)) return c;
  }

  return null;
}

function hasExportModifier(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) return false;
  const mods = ts.getModifiers(node);
  return Boolean(mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));
}

function hasDefaultModifier(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) return false;
  const mods = ts.getModifiers(node);
  return Boolean(mods?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword));
}

const UI_BARREL_SPEC = ["@components", "ui"].join("/");

/**
 * Parse imports, re-exports, dynamic `import()`, and widget string paths using TypeScript AST.
 */
export function extractImportsAndExportsAst(
  code: string,
  importerRelPath: string,
  ext: ".ts" | ".svelte",
  knownFiles: ReadonlySet<string>,
): {
  imports: ImportEdge[];
  exports: ExportedSymbol[];
  ownExportCount: number;
  deepRelativeImports: string[];
  barrelImports: string[];
  livePathImports: string[];
} {
  const sf = ts.createSourceFile(
    importerRelPath,
    code,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS,
  );

  const imports: ImportEdge[] = [];
  const exports: ExportedSymbol[] = [];
  const seenExports = new Set<string>();
  const deepRelativeImports: string[] = [];
  const barrelImports: string[] = [];
  const livePathImports: string[] = [];
  let ownExportCount = 0;

  const addExport = (name: string, isTypeOnly: boolean, pos: number, isOwn: boolean) => {
    if (isOwn && !isTypeOnly) ownExportCount++;
    if (!name || seenExports.has(name)) return;
    seenExports.add(name);
    const line = sf.getLineAndCharacterOfPosition(pos).line + 1;
    exports.push({ name, isTypeOnly, line });
  };

  if (ext === ".svelte") {
    exports.push({ name: "default", isTypeOnly: false, line: 1 });
  }

  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
      const specifier = stmt.moduleSpecifier.text;
      const clause = stmt.importClause;
      let isTypeOnly = Boolean(clause?.isTypeOnly);
      const importedSymbols: string[] = [];

      if (clause) {
        if (clause.name) {
          importedSymbols.push("default");
        }
        if (clause.namedBindings) {
          if (ts.isNamespaceImport(clause.namedBindings)) {
            importedSymbols.push("*");
          } else if (ts.isNamedImports(clause.namedBindings)) {
            const elems = clause.namedBindings.elements;
            let typeElemCount = 0;
            for (const el of elems) {
              if (el.isTypeOnly) typeElemCount++;
              importedSymbols.push((el.propertyName ?? el.name).text);
            }
            if (!isTypeOnly && !clause.name && elems.length > 0 && typeElemCount === elems.length) {
              isTypeOnly = true;
            }
          }
        }
      }

      if (
        specifier.startsWith("../../..") &&
        !importerRelPath.startsWith("tests/") &&
        !importerRelPath.startsWith("scripts/") &&
        !(
          importerRelPath.startsWith("src/utils/compilation/") &&
          specifier === "../../../path-aliases.ts"
        )
      ) {
        deepRelativeImports.push(specifier);
      }
      if (specifier === UI_BARREL_SPEC || specifier === "./src/components/ui") {
        barrelImports.push(specifier);
      }
      if (
        (specifier === "@config/private" ||
          specifier === "./config/private" ||
          specifier.endsWith("config/private.ts") ||
          specifier.endsWith("config/private")) &&
        !specifier.includes("config/private.test")
      ) {
        livePathImports.push(specifier);
      }

      if (specifier === UI_BARREL_SPEC || specifier === "./src/components/ui") {
        for (const sym of importedSymbols) {
          const directFile = `src/components/ui/${toKebab(sym)}.svelte`;
          if (knownFiles.has(directFile)) {
            imports.push({
              specifier: `${UI_BARREL_SPEC}/${toKebab(sym)}.svelte`,
              resolvedPath: directFile,
              isTypeOnly,
              isDynamic: false,
              isReExport: false,
              importedSymbols: ["default"],
            });
          }
        }
        continue;
      }

      const resolvedPath = resolveSpecifier(specifier, importerRelPath, knownFiles);
      imports.push({
        specifier,
        resolvedPath,
        isTypeOnly,
        isDynamic: false,
        isReExport: false,
        importedSymbols,
      });
      continue;
    }

    if (ts.isExportDeclaration(stmt)) {
      const isTypeOnlyBlock = stmt.isTypeOnly;
      const specifier =
        stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)
          ? stmt.moduleSpecifier.text
          : null;

      const importedSymbols: string[] = [];
      let allElementsTypeOnly = isTypeOnlyBlock;

      if (!stmt.exportClause) {
        importedSymbols.push("*");
      } else if (ts.isNamespaceExport(stmt.exportClause)) {
        importedSymbols.push("*");
        addExport(
          stmt.exportClause.name.text,
          isTypeOnlyBlock,
          stmt.getStart(sf),
          specifier === null,
        );
      } else if (ts.isNamedExports(stmt.exportClause)) {
        const elems = stmt.exportClause.elements;
        let typeElemCount = 0;
        for (const el of elems) {
          const elemTypeOnly = isTypeOnlyBlock || el.isTypeOnly;
          if (elemTypeOnly) typeElemCount++;
          importedSymbols.push((el.propertyName ?? el.name).text);
          addExport(el.name.text, elemTypeOnly, el.getStart(sf), specifier === null);
        }
        if (!isTypeOnlyBlock && elems.length > 0 && typeElemCount === elems.length) {
          allElementsTypeOnly = true;
        }
      }

      if (specifier) {
        const resolvedPath = resolveSpecifier(specifier, importerRelPath, knownFiles);
        imports.push({
          specifier,
          resolvedPath,
          isTypeOnly: allElementsTypeOnly,
          isDynamic: false,
          isReExport: true,
          importedSymbols,
        });
      }
      continue;
    }

    if (ext === ".ts") {
      if (ts.isExportAssignment(stmt)) {
        addExport("default", false, stmt.getStart(sf), true);
        continue;
      }

      if (hasExportModifier(stmt)) {
        if (hasDefaultModifier(stmt)) {
          addExport("default", false, stmt.getStart(sf), true);
        }
        if (
          (ts.isFunctionDeclaration(stmt) ||
            ts.isClassDeclaration(stmt) ||
            ts.isEnumDeclaration(stmt)) &&
          stmt.name
        ) {
          addExport(stmt.name.text, false, stmt.getStart(sf), true);
        } else if (
          (ts.isInterfaceDeclaration(stmt) || ts.isTypeAliasDeclaration(stmt)) &&
          stmt.name
        ) {
          addExport(stmt.name.text, true, stmt.getStart(sf), false);
        } else if (ts.isVariableStatement(stmt)) {
          for (const decl of stmt.declarationList.declarations) {
            if (ts.isIdentifier(decl.name)) {
              addExport(decl.name.text, false, decl.getStart(sf), true);
            } else if (
              ts.isObjectBindingPattern(decl.name) ||
              ts.isArrayBindingPattern(decl.name)
            ) {
              for (const el of decl.name.elements) {
                if (ts.isBindingElement(el) && ts.isIdentifier(el.name)) {
                  addExport(el.name.text, false, el.getStart(sf), true);
                }
              }
            }
          }
        }
      }
    }
  }

  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length >= 1 &&
      ts.isStringLiteral(node.arguments[0]!)
    ) {
      const specifier = node.arguments[0]!.text;
      const resolvedPath = resolveSpecifier(specifier, importerRelPath, knownFiles);
      imports.push({
        specifier,
        resolvedPath,
        isTypeOnly: false,
        isDynamic: true,
        isReExport: false,
        importedSymbols: ["*"],
      });
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    ) {
      const specifier = node.argument.literal.text;
      const resolvedPath = resolveSpecifier(specifier, importerRelPath, knownFiles);
      const sym = node.qualifier && ts.isIdentifier(node.qualifier) ? node.qualifier.text : "*";
      imports.push({
        specifier,
        resolvedPath,
        isTypeOnly: true,
        isDynamic: false,
        isReExport: false,
        importedSymbols: [sym],
      });
    } else if (ts.isStringLiteral(node)) {
      const val = node.text;
      if (
        (val.startsWith("/src/widgets/") || val.startsWith("@widgets/")) &&
        val.endsWith(".svelte")
      ) {
        const resolvedPath = resolveSpecifier(val, importerRelPath, knownFiles);
        if (resolvedPath) {
          imports.push({
            specifier: val,
            resolvedPath,
            isTypeOnly: false,
            isDynamic: true,
            isReExport: false,
            importedSymbols: ["default"],
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);

  return {
    imports,
    exports,
    ownExportCount,
    deepRelativeImports,
    barrelImports,
    livePathImports,
  };
}

export function extractImports(
  code: string,
  importerRelPath: string,
  knownFiles: ReadonlySet<string>,
): ImportEdge[] {
  const ext: ".ts" | ".svelte" = importerRelPath.endsWith(".svelte") ? ".svelte" : ".ts";
  return extractImportsAndExportsAst(code, importerRelPath, ext, knownFiles).imports;
}

export function extractExports(code: string, ext: ".ts" | ".svelte"): ExportedSymbol[] {
  return extractImportsAndExportsAst(code, `virtual${ext}`, ext, new Set()).exports;
}

export function detectTopLevelSideEffects(code: string, ext: ".ts" | ".svelte"): boolean {
  if (ext === ".svelte") return true;
  const cleaned = stripCommentsPreserveLines(code);
  return (
    /\b(?:setInterval|setTimeout)\s*\(/.test(cleaned) ||
    /\bglobalThis\.\w+\s*=/.test(cleaned) ||
    /\bprocess\.on\s*\(/.test(cleaned)
  );
}

/**
 * Tarjan's Strongly Connected Components algorithm on static runtime value edges.
 */
export function findRuntimeCycles(nodes: ReadonlyMap<string, ModuleNode>): CycleGroup[] {
  let index = 0;
  const indices = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const cycles: CycleGroup[] = [];

  function strongConnect(v: string) {
    indices.set(v, index);
    lowlink.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);

    const node = nodes.get(v);
    if (node) {
      for (const edge of node.imports) {
        if (edge.isTypeOnly || edge.isDynamic || !edge.resolvedPath) continue;
        const w = edge.resolvedPath;
        if (!nodes.has(w) || w === v) continue;
        if (!indices.has(w)) {
          strongConnect(w);
          lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
        } else if (onStack.has(w)) {
          lowlink.set(v, Math.min(lowlink.get(v)!, indices.get(w)!));
        }
      }
    }

    if (lowlink.get(v) === indices.get(v)) {
      const scc: string[] = [];
      while (true) {
        const w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
        if (w === v) break;
      }
      if (scc.length > 1) {
        cycles.push({ nodes: scc.sort(), size: scc.length });
      }
    }
  }

  for (const key of nodes.keys()) {
    if (!indices.has(key)) strongConnect(key);
  }

  return cycles.sort((a, b) => b.size - a.size);
}

function countTransitiveRuntimeDeps(
  startPath: string,
  nodes: ReadonlyMap<string, ModuleNode>,
): number {
  const visited = new Set<string>();
  const queue = [startPath];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (visited.has(curr)) continue;
    visited.add(curr);
    const node = nodes.get(curr);
    if (!node) continue;
    for (const edge of node.imports) {
      if (
        !edge.isTypeOnly &&
        !edge.isDynamic &&
        edge.resolvedPath &&
        nodes.has(edge.resolvedPath)
      ) {
        queue.push(edge.resolvedPath);
      }
    }
  }
  return Math.max(0, visited.size - 1);
}

const NODE_SERVER_PACKAGES: ReadonlySet<string> = new Set([
  "node:fs",
  "node:child_process",
  "node:crypto",
  "node:os",
  "node:stream",
  "node:buffer",
  "node:net",
  "node:http",
  "node:https",
  "node:tls",
  "node:cluster",
  "node:worker_threads",
  "node:dns",
  "node:readline",
  "node:vm",
  "node:zlib",
  "fs",
  "child_process",
  "crypto",
  "os",
  "stream",
  "buffer",
  "net",
  "http",
  "https",
  "tls",
  "cluster",
  "worker_threads",
  "dns",
  "readline",
  "vm",
  "zlib",
  "better-sqlite3",
  "drizzle-orm",
  "sharp",
]);

export function detectArchitecturalSmells(
  nodes: ReadonlyMap<string, ModuleNode>,
  staticClientReachable: ReadonlySet<string>,
  rawDeepRelatives: Array<{ file: string; spec: string }>,
  testViolations: Array<{ file: string; detail: string }>,
): { smells: ArchitecturalSmell[]; summary: SmellSummary } {
  const smells: ArchitecturalSmell[] = [];

  // 1. Test Invariant Violations
  for (const tv of testViolations) {
    smells.push({
      kind: "test-invariant-violation",
      file: tv.file,
      detail: tv.detail,
      severity: "error",
    });
  }

  // 2. Data Layer Inversions (UI components or client templates directly importing DB adapters)
  for (const node of nodes.values()) {
    const isUi = node.ext === ".svelte" || node.relPath.startsWith("src/components/");
    if (!isUi) continue;
    for (const edge of node.imports) {
      if (edge.isTypeOnly || !edge.resolvedPath) continue;
      if (
        /^(?:src\/)?databases\/(?:sqlite|postgresql|mariadb|mongodb|core\/sql-adapter-core|db(?:\.ts)?$)/.test(
          edge.resolvedPath,
        )
      ) {
        smells.push({
          kind: "data-layer-inversion",
          file: node.relPath,
          detail: `UI component directly imports database adapter: ${edge.resolvedPath}`,
          severity: "error",
        });
      }
    }
  }

  // 3. Client Server/Node Leaks (Node built-in or server-only packages in static client closure)
  for (const relPath of staticClientReachable) {
    const node = nodes.get(relPath);
    if (!node) continue;
    for (const edge of node.imports) {
      if (edge.isTypeOnly) continue;
      const spec = edge.specifier;
      const isNodeOrServer = spec.startsWith("node:") || NODE_SERVER_PACKAGES.has(spec);
      if (isNodeOrServer) {
        smells.push({
          kind: "client-node-leak",
          file: node.relPath,
          detail: `Static client module imports server/Node package: ${spec}`,
          severity: "error",
        });
      }
    }
  }

  // 4. Cross-Route Sibling Boundary Smuggling
  const routePrefix = /^src\/routes\/(?:\(app\)\/)?([^/]+)\//;
  for (const node of nodes.values()) {
    const mFrom = node.relPath.match(routePrefix);
    if (!mFrom) continue;
    const featureA = mFrom[1];
    for (const edge of node.imports) {
      if (!edge.resolvedPath) continue;
      const mTo = edge.resolvedPath.match(routePrefix);
      if (
        mTo &&
        mTo[1] !== featureA &&
        !edge.resolvedPath.endsWith("+layout.svelte") &&
        !edge.resolvedPath.endsWith("+layout.server.ts")
      ) {
        smells.push({
          kind: "cross-route-smuggling",
          file: node.relPath,
          detail: `Route imports internal module from sibling route '${mTo[1]}': ${edge.resolvedPath}`,
          severity: "warning",
        });
      }
    }
  }

  // 5. Deep Relative Imports (>=3 directory hops bypassing path aliases)
  for (const dr of rawDeepRelatives) {
    smells.push({
      kind: "deep-relative-import",
      file: dr.file,
      detail: `Relative import '${dr.spec}' bypasses path aliases (use @src, @utils, @widgets, etc.)`,
      severity: "warning",
    });
  }

  // 6. Zombie Islands (Connected unreachable subgraphs)
  const roots: string[] = [];
  for (const node of nodes.values()) {
    if (
      node.isClientEntry ||
      isFrameworkOrConfigEntrypoint(node.relPath) ||
      node.relPath.startsWith("src/routes/") ||
      node.relPath === "src/index.ts"
    ) {
      roots.push(node.relPath);
    }
  }

  const live = new Set<string>();
  const queue = [...roots];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (live.has(curr)) continue;
    live.add(curr);
    const node = nodes.get(curr);
    if (!node) continue;
    for (const edge of node.imports) {
      if (edge.isTypeOnly || !edge.resolvedPath) continue;
      if (!live.has(edge.resolvedPath)) queue.push(edge.resolvedPath);
    }
  }

  let zombieCount = 0;
  for (const node of nodes.values()) {
    if (live.has(node.relPath) || node.allowlistReason !== null) continue;
    if (node.runtimeImporters.length > 0) {
      zombieCount++;
      smells.push({
        kind: "zombie-island",
        file: node.relPath,
        detail: `Unreachable dead-cluster module imported by ${node.runtimeImporters.join(", ")}`,
        severity: "warning",
      });
    }
  }

  const summary: SmellSummary = {
    zombieIslands: zombieCount,
    crossRouteSmugglings: smells.filter((s) => s.kind === "cross-route-smuggling").length,
    dataLayerInversions: smells.filter((s) => s.kind === "data-layer-inversion").length,
    clientNodeLeaks: smells.filter((s) => s.kind === "client-node-leak").length,
    deepRelativeImports: smells.filter((s) => s.kind === "deep-relative-import").length,
    testInvariantViolations: smells.filter((s) => s.kind === "test-invariant-violation").length,
    clientBoundaryCandidates: 0,
  };

  return { smells, summary };
}

/**
 * Run the full linkmap analysis across the workspace.
 */
export const LINKMAP_FILE_CACHE_PATH = "tests/benchmarks/results/linkmap-file-cache.json";

export interface LinkmapCacheStats {
  hits: number;
  misses: number;
  total: number;
}

let lastCacheStats: LinkmapCacheStats = { hits: 0, misses: 0, total: 0 };

/** Cache telemetry for the last `analyzeWorkspaceLinkmap` call (printed by `--changed`). */
export function getLastLinkmapCacheStats(): LinkmapCacheStats {
  return lastCacheStats;
}

/** FNV-1a over the sorted file list — adding/removing a file invalidates resolved edges. */
function hashFileList(paths: readonly string[]): string {
  let hash = 0x81_1c_9d_c5;
  for (const entry of paths) {
    for (let i = 0; i < entry.length; i++) {
      hash ^= entry.charCodeAt(i);
      hash = Math.imul(hash, 0x01_00_01_93) >>> 0;
    }
    hash ^= 0x2f;
    hash = Math.imul(hash, 0x01_00_01_93) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function loadFileCache(cachePath: string): LinkmapFileCache | null {
  try {
    if (!existsSync(cachePath)) return null;
    const parsed = JSON.parse(readFileSync(cachePath, "utf8")) as LinkmapFileCache;
    if (parsed?.version !== 1 || typeof parsed.files !== "object" || parsed.files === null) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeFileCache(cachePath: string, cache: LinkmapFileCache): void {
  try {
    mkdirSync(path.dirname(cachePath), { recursive: true });
    writeFileSync(cachePath, `${JSON.stringify(cache)}\n`);
  } catch {
    // The cache is an optimization; a read-only checkout must still pass.
  }
}

export function analyzeWorkspaceLinkmap(
  rootDir = process.cwd(),
  options: LinkmapOptions = {},
): LinkmapReport {
  const allSrcFiles = globSync("src/**/*.{ts,svelte}", { cwd: rootDir })
    .map((f) => f.replace(/\\/g, "/"))
    .filter(
      (f) =>
        !f.startsWith("src/paraglide/") &&
        !f.endsWith(".d.ts") &&
        !f.includes("/tests/") &&
        !f.endsWith(".test.ts") &&
        !f.endsWith(".spec.ts"),
    );

  const testFiles = [
    ...globSync("tests/**/*.{ts,svelte}", { cwd: rootDir }),
    ...globSync("src/**/tests/**/*.{ts,svelte}", { cwd: rootDir }),
    ...globSync("src/**/*.{test,spec}.ts", { cwd: rootDir }),
    ...globSync("scripts/**/*.ts", { cwd: rootDir }),
  ].map((f) => f.replace(/\\/g, "/"));

  const knownSrcFiles = new Set<string>(allSrcFiles);
  const nodes = new Map<string, ModuleNode>();
  const ownExportCounts = new Map<string, number>();
  const allDeepRelatives: Array<{ file: string; spec: string }> = [];

  // Incremental extraction: a file is re-parsed only when its size or mtime
  // changed. Cached edges stay valid because the resolved targets depend on the
  // file list, which is hashed into the cache header. `--changed` therefore
  // re-analyses the changed files and reuses the rest.
  const useCache = options.useCache !== false;
  const cachePath = path.resolve(rootDir, options.cachePath ?? LINKMAP_FILE_CACHE_PATH);
  const fileListHash = hashFileList(allSrcFiles);
  const cachedFiles = useCache ? loadFileCache(cachePath) : null;
  const cacheValid = cachedFiles?.srcFileListHash === fileListHash;
  const nextCache: Record<string, CachedFileAnalysis> = {};
  const providedSources = options.sources
    ? new Map(options.sources.map((entry) => [entry.path, entry.source]))
    : null;
  let cacheHits = 0;
  let cacheMisses = 0;

  for (const relPath of allSrcFiles) {
    const absPath = path.join(rootDir, relPath);
    const stat = statSync(absPath);
    const cached = cacheValid ? cachedFiles?.files[relPath] : undefined;
    const ext: ".ts" | ".svelte" = relPath.endsWith(".svelte") ? ".svelte" : ".ts";
    let analysis: CachedFileAnalysis;

    if (cached && cached.bytes === stat.size && cached.mtimeMs === stat.mtimeMs) {
      analysis = cached;
      cacheHits++;
    } else {
      const source = providedSources?.get(relPath) ?? readFileSync(absPath, "utf8");
      const loc = source.split("\n").length;
      const cleanCode = extractAnalyzableCode(source, ext);
      const { imports, exports, ownExportCount, deepRelativeImports } = extractImportsAndExportsAst(
        cleanCode,
        relPath,
        ext,
        knownSrcFiles,
      );
      const parts = relPath.split("/");
      const area = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : relPath;
      const isBarrel = relPath.endsWith("/index.ts");
      const reExportCount = imports.filter((i) => i.isReExport).length;
      analysis = {
        relPath,
        bytes: stat.size,
        mtimeMs: stat.mtimeMs,
        loc,
        ext,
        area,
        isBarrel,
        isReExportBridge: !isBarrel && reExportCount > 0 && ownExportCount === 0,
        isClientEntry: isClientEntrypoint(relPath),
        isServerOnly: isServerOnlyPath(relPath),
        hasTopLevelSideEffects: detectTopLevelSideEffects(cleanCode, ext),
        reExportCount,
        ownExportCount,
        allowlistReason: getAllowlistReason(relPath),
        imports,
        exports,
        deepRelativeImports,
      };
      cacheMisses++;
    }

    nextCache[relPath] = analysis;
    ownExportCounts.set(relPath, analysis.ownExportCount);
    for (const spec of analysis.deepRelativeImports) {
      allDeepRelatives.push({ file: relPath, spec });
    }
    nodes.set(relPath, {
      relPath,
      ext: analysis.ext,
      loc: analysis.loc,
      bytes: analysis.bytes,
      area: analysis.area,
      allowlistReason: analysis.allowlistReason,
      isClientEntry: analysis.isClientEntry,
      isServerOnly: analysis.isServerOnly,
      isBarrel: analysis.isBarrel,
      isReExportBridge: analysis.isReExportBridge,
      hasTopLevelSideEffects: analysis.hasTopLevelSideEffects,
      imports: analysis.imports,
      exports: analysis.exports,
      runtimeImporters: [],
      staticRuntimeImporters: [],
      typeImporters: [],
      testImporters: [],
    });
  }

  if (useCache) {
    writeFileCache(cachePath, { version: 1, srcFileListHash: fileListHash, files: nextCache });
  }
  lastCacheStats = { hits: cacheHits, misses: cacheMisses, total: allSrcFiles.length };

  const runtimeUsedSymbols = new Map<string, Set<string>>();
  const testUsedSymbols = new Map<string, Set<string>>();
  for (const relPath of allSrcFiles) {
    runtimeUsedSymbols.set(relPath, new Set());
    testUsedSymbols.set(relPath, new Set());
  }

  const markSymbolUsageRecursive = (
    targetPath: string,
    symbols: readonly string[],
    usageMap: Map<string, Set<string>>,
    visited = new Set<string>(),
  ) => {
    const visitKey = `${targetPath}:${symbols.join(",")}`;
    if (visited.has(visitKey)) return;
    visited.add(visitKey);

    const set = usageMap.get(targetPath);
    if (set) {
      for (const s of symbols) set.add(s);
    }

    const node = nodes.get(targetPath);
    if (!node) return;
    const isWildcard = symbols.includes("*");

    for (const edge of node.imports) {
      if (!edge.isReExport || !edge.resolvedPath) continue;
      if (isWildcard || edge.importedSymbols.includes("*")) {
        markSymbolUsageRecursive(edge.resolvedPath, ["*"], usageMap, visited);
      } else {
        const overlap = edge.importedSymbols.filter((s) => symbols.includes(s));
        if (overlap.length > 0) {
          markSymbolUsageRecursive(edge.resolvedPath, overlap, usageMap, visited);
        }
      }
    }
  };

  let runtimeEdgeCount = 0;
  let typeEdgeCount = 0;

  for (const node of nodes.values()) {
    for (const edge of node.imports) {
      if (!edge.resolvedPath) continue;
      const target = nodes.get(edge.resolvedPath);
      if (!target) continue;

      if (edge.isTypeOnly) {
        typeEdgeCount++;
        if (!target.typeImporters.includes(node.relPath)) {
          target.typeImporters.push(node.relPath);
        }
      } else {
        runtimeEdgeCount++;
        if (!target.runtimeImporters.includes(node.relPath)) {
          target.runtimeImporters.push(node.relPath);
        }
        if (!edge.isDynamic && !target.staticRuntimeImporters.includes(node.relPath)) {
          target.staticRuntimeImporters.push(node.relPath);
        }
        markSymbolUsageRecursive(target.relPath, edge.importedSymbols, runtimeUsedSymbols);
      }
    }
  }

  const testViolations: Array<{ file: string; detail: string }> = [];
  for (const testRelPath of testFiles) {
    const absPath = path.join(rootDir, testRelPath);
    let source = "";
    try {
      source = readFileSync(absPath, "utf8");
    } catch {
      continue;
    }
    const ext: ".ts" | ".svelte" = testRelPath.endsWith(".svelte") ? ".svelte" : ".ts";
    const cleanCode = extractAnalyzableCode(source, ext);
    const {
      imports: edges,
      barrelImports,
      livePathImports,
    } = extractImportsAndExportsAst(cleanCode, testRelPath, ext, knownSrcFiles);

    const isExemptTest =
      testRelPath.includes("invariants.test.ts") ||
      testRelPath.includes("analyze-linkmap.test.ts") ||
      testRelPath.includes("lint-live-paths.test.ts") ||
      testRelPath.includes("private-config-policy.test.ts");

    if (barrelImports.length > 0 && !isExemptTest) {
      testViolations.push({
        file: testRelPath,
        detail: `Test imports forbidden @components/ui barrel instead of direct primitive: ${barrelImports.join(", ")}`,
      });
    }
    if (livePathImports.length > 0 && !isExemptTest) {
      testViolations.push({
        file: testRelPath,
        detail: `Test imports live config/private.ts instead of test fixture: ${livePathImports.join(", ")}`,
      });
    }

    for (const edge of edges) {
      if (!edge.resolvedPath) continue;
      const target = nodes.get(edge.resolvedPath);
      if (!target) continue;
      if (!target.testImporters.includes(testRelPath)) {
        target.testImporters.push(testRelPath);
      }
      markSymbolUsageRecursive(target.relPath, edge.importedSymbols, testUsedSymbols);
    }
  }

  // Static Client Reachability BFS (follows STATIC runtime edges only — no dynamic imports!)
  const staticClientReachable = new Set<string>();
  const clientQueue: string[] = [];
  for (const node of nodes.values()) {
    if (node.isClientEntry) {
      clientQueue.push(node.relPath);
    }
  }
  while (clientQueue.length > 0) {
    const curr = clientQueue.shift()!;
    if (staticClientReachable.has(curr)) continue;
    staticClientReachable.add(curr);
    const node = nodes.get(curr);
    if (!node) continue;
    for (const edge of node.imports) {
      // Follow static runtime edges only (`!edge.isDynamic`).
      // Allow walking into `.remote.ts`? No, SvelteKit compiles `.remote.ts` to RPC stubs.
      if (edge.isTypeOnly || edge.isDynamic || !edge.resolvedPath) continue;
      if (edge.resolvedPath.endsWith(".remote.ts")) continue;
      const target = nodes.get(edge.resolvedPath);
      if (!target) continue;
      clientQueue.push(target.relPath);
    }
  }

  // Server Reachability BFS (starts from server-only entry/adapter/hook modules)
  const serverReachable = new Set<string>();
  const serverQueue: string[] = [];
  for (const node of nodes.values()) {
    if (node.isServerOnly) {
      serverQueue.push(node.relPath);
    }
  }
  while (serverQueue.length > 0) {
    const curr = serverQueue.shift()!;
    if (serverReachable.has(curr)) continue;
    serverReachable.add(curr);
    const node = nodes.get(curr);
    if (!node) continue;
    for (const edge of node.imports) {
      if (edge.isTypeOnly || !edge.resolvedPath) continue;
      const target = nodes.get(edge.resolvedPath);
      if (!target) continue;
      serverQueue.push(target.relPath);
    }
  }

  // Barrels & re-export bridges
  const barrels: BarrelCandidate[] = [];
  for (const node of nodes.values()) {
    if (!node.isBarrel && !node.isReExportBridge) continue;
    if (node.allowlistReason !== null) continue;
    const reExportCount = node.imports.filter((i) => i.isReExport).length;
    const ownCount = ownExportCounts.get(node.relPath) ?? 0;
    const category: BarrelCandidate["category"] = node.isReExportBridge
      ? "re-export-bridge"
      : reExportCount > 0 && ownCount === 0
        ? "pass-through-barrel"
        : "mixed-barrel";

    barrels.push({
      relPath: node.relPath,
      loc: node.loc,
      reExportCount,
      ownExportCount: ownCount,
      runtimeFanIn: node.runtimeImporters.length,
      testFanIn: node.testImporters.length,
      transitiveRuntimeModules: countTransitiveRuntimeDeps(node.relPath, nodes),
      consumerCount: node.runtimeImporters.length + node.testImporters.length,
      publicApi: node.runtimeImporters.length > 0,
      category,
    });
  }
  barrels.sort(
    (a, b) =>
      b.transitiveRuntimeModules - a.transitiveRuntimeModules || b.runtimeFanIn - a.runtimeFanIn,
  );

  // Single-caller merge candidates & orphan files (excluding allowlisted conventions!)
  const singleCallers: SingleCallerCandidate[] = [];
  const orphanFiles: Array<{
    relPath: string;
    loc: number;
    area: string;
    testImporterCount: number;
  }> = [];

  for (const node of nodes.values()) {
    if (node.allowlistReason !== null) continue;

    if (node.runtimeImporters.length === 0 && node.typeImporters.length === 0) {
      orphanFiles.push({
        relPath: node.relPath,
        loc: node.loc,
        area: node.area,
        testImporterCount: node.testImporters.length,
      });
      continue;
    }

    if (node.runtimeImporters.length === 1 && node.typeImporters.length <= 1) {
      const parentPath = node.runtimeImporters[0]!;
      if (node.typeImporters.length === 1 && node.typeImporters[0] !== parentPath) continue;
      const parentNode = nodes.get(parentPath);
      if (!parentNode) continue;

      const sameDirectory = path.posix.dirname(node.relPath) === path.posix.dirname(parentPath);
      const sameArea = node.area === parentNode.area;

      singleCallers.push({
        childPath: node.relPath,
        childLoc: node.loc,
        parentPath,
        parentLoc: parentNode.loc,
        sameDirectory,
        sameArea,
        testImporterCount: node.testImporters.length,
      });
    }
  }
  singleCallers.sort((a, b) => {
    if (a.sameDirectory !== b.sameDirectory) return a.sameDirectory ? -1 : 1;
    if ((a.testImporterCount === 0) !== (b.testImporterCount === 0)) {
      return a.testImporterCount === 0 ? -1 : 1;
    }
    return a.childLoc - b.childLoc;
  });

  // Unused runtime exported symbols
  const unusedExports: UnusedSymbolCandidate[] = [];
  for (const node of nodes.values()) {
    if (node.allowlistReason !== null || node.ext === ".svelte" || node.isBarrel) continue;
    const usedRuntime = runtimeUsedSymbols.get(node.relPath) ?? new Set();
    if (usedRuntime.has("*")) continue;
    const usedTests = testUsedSymbols.get(node.relPath) ?? new Set();

    for (const exp of node.exports) {
      if (exp.isTypeOnly) continue;
      if (!usedRuntime.has(exp.name)) {
        unusedExports.push({
          relPath: node.relPath,
          symbolName: exp.name,
          line: exp.line,
          usedInTestsOnly: usedTests.has(exp.name) || usedTests.has("*"),
        });
      }
    }
  }

  // Runtime cycles
  const runtimeCycles = findRuntimeCycles(nodes);

  // Client boundary analysis (Static Server Leaks vs Shared Review Candidates)
  const clientServerLeaks: ClientBoundaryFinding[] = [];
  const clientBoundaryReviewCandidates: ClientBoundaryFinding[] = [];

  for (const relPath of staticClientReachable) {
    const node = nodes.get(relPath);
    if (!node || node.isClientEntry) continue;

    const staticClientImp = node.staticRuntimeImporters.filter((p) => staticClientReachable.has(p));
    const serverImp = node.runtimeImporters.filter((p) => serverReachable.has(p));

    // A true static client->server leak is a server-only module (`.server.ts`, `src/databases/**`,
    // `src/hooks/**`, `src/plugins/*/server/**`) reached via static client imports!
    if (node.isServerOnly) {
      clientServerLeaks.push({
        relPath: node.relPath,
        loc: node.loc,
        bytes: node.bytes,
        staticClientImporters: staticClientImp,
        runtimeServerImporters: serverImp,
        isStaticServerLeak: true,
        reason: `Server-only module reached via static client edge from ${staticClientImp.join(", ") || "entry"}`,
      });
      continue;
    }

    if (
      node.ext === ".ts" &&
      (relPath.startsWith("src/utils/") ||
        relPath.startsWith("src/services/") ||
        relPath.startsWith("src/content/")) &&
      staticClientImp.length > 0 &&
      serverImp.length > 0 &&
      node.loc >= 120
    ) {
      clientBoundaryReviewCandidates.push({
        relPath: node.relPath,
        loc: node.loc,
        bytes: node.bytes,
        staticClientImporters: staticClientImp,
        runtimeServerImporters: serverImp,
        isStaticServerLeak: false,
        reason: `Shared across ${staticClientImp.length} static client and ${serverImp.length} server module(s) (${Math.round(node.bytes / 1024)} KB source)`,
      });
    }
  }
  clientServerLeaks.sort((a, b) => b.bytes - a.bytes);
  clientBoundaryReviewCandidates.sort((a, b) => b.bytes - a.bytes);

  // Area breakdown & summary
  const byArea: LinkmapSummary["byArea"] = {};
  let totalLoc = 0;
  let totalBytes = 0;
  let microFileCount = 0;
  let clientReachableBytes = 0;

  for (const node of nodes.values()) {
    totalLoc += node.loc;
    totalBytes += node.bytes;
    if (node.loc < 60) microFileCount++;
    if (staticClientReachable.has(node.relPath)) clientReachableBytes += node.bytes;

    const bucket = (byArea[node.area] ??= {
      files: 0,
      loc: 0,
      microFiles: 0,
      barrels: 0,
      singleCallers: 0,
    });
    bucket.files++;
    bucket.loc += node.loc;
    if (node.loc < 60) bucket.microFiles++;
    if (node.isBarrel || node.isReExportBridge) bucket.barrels++;
  }

  for (const sc of singleCallers) {
    const node = nodes.get(sc.childPath);
    if (node && byArea[node.area]) {
      byArea[node.area]!.singleCallers++;
    }
  }

  const { smells, summary: smellSummary } = detectArchitecturalSmells(
    nodes,
    staticClientReachable,
    allDeepRelatives,
    testViolations,
  );
  // Filled after the boundary pass: the review list is computed above, not by
  // the smell detector (which cannot see `serverReachable`).
  smellSummary.clientBoundaryCandidates = clientBoundaryReviewCandidates.length;

  const summary: LinkmapSummary = {
    generatedAt: new Date().toISOString(),
    totalFiles: nodes.size,
    totalLoc,
    totalBytes,
    runtimeEdgeCount,
    typeEdgeCount,
    barrelCount: barrels.length,
    passThroughBarrelCount: barrels.filter((b) => b.category === "pass-through-barrel").length,
    reExportBridgeCount: barrels.filter((b) => b.category === "re-export-bridge").length,
    microFileCount,
    singleCallerCount: singleCallers.length,
    sameDirUntestedSingleCallerCount: singleCallers.filter(
      (s) => s.sameDirectory && s.testImporterCount === 0 && s.childLoc <= 60,
    ).length,
    orphanFileCount: orphanFiles.length,
    unusedRuntimeExportCount: unusedExports.filter((u) => !u.usedInTestsOnly).length,
    testOnlyRuntimeExportCount: unusedExports.filter((u) => u.usedInTestsOnly).length,
    runtimeCycleCount: runtimeCycles.length,
    clientServerLeakCount: clientServerLeaks.length,
    clientReachableFiles: staticClientReachable.size,
    clientReachableKB: Math.round(clientReachableBytes / 1024),
    byArea,
    smellSummary,
    publicApiBarrelPaths: barrels
      .filter((candidate) => candidate.publicApi)
      .map((candidate) => candidate.relPath)
      .sort(),
  };

  let explain: ModuleExplain | undefined;
  const requestedExplain = options.explainPath?.replace(/\\/g, "/").replace(/^\.\//, "");
  if (requestedExplain) {
    const node = nodes.get(requestedExplain);
    if (!node) {
      explain = {
        relPath: requestedExplain,
        found: false,
        notes: [
          "Not analysed: the linkmap covers `src/**/*.{ts,svelte}` only (paraglide output, `.d.ts` and tests are excluded).",
        ],
      };
    } else {
      const staticClientImporters = node.staticRuntimeImporters
        .filter((p) => staticClientReachable.has(p))
        .sort();
      const unusedForFile = unusedExports
        .filter((u) => u.relPath === node.relPath)
        .map((u) => u.symbolName)
        .sort();
      const fileSmells = smells
        .filter((s) => s.file === node.relPath)
        .map((s) => ({ kind: s.kind, severity: s.severity, detail: s.detail }));
      const orphan = orphanFiles.some((o) => o.relPath === node.relPath);
      const leak = clientServerLeaks.some((l) => l.relPath === node.relPath);
      const candidate = clientBoundaryReviewCandidates.some((c) => c.relPath === node.relPath);
      const notes: string[] = [];

      if (node.isServerOnly) {
        notes.push(
          "Classified server-only by convention/tree, so a static edge from the client graph is a hard leak.",
        );
      }
      if (node.isClientEntry) {
        notes.push("Client entrypoint: it starts the static client closure.");
      }
      if (node.allowlistReason) {
        notes.push(`Allowlisted from orphan/smell findings: ${node.allowlistReason}`);
      }
      if (orphan) {
        notes.push("No runtime importer and no test importer: reported as an orphan candidate.");
      }
      if (leak) {
        notes.push("Reported as a static client→server leak (hard gate).");
      }
      if (candidate) {
        notes.push(
          "Shared by static client and server modules above the review threshold (advisory ratchet).",
        );
      }
      if (staticClientImporters.length === 0 && !node.isClientEntry) {
        notes.push("Not statically reachable from a client entrypoint.");
      }

      explain = {
        relPath: node.relPath,
        found: true,
        classification: {
          area: node.area,
          loc: node.loc,
          bytes: node.bytes,
          clientEntry: node.isClientEntry,
          serverOnly: node.isServerOnly,
          barrel: node.isBarrel,
          reExportBridge: node.isReExportBridge,
          allowlistReason: node.allowlistReason,
        },
        reachability: {
          staticClient: staticClientReachable.has(node.relPath),
          server: serverReachable.has(node.relPath),
          runtimeImporters: [...node.runtimeImporters].sort(),
          staticClientImporters,
          testImporterCount: node.testImporters.length,
        },
        findings: {
          orphan,
          clientServerLeak: leak,
          clientBoundaryCandidate: candidate,
          deepRelativeImports: allDeepRelatives.filter((r) => r.file === node.relPath).length,
          unusedRuntimeExports: unusedForFile,
          smells: fileSmells,
        },
        notes,
      };
    }
  }

  return {
    summary,
    barrels,
    singleCallers,
    orphanFiles,
    unusedExports,
    runtimeCycles,
    clientServerLeaks,
    clientBoundaryReviewCandidates,
    smells,
    ...(explain ? { explain } : {}),
  };
}

/**
 * Static client bundle budget: 0.5 % of the baseline, with a small absolute
 * floor so rounding/platform noise never fails the gate. Growth above the
 * allowance is a violation; shrinking is always allowed.
 */
const CLIENT_BUNDLE_TOLERANCE_RATIO = 0.005;
const CLIENT_BUNDLE_TOLERANCE_FLOOR = 4;

export function clientBundleAllowance(baseline: number): number {
  return (
    baseline +
    Math.max(CLIENT_BUNDLE_TOLERANCE_FLOOR, Math.ceil(baseline * CLIENT_BUNDLE_TOLERANCE_RATIO))
  );
}

/**
 * Hard invariants: any increase over the baseline fails the gate. These are the
 * only counters that are trustworthy enough to gate on (no heuristics).
 * The CLI report and the ratchet read this array, so a label can never drift
 * between "what failed" and "what was printed".
 */
export const HARD_GATES = [
  {
    key: "runtimeCycleCount",
    label: "Runtime Import Cycles (SCC)",
    displayLabel: "Runtime Import Cycles (SCC)",
  },
  {
    key: "passThroughBarrelCount",
    label: "Pass-Through Barrels",
    displayLabel: "Pass-Through Barrels",
  },
  {
    key: "clientServerLeakCount",
    label: "Server-Only Modules in Static Client Graph",
    displayLabel: "Static Client->Server Leaks",
  },
] as const;

type HardSmellKey = "dataLayerInversions" | "clientNodeLeaks" | "testInvariantViolations";

/** Smell counters that are hard-fail when non-zero (no baseline needed). */
export const HARD_SMELL_GATES: ReadonlyArray<{
  key: HardSmellKey;
  label: string;
  displayLabel: string;
  message: (count: number) => string;
}> = [
  {
    key: "dataLayerInversions",
    label: "UI Data Layer Inversions",
    displayLabel: "UI Data Layer Inversions",
    message: (count) =>
      `UI components directly import database adapters (${count} inversions detected)`,
  },
  {
    key: "clientNodeLeaks",
    label: "Client Node/Server Leaks",
    displayLabel: "Client Node/Server Leaks",
    message: (count) =>
      `Static client graph imports Node/server packages (${count} leaks detected)`,
  },
  {
    key: "testInvariantViolations",
    label: "Test Invariant Violations",
    displayLabel: "Test Invariant Violations",
    message: (count) => `Test files violate invariants (${count} violations detected)`,
  },
];

/** Advisories are ratcheted: a count may fall freely, never rise. */
export const ADVISORY_GATES = [
  { key: "crossRouteSmugglings", label: "Cross-Route Boundary Smugglings" },
  { key: "deepRelativeImports", label: "Deep Relative Imports (>=3 hops)" },
  { key: "zombieIslands", label: "Zombie Island Modules (Dead Clusters)" },
  { key: "clientBoundaryCandidates", label: "Client/Server Shared Review Candidates" },
] as const;

/** Static client bundle budget (0.5 % tolerance, +4 absolute floor). */
export const BUDGET_GATES = [
  { key: "clientReachableKB", label: "Static Client-Reachable Source (KB)" },
  { key: "clientReachableFiles", label: "Static Client-Reachable Files" },
] as const;

/**
 * Evaluates the ratcheted counters against the baseline, plus architectural
 * hard invariants and the static client bundle budget.
 */
export function evaluateLinkmapGate(
  current: LinkmapSummary,
  baseline: LinkmapSummary,
): GateCheckResult {
  const violations: string[] = [];
  const deltas = HARD_GATES.map(({ key, label }) => {
    const baseVal = Number(baseline[key] ?? 0);
    const currVal = Number(current[key] ?? 0);
    const delta = currVal - baseVal;
    if (delta > 0) {
      violations.push(`${label} increased from ${baseVal} to ${currVal} (+${delta})`);
    }
    return { key, label, baseline: baseVal, current: currVal, delta };
  });

  if (current.smellSummary) {
    for (const { key, message } of HARD_SMELL_GATES) {
      const count = current.smellSummary[key];
      if (count > 0) violations.push(message(count));
    }
  }

  // Advisories are ratcheted: a count may fall freely, never rise. Enforcement
  // starts once a baseline carrying `smellSummary` exists.
  const advisoryBaseline = baseline.smellSummary;
  const advisoryDeltas = ADVISORY_GATES.map(({ key, label }) => {
    const baseVal = Number(advisoryBaseline?.[key] ?? 0);
    const currVal = Number(current.smellSummary?.[key] ?? 0);
    const delta = currVal - baseVal;
    if (advisoryBaseline && delta > 0) {
      violations.push(`${label} increased from ${baseVal} to ${currVal} (+${delta})`);
    }
    return { key, label, baseline: baseVal, current: currVal, delta };
  });

  // Static client bundle budget. The tolerance absorbs a renamed identifier or a
  // new import line; it cannot absorb the ~47 KB preset split being undone.
  const budgetDeltas = BUDGET_GATES.map(({ key, label }) => {
    const baseVal = Number(baseline[key] ?? 0);
    const currVal = Number(current[key] ?? 0);
    const delta = currVal - baseVal;
    const allowance = clientBundleAllowance(baseVal);
    if (baseVal > 0 && delta > 0 && currVal > allowance) {
      violations.push(
        `${label} exceeded its budget: ${currVal} > ${allowance} (baseline ${baseVal}, +${delta})`,
      );
    }
    return { key, label, baseline: baseVal, current: currVal, delta, allowance };
  });

  // A public API barrel is an entry point with runtime consumers. Deleting or
  // renaming one breaks every consumer at once (the smart-table incident), so a
  // barrel recorded in the baseline must still exist.
  const publicApiRemovals: string[] = [];
  if (Array.isArray(baseline.publicApiBarrelPaths)) {
    const currentPublic = new Set(current.publicApiBarrelPaths ?? []);
    for (const relPath of baseline.publicApiBarrelPaths) {
      if (!currentPublic.has(relPath)) {
        publicApiRemovals.push(relPath);
        violations.push(`Public API barrel removed or no longer imported: ${relPath}`);
      }
    }
  }

  return {
    passed: violations.length === 0,
    violations,
    deltas,
    advisoryDeltas,
    budgetDeltas,
    publicApiRemovals,
  };
}

export function compareWithBaseline(
  current: LinkmapSummary,
  baseline: LinkmapSummary,
): Array<{ metric: string; base: number; curr: number; delta: number; gated: boolean }> {
  const rows: Array<{
    getter: (s: LinkmapSummary) => number;
    label: string;
    gated: boolean;
  }> = [
    // Gated rows are generated from the same constants the ratchet reads.
    ...HARD_GATES.map(({ key, displayLabel }) => ({
      getter: (s: LinkmapSummary) => s[key],
      label: `🔒 ${displayLabel}`,
      gated: true,
    })),
    ...HARD_SMELL_GATES.map(({ key, displayLabel }) => ({
      getter: (s: LinkmapSummary) => s.smellSummary?.[key] ?? 0,
      label: `🔒 ${displayLabel}`,
      gated: true,
    })),
    {
      getter: (s) => s.totalFiles,
      label: "Total Source Files",
      gated: false,
    },
    {
      getter: (s) => s.totalLoc,
      label: "Total Source LOC",
      gated: false,
    },
    {
      getter: (s) => s.barrelCount,
      label: "All Non-Entry Barrels & Bridges",
      gated: false,
    },
    {
      getter: (s) => s.sameDirUntestedSingleCallerCount,
      label: "Actionable 1-Caller (<60 LOC, 0 tests)",
      gated: false,
    },
    {
      getter: (s) => s.orphanFileCount,
      label: "Actionable Orphan Modules",
      gated: false,
    },
    {
      getter: (s) => s.unusedRuntimeExportCount,
      label: "Unused Runtime Exports (0 callers)",
      gated: false,
    },
    {
      getter: (s) => s.testOnlyRuntimeExportCount,
      label: "Test-Only Runtime Exports",
      gated: false,
    },
    ...ADVISORY_GATES.map(({ key, label }) => ({
      getter: (s: LinkmapSummary) => s.smellSummary?.[key] ?? 0,
      label,
      gated: false,
    })),
    ...BUDGET_GATES.map(({ key, label }) => ({
      getter: (s: LinkmapSummary) => s[key],
      label: `🔒 ${label} (budget)`,
      gated: true,
    })),
  ];
  return rows.map(({ getter, label, gated }) => {
    const base = Number(getter(baseline) ?? 0);
    const curr = Number(getter(current) ?? 0);
    return { metric: label, base, curr, delta: curr - base, gated };
  });
}

export interface WorkspaceGateEvaluation {
  gate: GateCheckResult;
  baselineSummary: LinkmapSummary;
  initialSummary: LinkmapSummary | null;
}

/**
 * Loads the numeric, advisory and public-API baselines and evaluates the gate.
 * Shared by the CLI and `run-ast-gates.ts`, so both apply the same ratchet.
 * Returns null when no numeric baseline exists (first checkout).
 */
export function evaluateAgainstBaseline(
  rootDir: string,
  report: LinkmapReport,
): WorkspaceGateEvaluation | null {
  // Tracked baselines make the gate effective on a fresh CI checkout. The
  // legacy `tests/benchmarks/results/` files are gitignored, so they remain a
  // developer fallback only (the previous gate passed vacuously in CI).
  const trackedDir = path.join(rootDir, "scripts", "check", "baselines");
  const legacyDir = path.join(rootDir, "tests", "benchmarks", "results");

  const readJson = <T>(filePath: string): T | null => {
    try {
      return existsSync(filePath) ? (JSON.parse(readFileSync(filePath, "utf8")) as T) : null;
    } catch {
      return null;
    }
  };

  const readFirst = <T>(fileNames: readonly string[]): T | null => {
    for (const fileName of fileNames) {
      const value = readJson<T>(fileName);
      if (value) return value;
    }
    return null;
  };

  type BaselineFile = LinkmapSummary | { summary: LinkmapSummary };
  const rawBaseline = readFirst<BaselineFile>([
    path.join(trackedDir, "linkmap-baseline.json"),
    path.join(legacyDir, "linkmap-baseline.json"),
  ]);
  if (!rawBaseline) return null;
  const baseSummary = "summary" in rawBaseline ? rawBaseline.summary : rawBaseline;
  const baselineSummary: LinkmapSummary = { ...baseSummary };

  const advisoryBase = readFirst<{ smellSummary?: SmellSummary }>([
    path.join(trackedDir, "linkmap-advisory-baseline.json"),
    path.join(legacyDir, "linkmap-advisory-baseline.json"),
  ]);
  if (advisoryBase?.smellSummary) baselineSummary.smellSummary = advisoryBase.smellSummary;

  const publicApiBase = readFirst<{ paths?: string[] }>([
    path.join(trackedDir, "linkmap-public-api.json"),
    path.join(legacyDir, "linkmap-public-api.json"),
  ]);
  if (Array.isArray(publicApiBase?.paths)) {
    baselineSummary.publicApiBarrelPaths = publicApiBase.paths;
  }

  const rawInitial = readFirst<BaselineFile>([
    path.join(trackedDir, "linkmap-initial-baseline.json"),
    path.join(legacyDir, "linkmap-initial-baseline.json"),
  ]);
  const initialSummary = rawInitial
    ? "summary" in rawInitial
      ? rawInitial.summary
      : rawInitial
    : null;

  return {
    gate: evaluateLinkmapGate(report.summary, baselineSummary),
    baselineSummary,
    initialSummary,
  };
}

function printCliReport(report: LinkmapReport): void {
  const { summary } = report;
  console.log("\n🗺️  SVELTYCMS — VITE 8 / AST MODULE LINKMAP REPORT");
  console.log("═".repeat(76));
  console.log(`  🔒 Runtime Import Cycles (SCC):       ${summary.runtimeCycleCount}`);
  console.log(
    `  🔒 Pass-Through Barrels:              ${summary.passThroughBarrelCount} (of ${summary.barrelCount} total non-entry barrels)`,
  );
  console.log(`  🔒 Static Client->Server Leaks:       ${summary.clientServerLeakCount}`);
  if (summary.smellSummary) {
    console.log(
      `  🔒 UI Data Layer Inversions:          ${summary.smellSummary.dataLayerInversions}`,
    );
    console.log(`  🔒 Client Node/Server Leaks:          ${summary.smellSummary.clientNodeLeaks}`);
    console.log(
      `  🔒 Test Invariant Violations:         ${summary.smellSummary.testInvariantViolations}`,
    );
  }
  console.log("─".repeat(76));
  console.log(
    `  Total Source Files:                   ${summary.totalFiles} (${summary.totalLoc.toLocaleString()} LOC)`,
  );
  console.log(
    `  Runtime / Type Edges:                 ${summary.runtimeEdgeCount} runtime / ${summary.typeEdgeCount} type-only`,
  );
  console.log(
    `  Actionable 1-Callers (≤60 LOC, 0 tst): ${summary.sameDirUntestedSingleCallerCount} (of ${summary.singleCallerCount} total 1-caller files)`,
  );
  console.log(`  Actionable Orphan Modules:            ${summary.orphanFileCount}`);
  console.log(
    `  Unused Runtime Exports:               ${summary.unusedRuntimeExportCount} dead + ${summary.testOnlyRuntimeExportCount} test-only`,
  );
  console.log(
    `  Static Client-Reachable Graph:        ${summary.clientReachableFiles} files (${summary.clientReachableKB} KB raw source)`,
  );
  console.log(
    `  Public API Barrels (runtime used):    ${summary.publicApiBarrelPaths?.length ?? 0}`,
  );
  if (summary.smellSummary) {
    console.log(
      `  Architectural Smells (Advisory):      ${summary.smellSummary.crossRouteSmugglings} cross-route, ${summary.smellSummary.deepRelativeImports} deep-rel, ${summary.smellSummary.zombieIslands} zombie islands`,
    );
  }
  console.log("═".repeat(76));

  if (summary.smellSummary && report.smells && report.smells.length > 0) {
    const errors = report.smells.filter((s) => s.severity === "error");
    if (errors.length > 0) {
      console.log("\n🚨 Hard Invariant Violations:");
      for (const e of errors) {
        console.log(`  [${e.kind}] ${e.file}: ${e.detail}`);
      }
    }

    const warnings = report.smells.filter((s) => s.severity === "warning");
    if (
      warnings.length > 0 &&
      (process.argv.includes("--smells") || process.argv.includes("--audit"))
    ) {
      console.log(`\n⚠️  Architectural Smells Inventory (${warnings.length}):`);
      for (const w of warnings.slice(0, 30)) {
        console.log(`  [${w.kind.padEnd(22)}] ${w.file}: ${w.detail}`);
      }
    }
  }

  if (report.runtimeCycles.length > 0) {
    console.log("\n🔄 Runtime Import Cycles (Rolldown chunk-merge risk):");
    for (const c of report.runtimeCycles) {
      console.log(`  Cycle (${c.size} files): ${c.nodes.join(" ↔ ")}`);
    }
  }

  if (report.clientServerLeaks.length > 0) {
    console.log("\n🚨 Static Client -> Server-Only Leaks:");
    for (const leak of report.clientServerLeaks) {
      console.log(`  ${leak.relPath} (${leak.loc} LOC) — ${leak.reason}`);
    }
  }

  if (report.barrels.length > 0) {
    console.log("\n📦 Non-Entry Barrels & Bridges:");
    for (const b of report.barrels) {
      console.log(
        `  [${b.category.padEnd(19)}] ${b.relPath.padEnd(48)} fan-in=${b.runtimeFanIn} re-exports=${b.reExportCount} own=${b.ownExportCount} transitive=${b.transitiveRuntimeModules}`,
      );
    }
  }

  const publicApiBarrels = report.barrels.filter((b) => b.publicApi);
  if (
    publicApiBarrels.length > 0 &&
    (process.argv.includes("--smells") || process.argv.includes("--audit"))
  ) {
    console.log(`\n🔌 Public API Barrels (runtime consumers): ${publicApiBarrels.length}`);
    for (const b of publicApiBarrels.slice(0, 25)) {
      console.log(`  ${b.relPath.padEnd(52)} consumers=${b.consumerCount}`);
    }
  }

  const actionableSingleCallers = report.singleCallers.filter(
    (s) => s.sameDirectory && s.testImporterCount === 0 && s.childLoc <= 60,
  );
  if (actionableSingleCallers.length > 0) {
    console.log(
      `\n🔗 Actionable Same-Directory Single-Caller Merges (≤60 LOC, 0 independent tests): ${actionableSingleCallers.length}`,
    );
    for (const sc of actionableSingleCallers.slice(0, 25)) {
      console.log(
        `  ${sc.childPath} (${sc.childLoc} LOC) ──▶ ${sc.parentPath} (${sc.parentLoc} LOC)`,
      );
    }
  }

  if (report.orphanFiles.length > 0) {
    console.log(`\n👻 Actionable Orphan Source Files (${report.orphanFiles.length}):`);
    for (const o of report.orphanFiles.slice(0, 25)) {
      console.log(`  ${o.relPath.padEnd(54)} (${o.loc} LOC, testImporters=${o.testImporterCount})`);
    }
  }

  if (report.clientBoundaryReviewCandidates.length > 0) {
    console.log("\n🌐 Client / Server Shared Review Candidates (Static Edges, >120 LOC):");
    for (const f of report.clientBoundaryReviewCandidates.slice(0, 12)) {
      console.log(`  ${f.relPath.padEnd(48)} (${f.loc} LOC) — ${f.reason}`);
    }
  }
}

/** Parse `--explain <file>` / `--explain=<file>` into a repo-relative path. */
function readExplainArg(argv: readonly string[]): string | undefined {
  const inline = argv.find((arg) => arg.startsWith("--explain="));
  if (inline) return inline.slice("--explain=".length) || undefined;
  const index = argv.indexOf("--explain");
  if (index >= 0) return argv[index + 1];
  return undefined;
}

/** Human-readable `--explain` report; the JSON form rides on `report.explain`. */
function printExplain(explain: ModuleExplain): void {
  console.log(`\n🔎 Explain: ${explain.relPath}`);
  if (!explain.found || !explain.classification || !explain.reachability || !explain.findings) {
    for (const note of explain.notes) console.log(`  • ${note}`);
    return;
  }

  const c = explain.classification;
  const r = explain.reachability;
  const f = explain.findings;
  console.log(`  area: ${c.area} · ${c.loc} LOC · ${Math.round(c.bytes / 1024)} KB`);
  console.log(
    `  client entry: ${c.clientEntry} · server-only: ${c.serverOnly} · barrel: ${c.barrel} · re-export bridge: ${c.reExportBridge}`,
  );
  console.log(`  allowlist: ${c.allowlistReason ?? "—"}`);
  console.log(`  static client-reachable: ${r.staticClient} · server-reachable: ${r.server}`);
  console.log(`  test importers: ${r.testImporterCount}`);
  for (const importer of r.runtimeImporters.slice(0, 10)) console.log(`    ← ${importer}`);
  if (r.runtimeImporters.length > 10) {
    console.log(`    … +${r.runtimeImporters.length - 10} runtime importer(s)`);
  }
  console.log(
    `  findings: orphan=${f.orphan} · client→server leak=${f.clientServerLeak} · boundary candidate=${f.clientBoundaryCandidate} · deep relatives=${f.deepRelativeImports} · unused exports=${f.unusedRuntimeExports.length}`,
  );
  for (const smell of f.smells)
    console.log(`    [${smell.severity}] ${smell.kind}: ${smell.detail}`);
  for (const note of explain.notes) console.log(`  • ${note}`);
}

if (import.meta.main) {
  const isCheck = process.argv.includes("--check");
  const wantsJson = process.argv.includes("--json");
  const useCache = !process.argv.includes("--no-cache");
  const explainPath = readExplainArg(process.argv.slice(2));
  const report = analyzeWorkspaceLinkmap(process.cwd(), { useCache, explainPath });

  if (!wantsJson) {
    printCliReport(report);
    if (report.explain) printExplain(report.explain);
  }

  if (
    !wantsJson &&
    (process.argv.includes("--changed") || process.argv.includes("--cache-stats"))
  ) {
    const stats = getLastLinkmapCacheStats();
    console.log(
      `\n⚡ Incremental extraction: ${stats.hits}/${stats.total} files reused, ${stats.misses} re-parsed (${path.relative(process.cwd(), LINKMAP_FILE_CACHE_PATH)}).`,
    );
  }

  const outDir = path.join(process.cwd(), "tests", "benchmarks", "results");
  mkdirSync(outDir, { recursive: true });
  const saveBaseline = process.argv.includes("--save-baseline");

  const evaluation = saveBaseline ? null : evaluateAgainstBaseline(process.cwd(), report);
  let gateExit = 0;
  if (evaluation) {
    const { gate, baselineSummary, initialSummary } = evaluation;
    const diffs = compareWithBaseline(report.summary, baselineSummary);
    const initialDiffs = initialSummary
      ? new Map(
          compareWithBaseline(report.summary, initialSummary).map((d) => [d.metric, d] as const),
        )
      : null;

    if (!wantsJson) {
      console.log(
        initialDiffs
          ? "\n📊 DELTA VS INITIAL BASELINE & RATCHET GATE (scripts/check/baselines/):"
          : "\n📊 DELTA VS BASELINE (scripts/check/baselines/linkmap-baseline.json):",
      );
      console.log("─".repeat(76));
      for (const d of diffs) {
        const gateSign = d.delta > 0 ? `+${d.delta}` : `${d.delta}`;
        const initRow = initialDiffs?.get(d.metric);
        if (initRow) {
          const netSign = initRow.delta > 0 ? `+${initRow.delta}` : `${initRow.delta}`;
          console.log(
            `  ${d.metric.padEnd(38)} Init:${String(initRow.base).padStart(7)} │ Gate:${String(d.base).padStart(7)} │ Now:${String(d.curr).padStart(7)} │ Net Δ:${netSign.padStart(6)}`,
          );
        } else {
          console.log(
            `  ${d.metric.padEnd(40)} Base: ${String(d.base).padStart(7)} │ Now: ${String(d.curr).padStart(7)} │ Δ: ${gateSign.padStart(6)}`,
          );
        }
      }

      if (baselineSummary.smellSummary) {
        console.log("\n📈 Advisory Ratchet (must not increase):");
        for (const d of gate.advisoryDeltas) {
          const sign = d.delta > 0 ? `+${d.delta}` : `${d.delta}`;
          console.log(
            `  ${d.label.padEnd(40)} Base: ${String(d.baseline).padStart(5)} │ Now: ${String(d.current).padStart(5)} │ Δ: ${sign}`,
          );
        }
      }

      console.log("\n📦 Client Bundle Budget (0.5 % tolerance):");
      for (const d of gate.budgetDeltas) {
        const sign = d.delta > 0 ? `+${d.delta}` : `${d.delta}`;
        console.log(
          `  ${d.label.padEnd(40)} Base: ${String(d.baseline).padStart(5)} │ Now: ${String(d.current).padStart(5)} │ Max: ${String(d.allowance).padStart(5)} │ Δ: ${sign}`,
        );
      }
    }

    if (!gate.passed) {
      console.error("\n❌ Linkmap Gate Failed:");
      for (const v of gate.violations) {
        console.error(`  - ${v}`);
      }
      if (isCheck) gateExit = 1;
    } else if (!wantsJson) {
      console.log(
        "\n✅ Linkmap Gate Passed (no regression on cycles, pass-through barrels, client->server leaks, advisories, public API barrels, or the client bundle budget).",
      );
    }
  }

  if (wantsJson) {
    console.log(
      JSON.stringify(
        {
          summary: report.summary,
          cache: getLastLinkmapCacheStats(),
          gate: evaluation?.gate ?? null,
          baseline: evaluation?.baselineSummary ?? null,
          explain: report.explain ?? null,
        },
        null,
        2,
      ),
    );
  }

  if (!process.argv.includes("--no-write")) {
    // Ratchet baselines live in a tracked directory so CI enforces them. Only an
    // explicit `--save-baseline` rewrites them (a reviewed ratchet commit).
    if (saveBaseline) {
      const trackedDir = path.join(process.cwd(), "scripts", "check", "baselines");
      mkdirSync(trackedDir, { recursive: true });
      writeFileSync(
        path.join(trackedDir, "linkmap-baseline.json"),
        `${JSON.stringify({ version: 1, summary: report.summary }, null, 2)}\n`,
      );
      if (report.summary.smellSummary) {
        writeFileSync(
          path.join(trackedDir, "linkmap-advisory-baseline.json"),
          `${JSON.stringify(
            { generatedAt: report.summary.generatedAt, smellSummary: report.summary.smellSummary },
            null,
            2,
          )}\n`,
        );
      }
      writeFileSync(
        path.join(trackedDir, "linkmap-public-api.json"),
        `${JSON.stringify(
          {
            generatedAt: report.summary.generatedAt,
            paths: report.summary.publicApiBarrelPaths,
          },
          null,
          2,
        )}\n`,
      );
    }

    const targetPath = path.join(outDir, "linkmap-latest.json");
    writeFileSync(targetPath, `${JSON.stringify(report, null, 2)}\n`);
    if (!wantsJson) {
      console.log(`\n💾 Saved linkmap snapshot to ${path.relative(process.cwd(), targetPath)}`);
    }
  }

  if (gateExit !== 0) process.exit(gateExit);
}
