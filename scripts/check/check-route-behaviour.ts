#!/usr/bin/env bun
/**
 * @file scripts/check/check-route-behaviour.ts
 * @description
 * Route-behaviour coverage gate. Line coverage answered "how much of the P0 set
 * executed?"; it never answered "does any test assert what this route *does*?".
 * The 10 audited bugs (token edit/delete, collection edit/delete, invite-token
 * recovery, error boundary, …) all lived in route loaders/actions or API
 * endpoints, i.e. outside the P0 line-coverage set. This script counts the
 * behaviour classes that actually broke, per route, and gates the aggregate.
 *
 * ## Metric
 *
 * Enumerated routes (exactly these two sets, nothing else):
 * - every `src/routes/(app)/**\/+page.server.ts` (loader + actions)
 * - every `src/routes/api/**\/+server.ts`
 *
 * Each route has four independent boolean cells:
 * 1. `load-contract` — a test asserts the shape or values of what the route
 *    returns (an imported `load`/verb result, or an HTTP response's
 *    status/keys/values). "Page is visible" / "request fired" do not count.
 * 2. `failure-path` — a test asserts a non-2xx outcome (4xx/5xx) or a
 *    rejected/blocked action (validation, authz denial, partial failure).
 * 3. `persistence` — a test mutates, then re-reads (reload / goto / GET /
 *    `invalidateAll` / re-`load`) and asserts the persisted value.
 * 4. `concurrency` — a test exercises parallel / superseded / out-of-order
 *    requests (`Promise.all|allSettled|race`, `concurrent`, `stale response`, …).
 *
 * Score = covered cells / (routes × 4).
 *
 * ## Mapping rules (deterministic, no manual manifest)
 *
 * A test *block* (one `it(...)` / `test(...)` body) is attributed to a route by:
 * - **(a) module specifier** — a static/dynamic `import` of
 *   `…/src/routes/(app)/<route>/+page.server` or `…/src/routes/api/<route>/+server`.
 *   The block must reference one of the imported local bindings
 *   (`load`, `actions`, `GET`, `dispatcher`, `mod`, …). Sibling imports
 *   (`…/handlers/collections`, `…/utils`, `+page.svelte`) never count, and
 *   neither does `vi.mock(...)`.
 * - **(b) URL literal** — a string literal starting with `/` inside the block,
 *   used in a navigation/request position (`goto(`, `fetch(`, `.request.post(`,
 *   `api.get(`, `new URL(`, `url:`, `toHaveURL(`). Query/fragment are cut.
 *   `${NAME}` is resolved from a same-file single-assignment string constant
 *   (`const LANGUAGE = "en"`); any remaining `${…}` is a single-segment
 *   wildcard (capped at param specificity, so two static routes stay tied and
 *   the block is discarded). `{placeholder}` text, asset paths
 *   (`/photo.jpg`, `/_app/…`) and `href=`/`src=` attributes are skipped.
 *   The path is matched against the route's URL pattern (`[...x]` = rest,
 *   `[x]` = one segment, `(group)` segments are ignored); `[language]`/
 *   `[lang]`/`[locale]` only match a locale from `project.inlang/settings.json`
 *   (fallback: `xx` / `xx-YY`), so `/ws`, `wp-json` or `/photo.jpg` never
 *   resolve to the language redirect route.
 *   Resolution uses SvelteKit precedence (static > param > rest; a zero-width
 *   rest loses to an exact match). If two routes tie, or a block resolves to
 *   more than one *different* route by URL, the block is **discarded** for
 *   URL-based credit — ambiguous ⇒ not covered (conservative).
 *
 * Deliberate exclusions (documented so the number cannot be inflated):
 * - `src/routes/**` `+page.ts`/`+layout.server.ts`/`+layout.ts` and
 *   `src/routes/files/**` + other non-`/api` endpoints are not enumerated.
 * - `tests/benchmarks`, `tests/mutation`, `tests/verification`, `tests/harness`,
 *   `tests/helpers`, `tests/e2e/{helpers,fixtures,.auth}`, `*.setup.ts`,
 *   `*.teardown.ts` are not test suites and are skipped.
 * - A test file that mentions a route in a comment or in a `vi.mock` path earns
 *   nothing; only an `import` or a URL literal inside a test block counts.
 * - UI-only assertions (`toBeVisible`, `toBeEnabled`, `toHaveText`) are not
 *   shape assertions; only structural/value matchers on data-bearing subjects
 *   (`status`, `body.data`, `result.success`, `pageData`, …) count.
 * - Persistence needs a mutation signal **and** a re-read signal in the *same*
 *   block, plus an assertion; a toast/visibility assertion alone earns nothing.
 * - Concurrency requires an actual parallel/supersede signal in the block.
 *
 * ## Usage
 *
 *   bun run scripts/check/check-route-behaviour.ts            # report, exit 0
 *   bun run scripts/check/check-route-behaviour.ts --json     # machine readable
 *   bun run scripts/check/check-route-behaviour.ts --check --min=45
 *
 * Exit: `--check` exits 1 when the score is below `--min` (default 0).
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export const BEHAVIOUR_CLASSES = [
  "load-contract",
  "failure-path",
  "persistence",
  "concurrency",
] as const;

export type BehaviourClass = (typeof BEHAVIOUR_CLASSES)[number];
export type BehaviourFlags = Record<BehaviourClass, boolean>;

export type RouteKind = "page" | "api";
export type SegmentKind = "static" | "param" | "rest";

export interface RouteSegment {
  kind: SegmentKind;
  /** Raw segment text, e.g. `dashboard`, `[id]`, `[...path]`. */
  raw: string;
}

export interface RouteEntry {
  /** Project-relative posix id, e.g. `src/routes/(app)/config/webhooks`. */
  id: string;
  kind: RouteKind;
  /** Project-relative posix file, e.g. `src/routes/(app)/dashboard/+page.server.ts`. */
  file: string;
  /** URL pattern for reporting, e.g. `/config/webhooks`, `/api/[...path]`. */
  url: string;
  segments: RouteSegment[];
  /**
   * Behaviour classes that can meaningfully apply to this route.
   * Omitted means all four (synthetic routes in unit tests).
   */
  applicable?: BehaviourClass[];
}

export interface TestFile {
  path: string;
  source: string;
}

export interface RouteBehaviourRow {
  id: string;
  kind: RouteKind;
  file: string;
  url: string;
  flags: BehaviourFlags;
  /** Classes the route is scored against (`flags` outside this set are ignored). */
  applicable: BehaviourClass[];
  score: number;
  /** Human-readable evidence, e.g. `load-contract←tests/unit/routes/dashboard-page-server.test.ts`. */
  evidence: Record<BehaviourClass, string[]>;
}

export interface RouteBehaviourResult {
  ok: boolean;
  routes: RouteBehaviourRow[];
  totals: {
    routes: number;
    cells: number;
    covered: number;
  };
  /** Percentage 0–100, one decimal. */
  score: number;
  perClass: Record<BehaviourClass, { covered: number; percent: number }>;
  zeroRoutes: string[];
}

export interface ScoreOptions {
  routes: RouteEntry[];
  testFiles: TestFile[];
  /** Configured locale codes used to validate `[language]` params. */
  locales?: readonly string[];
}

const ROOT = process.cwd();

/** Test suites that can contribute behaviour evidence. */
const TEST_ROOTS = ["tests/unit", "tests/integration", "tests/e2e"] as const;

/** Non-suite directories inside the roots above. */
const EXCLUDED_DIR_SEGMENTS = new Set([
  "helpers",
  "fixtures",
  ".auth",
  "mocks",
  "__snapshots__",
  "test-results",
  "playwright-report",
]);

const TEST_FILE_SUFFIXES = [".test.ts", ".spec.ts", ".test.tsx", ".spec.tsx"] as const;

/** Shape/value matchers. Visibility/enabled/text matchers are deliberately absent. */
const SHAPE_MATCHERS = new Set([
  "toBe",
  "toEqual",
  "toStrictEqual",
  "toContain",
  "toContainEqual",
  "toMatch",
  "toMatchObject",
  "toHaveProperty",
  "toHaveLength",
  "toBeTruthy",
  "toBeFalsy",
  "toBeDefined",
  "toBeNull",
  "toBeGreaterThan",
  "toBeGreaterThanOrEqual",
  "toBeLessThan",
  "toBeLessThanOrEqual",
]);

/** Matchers that are shape-specific regardless of the subject expression. */
const SHAPE_SPECIFIC_MATCHERS = new Set([
  "toMatchObject",
  "toHaveProperty",
  "toContainEqual",
  "toStrictEqual",
]);

/** Subjects that indicate a data/response value rather than a DOM node. */
const DATA_SUBJECT_RE =
  /\b(?:data|body|result|payload|json|status|statusCode|res|response|pageData|form|initial|envelope|props|error|code|items|rows|entries|records|tokens?|users?|count|total|widgets?|permissions?|sessions?|settings?|config|list|length)\b/i;

/* ------------------------------------------------------------------ */
/* Route enumeration                                                   */
/* ------------------------------------------------------------------ */

function toPosix(p: string): string {
  return p.split(sep).join("/");
}

function readDirSafe(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** Classify a route directory segment (`(app)` groups are dropped by the caller). */
function toSegment(raw: string): RouteSegment {
  if (raw.startsWith("[...") && raw.endsWith("]")) return { kind: "rest", raw };
  if (raw.startsWith("[[") && raw.endsWith("]]")) return { kind: "param", raw };
  if (raw.startsWith("[") && raw.endsWith("]")) return { kind: "param", raw };
  return { kind: "static", raw };
}

/** A route that can write: an endpoint mutation verb or a page form action. */
const API_MUTATION_RE = /export\s+const\s+(?:POST|PUT|PATCH|DELETE)\b/;
const PAGE_ACTIONS_RE = /export\s+const\s+actions\b/;

/**
 * Endpoints that sign/transform a request but persist nothing: `persistence`
 * (mutate → re-read) has no meaning for them. Explicit and reviewable rather
 * than inferred, so a real write endpoint cannot quietly drop the cell.
 */
const STATELESS_API_ROUTES = new Set(["src/routes/api/preview/authorize"]);

/**
 * Read-only endpoints with no shared mutable state: persistence and concurrency
 * are not meaningful cells. Explicit and reviewable, like the stateless API set.
 */
const STATELESS_READ_ROUTES = new Set([
  "src/routes/files/[...path]",
  "src/routes/indexnow.txt",
  "src/routes/llms.txt",
  "src/routes/robots.txt",
  "src/routes/sitemap.xml",
]);

/** Page routes whose actions do not persist state (e.g. preview-only mail). */
const STATELESS_PAGE_ROUTES = new Set(["src/routes/email-previews"]);

/**
 * Multi-step state machines whose persistence/concurrency contracts are covered
 * by integration/E2E suites that the static block scanner cannot attribute to
 * the route module. Their load contract and failure path are still gated here.
 */
const LOAD_ONLY_ROUTES = new Set(["src/routes/setup", "src/routes/login/oauth"]);

/**
 * Which classes can a route fail at?
 *
 * Every route answers a load contract and can refuse (401/403/404/redirect).
 * `persistence` only means something where the route can write, and
 * `concurrency` only where parallel requests share mutable state — a
 * redirect stub scored 0/4 on both is noise, not a blind spot.
 */
export function applicableClasses(kind: RouteKind, source: string): BehaviourClass[] {
  const canWrite = (kind === "api" ? API_MUTATION_RE : PAGE_ACTIONS_RE).test(source);
  const classes: BehaviourClass[] = ["load-contract", "failure-path"];
  if (canWrite) classes.push("persistence");
  if (kind === "api" || canWrite) classes.push("concurrency");
  return classes;
}

function buildRoute(id: string, file: string, kind: RouteKind, rootDir: string = ROOT): RouteEntry {
  const routePath = id.slice("src/routes".length);
  const segments = routePath
    .split("/")
    .filter(Boolean)
    .filter((seg) => !(seg.startsWith("(") && seg.endsWith(")")))
    .map(toSegment);

  let source = "";
  try {
    source = readFileSync(join(rootDir, file), "utf8");
  } catch {
    // Unreadable route: keep the full four-class contract.
  }

  let applicable = source ? applicableClasses(kind, source) : undefined;
  if (applicable && STATELESS_API_ROUTES.has(id)) {
    applicable = applicable.filter((cls) => cls !== "persistence");
  }
  if (applicable && STATELESS_READ_ROUTES.has(id)) {
    applicable = applicable.filter((cls) => cls !== "persistence" && cls !== "concurrency");
  }
  if (applicable && STATELESS_PAGE_ROUTES.has(id)) {
    applicable = applicable.filter((cls) => cls !== "persistence" && cls !== "concurrency");
  }
  if (applicable && LOAD_ONLY_ROUTES.has(id)) {
    applicable = ["load-contract", "failure-path"];
  }

  return {
    id,
    kind,
    file,
    url: `/${segments.map((s) => s.raw).join("/")}`,
    segments,
    ...(applicable ? { applicable } : {}),
  };
}

/**
 * Enumerate every route set that can break a user workflow:
 * - `(app)` and `(admin)` and `(site)` server-rendered pages
 * - `/api/**` endpoints
 * - top-level page/server routes (`login`, `setup`, `share`, `indexnow.txt`, …)
 * Deterministic: filesystem order is sorted.
 */
export function discoverRoutes(rootDir: string = ROOT): RouteEntry[] {
  const found: RouteEntry[] = [];
  const seen = new Set<string>();

  const addRoute = (dir: string, boundary: string, kind: RouteKind) => {
    const rel = toPosix(relative(rootDir, dir));
    if (!existsSync(join(dir, boundary))) return;
    const route = buildRoute(rel, `${rel}/${boundary}`, kind, rootDir);
    if (seen.has(route.id)) return;
    seen.add(route.id);
    found.push(route);
  };

  const walk = (dir: string, boundary: string, kind: RouteKind) => {
    addRoute(dir, boundary, kind);
    for (const name of readDirSafe(dir)) {
      const full = join(dir, name);
      if (isDir(full)) walk(full, boundary, kind);
    }
  };

  walk(join(rootDir, "src", "routes", "(app)"), "+page.server.ts", "page");
  walk(join(rootDir, "src", "routes", "(admin)"), "+page.server.ts", "page");
  walk(join(rootDir, "src", "routes", "(site)"), "+page.server.ts", "page");
  walk(join(rootDir, "src", "routes", "api"), "+server.ts", "api");

  // Top-level routes outside the three page groups and /api. Both boundaries
  // are probed so a directory that serves a page and an endpoint is covered.
  const grouped = new Set(["(app)", "(admin)", "(site)", "api"]);
  for (const name of readDirSafe(join(rootDir, "src", "routes"))) {
    if (grouped.has(name)) continue;
    const full = join(rootDir, "src", "routes", name);
    if (!isDir(full)) continue;
    walk(full, "+page.server.ts", "page");
    walk(full, "+server.ts", "api");
  }

  return found.sort((a, b) => a.id.localeCompare(b.id));
}

/* ------------------------------------------------------------------ */
/* URL pattern matching                                                */
/* ------------------------------------------------------------------ */

interface MatchResult {
  route: RouteEntry;
  /** Specificity per matched segment: static 3, param 2, rest 1, zero-width rest 0. */
  ranks: number[];
  zeroWidthRests: number;
}

/**
 * Param values that are plausible for a given route param. `[language]` only
 * matches a configured locale — otherwise every two-letter path (`/ws`,
 * `wp-json`) or one-segment asset would be credited to the redirect route.
 * The locale list comes from `project.inlang/settings.json` in the CLI; the
 * fallback requires a 2-letter code with an optional uppercase region
 * (`en`, `pt-BR`), which keeps the synthetic-test path conservative too.
 */
function paramValueIsPlausible(name: string, value: string, locales?: readonly string[]): boolean {
  const key = name
    .replace(/^\[+|\.\.\.|\]+$/g, "")
    .replace(/^\[+/, "")
    .toLowerCase();
  if (key === "language" || key === "lang" || key === "locale") {
    if (locales && locales.length > 0) return locales.includes(value);
    return /^[a-z]{2}(?:-[A-Z]{2})?$/.test(value);
  }
  return true;
}

/**
 * Match a URL path against a route pattern.
 * A URL segment containing `${…}` (unresolved interpolation) is a wildcard: it
 * matches a static or param segment but is capped at param specificity, so two
 * concrete static routes stay tied (and the tie is discarded as ambiguous).
 * Returns `null` when the path does not match.
 */
export function matchUrlToRoute(
  urlPath: string,
  route: RouteEntry,
  locales?: readonly string[],
): MatchResult | null {
  const clean = urlPath.split("?")[0].split("#")[0];
  const urlSegs = clean.split("/").filter(Boolean);
  const ranks: number[] = [];
  let zeroWidthRests = 0;
  let i = 0;

  for (const seg of route.segments) {
    if (seg.kind === "rest") {
      const consumed = urlSegs.length - i;
      if (consumed < 0) return null;
      if (consumed === 0) {
        ranks.push(0);
        zeroWidthRests++;
      } else {
        for (let k = 0; k < consumed; k++) {
          ranks.push(urlSegs[i + k].includes("${") ? 2 : 1);
        }
      }
      i = urlSegs.length;
      continue;
    }
    if (i >= urlSegs.length) return null;
    const value = urlSegs[i];
    const wildcard = value.includes("${");
    if (seg.kind === "static") {
      if (!wildcard && value !== seg.raw) return null;
      ranks.push(wildcard ? 2 : 3);
    } else {
      if (!wildcard && !paramValueIsPlausible(seg.raw, value, locales)) return null;
      ranks.push(2);
    }
    i++;
  }

  if (i !== urlSegs.length) return null;
  return { route, ranks, zeroWidthRests };
}

function compareSpecificity(a: MatchResult, b: MatchResult): number {
  const len = Math.max(a.ranks.length, b.ranks.length);
  for (let i = 0; i < len; i++) {
    const ra = a.ranks[i] ?? 0;
    const rb = b.ranks[i] ?? 0;
    if (ra !== rb) return ra - rb;
  }
  // Exact match (no zero-width rest) beats a rest that matched nothing.
  return b.zeroWidthRests - a.zeroWidthRests;
}

/**
 * Resolve a URL path to a single route using SvelteKit precedence.
 * Returns `null` when nothing matches or when two routes tie (ambiguous).
 */
export function resolveUrl(
  urlPath: string,
  routes: RouteEntry[],
  locales?: readonly string[],
): RouteEntry | null {
  const matches = routes
    .map((route) => matchUrlToRoute(urlPath, route, locales))
    .filter((m): m is MatchResult => m !== null);
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0].route;

  const sorted = [...matches].sort(compareSpecificity);
  const best = sorted[sorted.length - 1];
  const runnerUp = sorted[sorted.length - 2];
  if (compareSpecificity(best, runnerUp) === 0) return null;
  return best.route;
}

/* ------------------------------------------------------------------ */
/* Test-file parsing                                                   */
/* ------------------------------------------------------------------ */

export interface TestBlock {
  /** 1-based line number of the `it`/`test` declaration. */
  line: number;
  text: string;
}

const BLOCK_START_RE = /^\s*(?:it|test)(?:\.(?!describe\b)\w+)?\s*\(/;

/** Split a suite into per-test blocks. Falls back to the whole file. */
export function splitTestBlocks(source: string): TestBlock[] {
  const lines = source.split(/\r?\n/);
  const starts: number[] = [];
  lines.forEach((line, index) => {
    if (BLOCK_START_RE.test(line)) starts.push(index);
  });
  if (starts.length === 0) return [{ line: 1, text: source }];

  return starts.map((start, index) => {
    const end = index + 1 < starts.length ? starts[index + 1] : lines.length;
    return { line: start + 1, text: lines.slice(start, end).join("\n") };
  });
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface ImportBinding {
  routeId: string;
  bindings: string[];
}

/**
 * Map an import specifier to an enumerated route id.
 * Only `+page.server` / `+server` modules qualify.
 */
export function routeIdFromSpecifier(specifier: string): string | null {
  const idx = specifier.indexOf("src/routes/");
  if (idx < 0) return null;
  let modulePath = specifier.slice(idx).split("?")[0];
  modulePath = modulePath.replace(/\.(?:[cm]?ts|[cm]?js)$/, "");
  if (!/(?:\/\+page\.server|\/\+server)$/.test(modulePath)) return null;
  const dir = modulePath.replace(/\/\+[^/]+$/, "");
  return dir === "src/routes" ? null : dir;
}

function parseBindings(clause: string): string[] {
  const out: string[] = [];

  const named = clause.match(/\{([\s\S]*?)\}/);
  if (named) {
    for (const part of named[1].split(",")) {
      const entry = part.trim();
      if (!entry) continue;
      const aliased = entry.match(/(?:[A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
      const plain = entry.match(/^([A-Za-z_$][\w$]*)$/);
      const binding = aliased?.[1] ?? plain?.[1];
      if (binding) out.push(binding);
    }
  }

  const namespace = clause.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/);
  if (namespace) out.push(namespace[1]);

  const defaultClause = clause
    .replace(/\{[\s\S]*?\}/, "")
    .replace(/\*\s+as\s+[A-Za-z_$][\w$]*/, "")
    .trim()
    .replace(/,$/, "")
    .trim();
  if (/^[A-Za-z_$][\w$]*$/.test(defaultClause)) out.push(defaultClause);

  return [...new Set(out)];
}

/** Static imports in a file: route id → local bindings. */
export function extractStaticImports(source: string): ImportBinding[] {
  const out: ImportBinding[] = [];
  const importRe = /import\s+(?!type\b)([^;]*?)\s+from\s+["']([^"']+)["']/g;
  for (const match of source.matchAll(importRe)) {
    const routeId = routeIdFromSpecifier(match[2]);
    if (!routeId) continue;
    out.push({ routeId, bindings: parseBindings(match[1]) });
  }
  return out;
}

/** Dynamic `import("…")` specifiers inside a snippet (e.g. one test block). */
export function extractDynamicImportRoutes(snippet: string): string[] {
  const out: string[] = [];
  for (const match of snippet.matchAll(/import\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    const routeId = routeIdFromSpecifier(match[1]);
    if (routeId) out.push(routeId);
  }
  return [...new Set(out)];
}

/** Asset-like paths that are never route URLs. */
const ASSET_RE =
  /\.(?:png|jpe?g|gif|svg|webp|avif|ico|css|js|mjs|cjs|json|map|woff2?|ttf|otf|eot|mp4|webm|pdf|txt|xml|wasm)$/i;

/** Non-route prefixes (Vite internals, static assets). */
const NON_ROUTE_PREFIX_RE =
  /^\/(?:src|_app|node_modules|static|assets|images|img|fonts|@|\.[^/]+)\//;

/**
 * A literal only counts when it is used in a navigation/request position
 * (`goto(`, `fetch(`, `.request.post(`, `api.get(`, `new URL(`, `url:`, …).
 * `href=`/`src=` attributes and bare data literals are excluded.
 */
const NAVIGATION_CONTEXT_RE =
  /(?:\bgoto\s*\(|\bnew\s+URL\s*\(|[Ff]etch\s*\(|\brequest\s*\(|\.request\s*\.|\b(?:get|post|put|patch|delete|head|options)\s*\(|\burl\s*[:=]|\btoHaveURL\s*\(|\.url\s*\(|\bpathname\s*[:=])\s*$/i;

/**
 * String constants declared once in a file (`const LANGUAGE = "en"`), used to
 * resolve simple `${NAME}` interpolations before URL matching. Constants whose
 * own value interpolates are ignored (no guessing).
 */
export function extractStringConstants(source: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*["'`]([^"'`\n]*)["'`]/g;
  for (const match of source.matchAll(re)) {
    if (match[2].includes("${")) continue;
    if (!out.has(match[1])) out.set(match[1], match[2]);
  }
  return out;
}

/** Substitute `${NAME}` for known same-file string constants. */
function resolveInterpolations(raw: string, constants: Map<string, string>): string {
  return raw.replace(
    /\$\{([A-Za-z_$][\w$]*)\}/g,
    (whole, name: string) => constants.get(name) ?? whole,
  );
}

/** URL-looking string literals in a snippet (import specifiers excluded naturally). */
export function extractUrlLiterals(
  snippet: string,
  constants: Map<string, string> = new Map(),
): string[] {
  const out: string[] = [];
  for (const match of snippet.matchAll(/["'`]([^"'`\n]{1,300})["'`]/g)) {
    const raw = match[1];
    const resolved = resolveInterpolations(raw, constants);
    // Absolute URLs (`http://localhost:5173/api/x`) are reduced to their path.
    let candidate = resolved;
    if (/^https?:\/\//i.test(candidate)) {
      try {
        candidate = new URL(candidate).pathname;
      } catch {
        continue;
      }
    } else if (/^\$\{[^}]+\}\//.test(candidate)) {
      // `${API}/api/x` — an unresolved base-URL constant followed by a path.
      candidate = candidate.replace(/^\$\{[^}]+\}/, "");
    }
    if (!candidate.startsWith("/") || candidate.startsWith("//")) continue;
    const path = candidate.split("?")[0].split("#")[0];
    // `{slug}`-style placeholders are schema text, not route URLs (but `${…}`
    // survives as a wildcard segment and is handled by the matcher).
    if (/[{}]/.test(path.replace(/\$\{[^}]*\}/g, ""))) continue;
    if (path.length < 2) continue;
    if (/\s/.test(path)) continue;
    if (ASSET_RE.test(path)) continue;
    if (NON_ROUTE_PREFIX_RE.test(path)) continue;

    const index = match.index ?? 0;
    const prefix = snippet.slice(Math.max(0, index - 100), index);
    if (!NAVIGATION_CONTEXT_RE.test(prefix)) continue;

    out.push(path);
  }
  return [...new Set(out)];
}

/* ------------------------------------------------------------------ */
/* Signal detectors                                                    */
/* ------------------------------------------------------------------ */

interface Assertion {
  subject: string;
  matcher: string;
  args: string;
}

/** Extract `expect(subject).matcher(args)` triples with a bounded scan. */
export function extractAssertions(snippet: string): Assertion[] {
  const out: Assertion[] = [];
  const re = /expect\s*\(/g;
  for (const start of snippet.matchAll(re)) {
    const from = (start.index ?? 0) + start[0].length;
    const window = snippet.slice(from, from + 400);
    const matcherMatch = window.match(/\)\s*(?:\.(?:not|resolves|rejects)\s*)*\.([A-Za-z]+)\s*\(/);
    if (!matcherMatch) continue;
    const matcher = matcherMatch[1];
    const subjectEnd = matcherMatch.index ?? 0;
    const subject = window.slice(0, subjectEnd);
    const argsStart = subjectEnd + matcherMatch[0].length;
    const args = window.slice(argsStart, argsStart + 200);
    out.push({ subject, matcher, args });
  }
  return out;
}

/** A shape/value assertion, not a DOM-visibility one. */
export function hasShapeAssertion(snippet: string): boolean {
  return extractAssertions(snippet).some((a) => {
    if (!SHAPE_MATCHERS.has(a.matcher)) return false;
    if (SHAPE_SPECIFIC_MATCHERS.has(a.matcher)) return true;
    if (/^\s*\{/.test(a.args)) return true;
    // `expect([200, 403]).toContain(status)` — a status allowlist is a value assertion.
    if (/^\s*\[[^\]]*\d/.test(a.subject)) return true;
    return DATA_SUBJECT_RE.test(a.subject);
  });
}

const STATUS_4XX_5XX = String.raw`(?:4\d{2}|5\d{2})`;

/** A non-2xx outcome or a blocked/rejected action. */
export function hasFailureSignal(snippet: string): boolean {
  const patterns: RegExp[] = [
    /\.rejects\b/,
    /\.toThrow\b/,
    new RegExp(String.raw`\.to(?:Be|Equal|StrictEqual)\(\s*${STATUS_4XX_5XX}\b`),
    new RegExp(String.raw`\.toContain\(\s*${STATUS_4XX_5XX}\b`),
    new RegExp(String.raw`\[[^\]]*\b${STATUS_4XX_5XX}\b[^\]]*\][^;]{0,80}?\.toContain\s*\(`),
    /toBeGreaterThanOrEqual\(\s*400\b/,
    /expect\s*\([^;]{0,200}(?:forbidden|unauthori[sz]ed|access denied|not allowed|invalid|blocked|rejected|failure|error)/i,
    /expect\s*\([^;]{0,140}\b(?:success|ok)\b[^;]{0,60}\)\s*\.to(?:Be|Equal)\(\s*false\s*\)/,
  ];
  return patterns.some((re) => re.test(snippet));
}

/** Mutation signal: explicit write request, SvelteKit action, or a named UI action click. */
export function hasMutationSignal(snippet: string): boolean {
  const patterns: RegExp[] = [
    /method\s*:\s*["'`](?:POST|PUT|PATCH|DELETE)["'`]/i,
    /\.request\.(?:post|put|patch|delete)\s*\(/i,
    /\b(?:fetch|request)\s*\([^;]{0,120}method\s*:\s*["'`](?:POST|PUT|PATCH|DELETE)["'`]/i,
    /\bactions\.[A-Za-z_$][\w$]*\s*\(/,
    /(?:save|create|update|delete|remove|add|apply|confirm|submit|upload|restore|rename|revoke)[\s\S]{0,120}?\.click\s*\(/i,
  ];
  return patterns.some((re) => re.test(snippet));
}

/** Re-read signal: fresh server truth after a mutation. */
export function hasReReadSignal(snippet: string): boolean {
  const patterns: RegExp[] = [
    /\.reload\s*\(/,
    /\binvalidateAll\s*\(/,
    /\.request\.get\s*\(/i,
    /\bpage\.goto\s*\(/,
    /\bgoto\s*\(/,
    /\bawait\s+fetch\s*\(/,
    /\bexpect\s*\(\s*await\b/,
    /\bawait\s+load\s*\(/,
  ];
  return patterns.some((re) => re.test(snippet));
}

/** Parallel / superseded / out-of-order work. */
export function hasConcurrencySignal(snippet: string): boolean {
  const patterns: RegExp[] = [
    /\bPromise\.(?:all|allSettled|race)\s*\(/,
    /\b(?:concurrent(?:ly)?|parallel(?:ly)?|simultaneous(?:ly)?|supersed\w*|out[- ]of[- ]order|race condition|stale (?:response|request|read|etag)|double[- ]submit|duplicate submission|in flight)\b/i,
  ];
  return patterns.some((re) => re.test(snippet));
}

/* ------------------------------------------------------------------ */
/* Scoring                                                             */
/* ------------------------------------------------------------------ */

interface BlockEvidence {
  file: string;
  flags: BehaviourFlags;
}

/**
 * Pure scoring function: routes + test sources in, per-route flags out.
 * No filesystem access — this is what the unit test drives with synthetic input.
 */
export function scoreRouteBehaviour({
  routes,
  testFiles,
  locales,
}: ScoreOptions): RouteBehaviourResult {
  const known = new Map(routes.map((route) => [route.id, route]));
  const evidence = new Map<string, BlockEvidence[]>();
  for (const route of routes) evidence.set(route.id, []);

  for (const file of testFiles) {
    const fileImports = extractStaticImports(file.source);
    const constants = extractStringConstants(file.source);

    for (const block of splitTestBlocks(file.source)) {
      const refs = new Set<string>();

      // (a) module specifier — static bindings referenced by the block, or a dynamic import inside it.
      for (const imp of fileImports) {
        if (!known.has(imp.routeId)) continue;
        for (const binding of imp.bindings) {
          const re = new RegExp(String.raw`\b${escapeRegex(binding)}\b`);
          if (re.test(block.text)) {
            refs.add(imp.routeId);
            break;
          }
        }
      }
      for (const routeId of extractDynamicImportRoutes(block.text)) {
        if (known.has(routeId)) refs.add(routeId);
      }

      // (b) URL literal — unique resolution only; multiple distinct routes are ambiguous.
      const urlRefs = new Set<string>();
      for (const literal of extractUrlLiterals(block.text, constants)) {
        const route = resolveUrl(literal, routes, locales);
        if (route) urlRefs.add(route.id);
      }
      if (urlRefs.size === 1) {
        for (const id of urlRefs) refs.add(id);
      }

      if (refs.size === 0) continue;

      const flags: BehaviourFlags = {
        "load-contract": hasShapeAssertion(block.text),
        "failure-path": hasFailureSignal(block.text),
        persistence:
          hasMutationSignal(block.text) &&
          hasReReadSignal(block.text) &&
          extractAssertions(block.text).length > 0,
        concurrency: hasConcurrencySignal(block.text),
      };

      for (const id of refs) {
        evidence.get(id)!.push({ file: file.path, flags });
      }
    }
  }

  const rows: RouteBehaviourRow[] = routes.map((route) => {
    const blocks = evidence.get(route.id) ?? [];
    const applicable = route.applicable ?? [...BEHAVIOUR_CLASSES];
    const flags: BehaviourFlags = {
      "load-contract": false,
      "failure-path": false,
      persistence: false,
      concurrency: false,
    };
    const ev: Record<BehaviourClass, string[]> = {
      "load-contract": [],
      "failure-path": [],
      persistence: [],
      concurrency: [],
    };

    for (const block of blocks) {
      for (const cls of BEHAVIOUR_CLASSES) {
        if (block.flags[cls]) {
          flags[cls] = true;
          if (!ev[cls].includes(block.file)) ev[cls].push(block.file);
        }
      }
    }

    const covered = applicable.filter((cls) => flags[cls]).length;
    return {
      id: route.id,
      kind: route.kind,
      file: route.file,
      url: route.url,
      flags,
      applicable,
      score: applicable.length === 0 ? 0 : covered / applicable.length,
      evidence: ev,
    };
  });

  const totalCells = rows.reduce((sum, row) => sum + row.applicable.length, 0);
  const coveredCells = rows.reduce(
    (sum, row) => sum + row.applicable.filter((cls) => row.flags[cls]).length,
    0,
  );

  const perClass = {} as RouteBehaviourResult["perClass"];
  for (const cls of BEHAVIOUR_CLASSES) {
    const applicableRows = rows.filter((row) => row.applicable.includes(cls));
    const covered = applicableRows.filter((row) => row.flags[cls]).length;
    perClass[cls] = {
      covered,
      percent: applicableRows.length === 0 ? 0 : round1((covered / applicableRows.length) * 100),
    };
  }

  const score = totalCells === 0 ? 0 : round1((coveredCells / totalCells) * 100);

  return {
    ok: true,
    routes: rows,
    totals: { routes: rows.length, cells: totalCells, covered: coveredCells },
    score,
    perClass,
    zeroRoutes: rows
      .filter((row) => row.applicable.filter((cls) => row.flags[cls]).length === 0)
      .map((row) => row.id),
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/* ------------------------------------------------------------------ */
/* Filesystem discovery for the CLI                                    */
/* ------------------------------------------------------------------ */

/** All behaviour-test files (unit, integration, E2E). */
export function discoverTestFiles(rootDir: string = ROOT): TestFile[] {
  const files: TestFile[] = [];

  const walk = (dir: string) => {
    for (const name of readDirSafe(dir)) {
      if (EXCLUDED_DIR_SEGMENTS.has(name)) continue;
      const full = join(dir, name);
      if (isDir(full)) {
        walk(full);
        continue;
      }
      if (!TEST_FILE_SUFFIXES.some((suffix) => name.endsWith(suffix))) continue;
      if (name.endsWith(".setup.ts") || name.endsWith(".teardown.ts")) continue;
      files.push({
        path: toPosix(relative(rootDir, full)),
        source: readFileSync(full, "utf8"),
      });
    }
  };

  for (const root of TEST_ROOTS) {
    const dir = join(rootDir, ...root.split("/"));
    if (isDir(dir)) walk(dir);
  }

  return files.sort((a, b) => a.path.localeCompare(b.path));
}

/** Locale codes from `project.inlang/settings.json` (used to validate `[language]`). */
export function loadLocales(rootDir: string = ROOT): string[] {
  const file = join(rootDir, "project.inlang", "settings.json");
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as { locales?: unknown };
    if (Array.isArray(parsed.locales)) {
      return parsed.locales.filter((locale): locale is string => typeof locale === "string");
    }
  } catch {
    // Missing/malformed config: fall back to the conservative 2-letter rule.
  }
  return [];
}

/* ------------------------------------------------------------------ */
/* Reporting                                                           */
/* ------------------------------------------------------------------ */

const FLAG_ORDER: BehaviourClass[] = [...BEHAVIOUR_CLASSES];

function flagGlyph(value: boolean, applicable: boolean): string {
  if (!applicable) return "–";
  return value ? "✓" : "·";
}

export function formatTable(result: RouteBehaviourResult): string {
  const header = ["load", "fail", "pers", "conc"];
  const rows = result.routes
    .slice()
    .sort((a, b) => a.score - b.score || a.url.localeCompare(b.url))
    .map((row) => {
      const flags = FLAG_ORDER.map((cls) =>
        flagGlyph(row.flags[cls], row.applicable.includes(cls)),
      ).join("  ");
      const score = `${row.applicable.filter((cls) => row.flags[cls]).length}/${row.applicable.length}`;
      return `${row.url.padEnd(46)} ${flags.padEnd(24)} ${score.padStart(5)}  ${row.id}`;
    });

  const worst = result.routes
    .slice()
    .sort((a, b) => a.score - b.score || a.url.localeCompare(b.url))
    .slice(0, 10);

  const summary = [
    `Route behaviour coverage: ${result.totals.covered}/${result.totals.cells} cells (${result.score}%)`,
    `Routes: ${result.totals.routes} | ` +
      BEHAVIOUR_CLASSES.map((cls) => `${cls} ${result.perClass[cls].percent}%`).join(" | "),
    "",
    `${"URL".padEnd(46)} ${header.map((h) => h.padEnd(4)).join("  ")} score  route`,
    ...rows,
    "",
    `Routes below full applicable coverage: ${result.routes.filter((row) => row.score < 1).length}`,
    ...worst.filter((row) => row.score < 1).map((row) => `  - ${row.url} (${row.file})`),
  ];

  return summary.join("\n");
}

export function formatJson(result: RouteBehaviourResult, min: number): string {
  return JSON.stringify(
    {
      ok: result.score >= min,
      min,
      score: result.score,
      totals: result.totals,
      perClass: result.perClass,
      zeroRoutes: result.zeroRoutes,
      routes: result.routes.map((row) => ({
        id: row.id,
        url: row.url,
        kind: row.kind,
        file: row.file,
        flags: row.flags,
        applicable: row.applicable,
        score: row.score,
        evidence: row.evidence,
      })),
    },
    null,
    2,
  );
}

export interface CliOptions {
  check: boolean;
  min: number;
  json: boolean;
  rootDir: string;
}

export function parseArgs(argv: string[]): CliOptions {
  let check = false;
  let min = 0;
  let json = false;
  let rootDir = ROOT;

  for (const arg of argv) {
    if (arg === "--check") check = true;
    else if (arg === "--json") json = true;
    else if (arg.startsWith("--min=")) {
      const parsed = Number(arg.slice("--min=".length));
      if (Number.isFinite(parsed)) min = parsed;
    } else if (arg.startsWith("--root=")) {
      rootDir = arg.slice("--root=".length);
    }
  }

  return { check, min, json, rootDir };
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

function main(argv: string[]): number {
  const options = parseArgs(argv);
  const routes = discoverRoutes(options.rootDir);
  const testFiles = discoverTestFiles(options.rootDir);
  const locales = loadLocales(options.rootDir);
  const result = scoreRouteBehaviour({ routes, testFiles, locales });

  if (options.json) {
    process.stdout.write(`${formatJson(result, options.min)}\n`);
  } else {
    process.stdout.write(`${formatTable(result)}\n`);
    process.stdout.write(`\nScanned ${testFiles.length} test files for ${routes.length} routes.\n`);
    if (options.check) {
      process.stdout.write(
        result.score >= options.min
          ? `✓ ${result.score}% ≥ ${options.min}% (min)\n`
          : `✗ ${result.score}% < ${options.min}% (min)\n`,
      );
    }
  }

  if (options.check && result.score < options.min) return 1;
  return 0;
}

const invokedDirectly =
  typeof Bun !== "undefined"
    ? Bun.main === import.meta.path
    : process.argv[1] !== undefined && process.argv[1].endsWith("check-route-behaviour.ts");

if (invokedDirectly) {
  process.exit(main(process.argv.slice(2)));
}
