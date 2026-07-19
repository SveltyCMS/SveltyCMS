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

import { join, dirname, resolve, relative, extname } from "node:path";
import { readFileSync, existsSync, statSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { getChangedPaths, resolveDiffBase } from "./precheck-shared";

// ── Failure cache for smart retry across precheck runs ─────────────────
const CACHE_DIR = join(import.meta.dirname, "..", ".precheck-cache");
const FAILURE_CACHE = join(CACHE_DIR, "failed-suites.json");

function saveFailedSuites(suites: { label: string; gate: number; command: string }[]): void {
  try {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(FAILURE_CACHE, JSON.stringify(suites, null, 2), "utf8");
  } catch {
    /* best-effort */
  }
}

function loadFailedSuites(): { label: string; gate: number; command: string }[] | null {
  try {
    if (!existsSync(FAILURE_CACHE)) return null;
    const raw = readFileSync(FAILURE_CACHE, "utf8");
    const data = JSON.parse(raw);
    if (!Array.isArray(data) || data.length === 0) return null;
    return data;
  } catch {
    return null;
  }
}

function clearFailureCache(): void {
  try {
    if (existsSync(FAILURE_CACHE)) writeFileSync(FAILURE_CACHE, "[]", "utf8");
  } catch {}
}

const ALIASES: Record<string, string> = {
  "@src": "src",
  "@components": "src/components",
  "@databases": "src/databases",
  "@config": "config",
  "@utils": "src/utils",
  "@stores": "src/stores",
  "@widgets": "src/widgets",
  "@services": "src/services",
  $paraglide: "src/paraglide",
};

function getAllFiles(dir: string, fileList: string[] = []): string[] {
  if (!existsSync(dir)) return fileList;
  const files = readdirSync(dir);
  for (const file of files) {
    const filePath = join(dir, file);
    if (statSync(filePath).isDirectory()) {
      if (
        file !== "node_modules" &&
        file !== ".git" &&
        file !== ".svelte-kit" &&
        file !== ".compiledCollections"
      ) {
        getAllFiles(filePath, fileList);
      }
    } else {
      const ext = extname(file);
      if (ext === ".ts" || ext === ".js" || ext === ".svelte") {
        fileList.push(filePath);
      }
    }
  }
  return fileList;
}
function toRelativePosix(p: string, root: string): string {
  return relative(root, p).replace(/\\/g, "/");
}

function stripComments(content: string): string {
  // Remove multiline comments
  content = content.replace(/\/\*[\s\S]*?\*\//g, "");
  // Remove single-line comments (ignoring URL protocols like http://)
  content = content.replace(/(?:^|[^:])\/\/.*$/gm, "");
  return content;
}

function extractImports(filePath: string): string[] {
  try {
    const content = readFileSync(filePath, "utf8");

    // Use Bun's native fast transpiler scanning for TS/JS files if available.
    if (typeof Bun !== "undefined" && !filePath.endsWith(".svelte")) {
      const transpiler = new Bun.Transpiler({ loader: filePath.endsWith(".tsx") ? "tsx" : "ts" });
      return transpiler
        .scanImports(content)
        .map((imp: { path: string }) => imp.path)
        .filter((path: string) => !path.startsWith("node:")); // exclude node built-ins
    }

    // Fallback: Comment-stripping regex parser (handles Svelte script blocks or Node environments)
    const cleanContent = stripComments(content);
    const imports: string[] = [];
    let match;

    // 1. Static imports/exports with 'from'
    const fromRegex = /(?:import|export)\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"]/g;
    while ((match = fromRegex.exec(cleanContent)) !== null) {
      imports.push(match[1]);
    }

    // 2. Side-effect imports
    const sideEffectRegex = /import\s+['"]([^'"]+)['"]/g;
    while ((match = sideEffectRegex.exec(cleanContent)) !== null) {
      imports.push(match[1]);
    }

    // 3. Dynamic imports & requires
    const dynamicRegex = /(?:import|require)\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = dynamicRegex.exec(cleanContent)) !== null) {
      imports.push(match[1]);
    }

    return [...new Set(imports)];
  } catch {
    return [];
  }
}

function resolveImport(importPath: string, importerFile: string, root: string): string | null {
  let resolvedPath = "";

  // Check if it matches an alias
  let matchedAlias = false;
  for (const [alias, targetDir] of Object.entries(ALIASES)) {
    if (importPath === alias) {
      resolvedPath = join(root, targetDir);
      matchedAlias = true;
      break;
    } else if (importPath.startsWith(alias + "/")) {
      resolvedPath = join(root, targetDir, importPath.slice(alias.length + 1));
      matchedAlias = true;
      break;
    }
  }

  if (!matchedAlias) {
    if (importPath.startsWith(".") || importPath.startsWith("/")) {
      resolvedPath = resolve(dirname(importerFile), importPath);
    } else {
      return null;
    }
  }

  const candidates = [
    resolvedPath,
    resolvedPath + ".ts",
    resolvedPath + ".js",
    resolvedPath + ".svelte",
    join(resolvedPath, "index.ts"),
    join(resolvedPath, "index.js"),
    join(resolvedPath, "index.svelte"),
  ];

  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) {
      return toRelativePosix(c, root);
    }
  }

  return null;
}

interface DependencyGraph {
  imports: Map<string, Set<string>>;
  importedBy: Map<string, Set<string>>;
}

export function buildDependencyGraph(root: string): DependencyGraph {
  const imports = new Map<string, Set<string>>();
  const importedBy = new Map<string, Set<string>>();

  const allFiles = [
    ...getAllFiles(join(root, "src")),
    ...getAllFiles(join(root, "config")),
    ...getAllFiles(join(root, "tests")),
  ];

  for (const file of allFiles) {
    const relFile = toRelativePosix(file, root);
    const fileImports = extractImports(file);

    for (const impPath of fileImports) {
      const resolved = resolveImport(impPath, file, root);
      if (resolved) {
        if (!imports.has(relFile)) imports.set(relFile, new Set());
        imports.get(relFile)!.add(resolved);

        if (!importedBy.has(resolved)) importedBy.set(resolved, new Set());
        importedBy.get(resolved)!.add(relFile);
      }
    }
  }

  return { imports, importedBy };
}

export function findTransitiveDependents(
  changedFiles: string[],
  graph: DependencyGraph,
): Set<string> {
  const affected = new Set<string>();
  const queue = [...changedFiles];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (affected.has(current)) continue;
    affected.add(current);

    const dependents = graph.importedBy.get(current);
    if (dependents) {
      for (const dep of dependents) {
        if (!affected.has(dep)) {
          queue.push(dep);
        }
      }
    }
  }

  return affected;
}

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
      "src/routes/api/[...path]/handlers/auth.ts",
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
      "src/routes/api/[...path]/handlers/*.ts",
    ],
    command:
      "bun test tests/unit/hooks/authorization.test.ts tests/unit/auth/role-permission-access.test.ts",
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
    gate: 2,
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
    label: "Content Structure Persistence",
    gate: 1,
    patterns: [
      "src/content/**",
      "config/collections/**",
      "src/databases/core/relational-content.ts",
      "src/routes/(app)/config/collectionbuilder/**",
      "src/services/sdk/namespaces/data-operations.ts",
      "src/utils/collection-order.server.ts",
    ],
    command:
      "bun test tests/integration/databases/content-nodes-contract.test.ts tests/unit/content/structure-persistence-db.test.ts tests/unit/content/sync-content-state.test.ts tests/unit/content/upsert-content-nodes.test.ts tests/unit/test-harness/real-db-markers.test.ts tests/unit/test-harness/negative-mock-guard.test.ts",
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
    command: "bun run test:integration -- api --db=sqlite --no-build",
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
  {
    label: "E2E User & Profile",
    gate: 4,
    patterns: [
      "src/routes/(app)/user/**",
      "src/components/ui/avatar.svelte",
      "src/components/ui/checkbox.svelte",
    ],
    command:
      "npx playwright test tests/e2e/routes/user/management.spec.ts tests/e2e/routes/user/profile.spec.ts --project=chromium",
  },
  {
    label: "E2E Media Gallery",
    gate: 4,
    patterns: ["src/routes/(app)/mediagallery/**", "src/components/media/**"],
    command: "npx playwright test tests/e2e/routes/mediagallery/ --project=chromium",
  },
  {
    label: "E2E Collection Builder",
    gate: 4,
    patterns: ["src/routes/(app)/config/collectionbuilder/**"],
    command: "npx playwright test tests/e2e/routes/collection-builder/ --project=chromium",
  },
  {
    label: "E2E Dashboard",
    gate: 4,
    patterns: ["src/routes/(app)/dashboard/**"],
    command: "npx playwright test tests/e2e/routes/dashboard/ --project=chromium",
  },
  {
    label: "E2E Settings & System",
    gate: 4,
    patterns: ["src/routes/(app)/config/**"],
    command:
      "npx playwright test tests/e2e/routes/config/ tests/e2e/routes/system/ --project=chromium",
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

function getChangedFiles(): string[] {
  return getChangedPaths();
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
// Synthetic edges — non-import relationships (codegen, dynamic dispatch)
// ---------------------------------------------------------------------------

/**
 * Some relationships that matter for test selection aren't `import`
 * statements, so buildDependencyGraph() can't see them:
 *
 *   - Generated files (src/content/types.generated.ts) are WRITTEN by the
 *     Vite plugin that reads collection schema sources. There's no import
 *     edge from a schema file to the generated output, or back — a schema
 *     edit is invisible to the graph AND, until now, to SUITE_RULES, which
 *     only matched src/content/** itself, not the schema sources under
 *     config/collections/.
 *   - Anything dispatched at runtime through a registry/map instead of a
 *     static `import` is invisible to the regex-based extractImports().
 *
 * Each entry says: "if any changed file matches `trigger`, also treat
 * `alsoTouched` as changed" — before pattern matching or the dependency
 * graph run. Add an entry here whenever you introduce a new codegen step.
 */
interface SyntheticEdge {
  label: string;
  trigger: string[];
  alsoTouched: string[];
}

const SYNTHETIC_EDGES: SyntheticEdge[] = [
  {
    label: "Collection schema → generated content types",
    trigger: ["config/collections/**"],
    alsoTouched: ["src/content/types.generated.ts", "src/content/types.ts"],
  },
  {
    label: "Generated content types → hand-written types module",
    trigger: ["src/content/types.generated.ts"],
    alsoTouched: ["src/content/types.ts"],
  },
];

export function expandSyntheticEdges(changedFiles: string[]): string[] {
  const expanded = new Set(changedFiles);
  let sizeBefore: number;
  // Fixed-point: an injected file can itself be a trigger for another edge.
  do {
    sizeBefore = expanded.size;
    const current = [...expanded];
    for (const edge of SYNTHETIC_EDGES) {
      const triggered = current.some((f) => edge.trigger.some((p) => matchesPattern(f, p)));
      if (triggered) {
        for (const f of edge.alsoTouched) {
          if (!expanded.has(f)) {
            console.log(`  🔗 ${edge.label} — treating ${f} as changed`);
            expanded.add(f);
          }
        }
      }
    }
  } while (expanded.size > sizeBefore);
  return [...expanded];
}

function getMergeBase(): string {
  // Prefer upstream (origin/next) — same base as precheck getChangedPaths.
  // Do NOT compare against origin/main on the next branch (inflates the delta).
  try {
    return resolveDiffBase();
  } catch {
    return "HEAD~1";
  }
}

function extractChangedIdentifiers(filePath: string, mergeBase: string): string[] {
  try {
    const { execSync } = require("node:child_process");
    const diff = execSync(`git diff ${mergeBase} -- "${filePath}"`, { encoding: "utf8" });
    const identifiers = new Set<string>();

    // Look for added lines containing potential function/method calls or properties
    const lineRegex = /^\+\s+.*?\b([a-zA-Z_][a-zA-Z0-9_]{3,})\b/gm;
    let match;
    while ((match = lineRegex.exec(diff)) !== null) {
      if (!["import", "export", "const", "return", "function", "expect"].includes(match[1])) {
        identifiers.add(match[1]);
      }
    }
    return [...identifiers];
  } catch {
    return [];
  }
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
// Exclude filter
// ---------------------------------------------------------------------------

/**
 * Removes test file paths from a command string that match the exclusion list.
 * Only strips paths that appear as standalone arguments (not substrings).
 */
function filterExcludedFiles(cmd: string, excludeList: string[]): string {
  if (excludeList.length === 0) return cmd;
  const parts = cmd.split(/\s+/);
  const filtered = parts.filter((part) => {
    // Only filter arguments that look like test file paths
    if (!part.endsWith(".test.ts")) return true;
    return !excludeList.some((ex) => part === ex || part.endsWith("/" + ex));
  });
  return filtered.join(" ");
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

async function runCommand(cmd: string, cwd: string): Promise<{ code: number; output: string }> {
  const parts = cmd.split(/\s+/);
  const bin = parts[0];
  const args = parts.slice(1);

  const CHUNK_SIZE = 20;

  // 1. Detect if this is a comma-separated runner command
  let commaArgIndex = -1;
  let filesToChunk: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i].includes(",") && (args[i].includes(".test.ts") || args[i].includes(".spec.ts"))) {
      commaArgIndex = i;
      filesToChunk = args[i].split(",");
      break;
    }
  }

  // Handle Comma-Separated Chunking Sequence
  if (commaArgIndex !== -1 && filesToChunk.length > CHUNK_SIZE) {
    console.log(
      `📦 Command has ${filesToChunk.length} comma-separated test files. Chunking into batches of ${CHUNK_SIZE}...`,
    );
    const { spawn } = require("node:child_process");
    let overallCode = 0;

    for (let i = 0; i < filesToChunk.length; i += CHUNK_SIZE) {
      const chunk = filesToChunk.slice(i, i + CHUNK_SIZE);
      const chunkArgs = [...args];
      chunkArgs[commaArgIndex] = chunk.join(",");

      console.log(
        `\n    [Batch ${Math.floor(i / CHUNK_SIZE) + 1}/${Math.ceil(filesToChunk.length / CHUNK_SIZE)}] Running: ${bin} ${chunkArgs.join(" ")}`,
      );

      const code = await new Promise<number>((res) => {
        const proc = spawn(bin, chunkArgs, {
          cwd,
          stdio: "inherit",
          shell: process.platform === "win32",
        });
        proc.on("close", (c: number | null) => res(c ?? 0));
      });

      if (code !== 0) {
        overallCode = code;
        break; // Fail early if a batch fails
      }
    }
    return { code: overallCode, output: "" };
  }

  // 2. Handle Space-Separated Chunking Sequence (e.g., bun test file1 file2)
  // Separate pure test files from configuration flags safely
  const isTestFile = (arg: string) => arg.endsWith(".test.ts") || arg.endsWith(".spec.ts");
  const testFiles = args.filter(isTestFile);
  const trailingFlags = args.filter((arg) => !isTestFile(arg));

  if (testFiles.length > CHUNK_SIZE) {
    console.log(
      `📦 Command has ${testFiles.length} space-separated test files. Chunking into batches of ${CHUNK_SIZE}...`,
    );
    const { spawn } = require("node:child_process");
    let overallCode = 0;

    for (let i = 0; i < testFiles.length; i += CHUNK_SIZE) {
      const chunk = testFiles.slice(i, i + CHUNK_SIZE);
      // Keep flags completely safe at the end of the argument payload array
      const chunkArgs = [...chunk, ...trailingFlags];

      console.log(
        `\n    [Batch ${Math.floor(i / CHUNK_SIZE) + 1}/${Math.ceil(testFiles.length / CHUNK_SIZE)}] Running: ${bin} ${chunkArgs.join(" ")}`,
      );

      const code = await new Promise<number>((res) => {
        const proc = spawn(bin, chunkArgs, {
          cwd,
          stdio: "inherit",
          shell: process.platform === "win32",
        });
        proc.on("close", (c: number | null) => res(c ?? 0));
      });

      if (code !== 0) {
        overallCode = code;
        break;
      }
    }
    return { code: overallCode, output: "" };
  }

  // 3. Fallback: Standard execution if within size limits
  return new Promise((resolve) => {
    const { spawn } = require("node:child_process");
    const proc = spawn(bin, args, {
      cwd,
      stdio: "inherit",
      shell: process.platform === "win32",
    });

    proc.on("close", (code: number) => {
      resolve({ code: code ?? 0, output: "" });
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
  const unitAndSqlite = argv.includes("--unit+sqlite");
  const suiteFilter = argv.includes("--suite") ? argv[argv.indexOf("--suite") + 1] : null;
  const excludeList = argv.includes("--exclude")
    ? argv[argv.indexOf("--exclude") + 1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const onlyFailures = argv.includes("--only-failures");

  if (unitOnly || unitAndSqlite) {
    FULL_CORE_SUITE.command = "bun run test:unit";
  }

  // ── Determine changed files ─────────────────────────────────────────────
  const changedFiles = runAll ? ["*"] : getChangedFiles();

  if (changedFiles.length === 0) {
    // Smart retry: if no files changed but previous run had failures, re-run those
    const cached = loadFailedSuites();
    if (cached && cached.length > 0) {
      console.log(
        "No changed files, but " + cached.length + " cached failure(s) found. Re-running those.",
      );
      // Push a sentinel so we know to skip normal selection below
      changedFiles.push("__CACHED_RETRY__");
    } else {
      console.log("No changed files detected. Nothing to test.");
      return;
    }
  }

  const isCachedRetry = changedFiles.length === 1 && changedFiles[0] === "__CACHED_RETRY__";

  console.log(`\n📋 Changed files (${changedFiles.length}):`);
  for (const f of changedFiles.slice(0, 20)) {
    console.log(`   ${f}`);
  }
  if (changedFiles.length > 20) {
    console.log(`   ... and ${changedFiles.length - 20} more`);
  }

  // ── Select suites ───────────────────────────────────────────────────────
  // Two signals, always combined — never either/or. Patterns encode domain
  // knowledge and are the ONLY way to reach Gate 2/4: black-box integration
  // and E2E tests hit the app over real HTTP, so they have no static
  // `import` edge back to the route/handler code they exercise — the graph
  // structurally cannot find them. The graph is purely additive, for
  // transitive unit-test breakage no pattern anticipated.
  const configFiles = [
    "package.json",
    "bun.lock",
    "vite.config.ts",
    "svelte.config.js",
    "tsconfig.json",
    "playwright.config.ts",
  ];
  const hasConfigChange = changedFiles.some(
    (f) => configFiles.includes(f) || f.startsWith(".github/"),
  );

  // Expand with synthetic (non-import) edges before either signal runs.
  const expandedChangedFiles = runAll ? changedFiles : expandSyntheticEdges(changedFiles);

  let suites: SelectedSuite[] = [];
  const seenLabels = new Set<string>();
  const addSuites = (newSuites: SelectedSuite[]) => {
    for (const s of newSuites) {
      if (seenLabels.has(s.rule.label)) continue;
      seenLabels.add(s.rule.label);
      suites.push(s);
    }
  };

  if (hasConfigChange) {
    console.log("⚙️  Config or pipeline files changed. Using pattern-based matching.");
  }

  // Signal 1 — always runs; fails closed to FULL_CORE_SUITE internally if
  // nothing matches.
  addSuites(selectSuites(expandedChangedFiles));
  const ranFullCore = suites.some((s) => s.rule.label === FULL_CORE_SUITE.label);

  // Signal 2 — additive only. Skipped once we've already decided to run
  // everything, or for systemic config changes where import tracing isn't
  // meaningful.
  if (!runAll && !hasConfigChange && !ranFullCore) {
    console.log("🕸️  Building file dependency graph...");
    const graph = buildDependencyGraph(ROOT);
    const affected = findTransitiveDependents(expandedChangedFiles, graph);
    const affectedTests = [...affected].filter(
      (f) => f.startsWith("tests/") && (f.endsWith(".test.ts") || f.endsWith(".spec.ts")),
    );

    if (affectedTests.length > 0) {
      console.log(
        `\n🎯 Found ${affectedTests.length} additional test file(s) via dependency graph.`,
      );

      const unitFiles = affectedTests.filter((f) => f.startsWith("tests/unit/"));
      const integrationFiles = affectedTests.filter((f) => f.startsWith("tests/integration/"));
      const e2eFiles = affectedTests.filter((f) => f.startsWith("tests/e2e/"));

      if (unitFiles.length > 0) {
        const mb = getMergeBase();
        const changesInDiff = expandedChangedFiles.flatMap((f) => extractChangedIdentifiers(f, mb));
        let filterFlag = "";

        if (changesInDiff.length > 0 && changesInDiff.length < 15) {
          const pattern = changesInDiff.join("|");
          filterFlag = ` -t "${pattern}"`;
          console.log(
            `✨ Ultra-Smart Focus: Narrowing execution down to test scopes matching: /${pattern}/`,
          );
        }

        const cmd =
          unitFiles.length > 25
            ? `bun test tests/unit${filterFlag}`
            : `bun test ${unitFiles.join(" ")}${filterFlag}`;

        addSuites([
          {
            rule: {
              label: "Affected Unit Tests (graph)",
              gate: 1,
              patterns: [],
              command: cmd,
            },
            matchingFiles: unitFiles,
          },
        ]);
      }
      if (integrationFiles.length > 0) {
        addSuites([
          {
            rule: {
              label: "Affected Integration Tests (graph)",
              gate: 2,
              patterns: [],
              command: `bun run scripts/run-integration-tests.ts ${integrationFiles.join(",")}`,
            },
            matchingFiles: integrationFiles,
          },
        ]);
      }
      if (e2eFiles.length > 0) {
        addSuites([
          {
            rule: {
              label: "Affected E2E Tests (graph)",
              gate: 4,
              patterns: [],
              command: `npx playwright test ${e2eFiles.join(" ")}`,
            },
            matchingFiles: e2eFiles,
          },
        ]);
      }
    } else {
      console.log("No additional test files found via dependency graph.");
    }
  }

  // Cached retry: replace normal selection with previously failed suites
  if (isCachedRetry) {
    const cached = loadFailedSuites();
    if (cached && cached.length > 0) {
      const cachedLabels = new Set(cached.map((f) => f.label));
      const cachedSuites = SUITE_RULES.filter((r) => cachedLabels.has(r.label)).map((rule) => ({
        rule,
        matchingFiles: [] as string[],
      }));
      if (cachedSuites.length > 0) {
        suites = cachedSuites;
        console.log(
          "Smart retry: running " +
            suites.length +
            " cached suite(s): " +
            suites.map((s) => s.rule.label).join(", "),
        );
      } else {
        console.log("Cached suites no longer exist. Clearing cache.");
        clearFailureCache();
        return;
      }
    }
  }

  if (unitOnly) {
    suites = suites.filter((s) => s.rule.gate === 1 || s.rule.gate === 0);
  }

  if (unitAndSqlite) {
    suites = suites.filter((s) => s.rule.gate === 1 || s.rule.gate === 2 || s.rule.gate === 0);
  }

  if (suiteFilter) {
    suites = suites.filter((s) => s.rule.label.toLowerCase().includes(suiteFilter.toLowerCase()));
    if (suites.length === 0) {
      console.error(`❌ No suite matches filter "` + suiteFilter + `"`);
      process.exit(1);
    }
  }

  // --only-failures: narrow to previously failed suites only
  if (onlyFailures) {
    const cached = loadFailedSuites();
    if (cached) {
      const failedLabels = new Set(cached.map((f) => f.label));
      suites = suites.filter((s) => failedLabels.has(s.rule.label));
      if (suites.length === 0) {
        console.log("No cached failures match current selection. Running full suite.");
        clearFailureCache();
      } else {
        console.log(
          "Retrying " +
            suites.length +
            " previously failed suite(s): " +
            suites.map((s) => s.rule.label).join(", "),
        );
      }
    } else {
      console.log("No cached failures found. Running full suite.");
    }
  } else if (!runAll) {
    // Auto-retry: if full suite already ran and only specific suites failed,
    // narrow to just those failures on the next run (no new changes).
    const cached = loadFailedSuites();
    if (cached && cached.length > 0) {
      const failedLabels = new Set(cached.map((f) => f.label));
      const narrowed = suites.filter((s) => failedLabels.has(s.rule.label));
      if (narrowed.length > 0) {
        console.log(
          "Smart retry: narrowing to " +
            narrowed.length +
            " previously failed suite(s): " +
            narrowed.map((s) => s.rule.label).join(", "),
        );
        suites = narrowed;
      }
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

  let suitesToRun = [...suites];

  while (suitesToRun.length > 0) {
    const results: { label: string; gate: number; code: number }[] = [];
    const failedSuites: SelectedSuite[] = [];

    for (const suite of suitesToRun) {
      const rule = suite.rule;
      const effectiveCommand = filterExcludedFiles(rule.command, excludeList);
      const start = Date.now();
      console.log(`\n▶ ${rule.label} (Gate ${rule.gate})`);
      console.log(`  $ ${effectiveCommand}`);

      const { code } = await runCommand(effectiveCommand, ROOT);
      const duration = ((Date.now() - start) / 1000).toFixed(1);

      results.push({ label: rule.label, gate: rule.gate, code });

      if (code === 0) {
        console.log(`  ✅ Passed (${duration}s)`);
      } else {
        console.log(`  ❌ Failed (${duration}s)`);
        failedSuites.push(suite);
      }
    }

    // ── Summary ─────────────────────────────────────────────────────────────
    console.log("\n" + "═".repeat(60));
    console.log("📊 Test Summary:");
    for (const r of results) {
      const status = r.code === 0 ? "✅" : "❌";
      console.log(`  ${status} Gate ${r.gate}: ${r.label}`);
    }

    // Persist failures for smart retry on next precheck run
    if (failedSuites.length > 0) {
      saveFailedSuites(
        failedSuites.map((s) => ({
          label: s.rule.label,
          gate: s.rule.gate,
          command: s.rule.command,
        })),
      );
      console.log(
        "\nCached " +
          failedSuites.length +
          " failed suite(s) for smart retry. Next run with --only-failures skips passing suites.",
      );
    } else {
      clearFailureCache();
    }

    if (failedSuites.length > 0) {
      if (process.stdout.isTTY && process.stdin.isTTY) {
        console.log("\n❌ Some suites failed.");
        const answer = prompt(
          "   Would you like to fix them and re-run only the failed suites? [Y/n] ",
        );
        if (answer === null || answer.trim().toLowerCase() !== "n") {
          prompt("   Make your changes, then press [Enter] to re-run only the failed suites...");
          suitesToRun = failedSuites;
          console.log("\n🔄 Re-running failed suites...");
          continue;
        }
      }
      console.log("\n❌ Some suites failed. Root-cause each failure. Do NOT retry until green.");
      process.exit(1);
    } else {
      console.log("\n✅ All selected suites passed.\n");
      break;
    }
  }
}

main().catch((err) => {
  console.error("Smart runner crashed:", err);
  process.exit(1);
});
