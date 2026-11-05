/**
 * @file scripts/security/threat-model-lib.ts
 * @description Pure, environment-agnostic helpers behind the threat-model drift
 * gate. Runs unchanged under Bun (CLI) and Vitest/Node (unit tests).
 *
 * Features:
 * - Dependency-free glob matcher for `**`, `*` and exact paths (`globToRegExp` cache)
 * - Recursive, POSIX-normalised directory walk with deterministic ordering
 * - `computeFingerprint` — sha256 over sorted `path \0 sha256(content)` entries
 * - Valibot manifest schema (`version: 1`) with calendar-date replay protection
 * - Surface file resolution, 12-month review staleness and route coverage evaluation
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, type Dirent } from "node:fs";
import { join, relative, resolve } from "node:path";
import * as v from "valibot";

/** Manifest location relative to the repository root. */
export const MANIFEST_PATH = "docs/security/threat-model.json";

/** Directory that holds one MDX threat model per surface. */
export const MODEL_DIR = "docs/security/threat-models";

/** Every SvelteKit server route that must be owned by a surface. */
export const ROUTE_SERVER_GLOBS = [
  "src/routes/**/+server.ts",
  "src/routes/**/+page.server.ts",
] as const;

/** A review older than this is reported as stale by `--check`. */
export const STALE_AFTER_MONTHS = 12;

/** Directories that never hold surface source (build output, VCS, caches). */
const WALK_IGNORED_DIRECTORIES = new Set([
  ".compiledCollections",
  ".git",
  ".svelte-kit",
  ".vitest",
  "build",
  "coverage",
  "dist",
  "mediaFolder",
  "node_modules",
  "test-media",
]);

// --- Paths & globs ---

/** Converts a platform path to the forward-slash form used in the manifest. */
export function toPosixPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

/** Locale-independent ordering so fingerprints are identical on every platform. */
export function comparePaths(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

const globCache = new Map<string, RegExp>();

/**
 * Compiles a minimal glob into a regular expression.
 * `**` matches any number of segments, `*` matches within one segment.
 * Characters with a regex meaning are escaped, so `(app)` works literally.
 */
function globToRegExp(pattern: string): RegExp {
  const cached = globCache.get(pattern);
  if (cached) return cached;

  let source = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === "*") {
      if (pattern[index + 1] === "*") {
        index += 1;
        if (pattern[index + 1] === "/") {
          // `**/` matches zero or more leading segments.
          index += 1;
          source += "(?:.*/)?";
        } else {
          source += ".*";
        }
      } else {
        source += "[^/]*";
      }
    } else if ("\\^$.|?+()[]{}".includes(char)) {
      source += `\\${char}`;
    } else {
      source += char;
    }
  }
  source += "$";

  const compiled = new RegExp(source);
  globCache.set(pattern, compiled);
  return compiled;
}

/** True when `candidate` matches a manifest glob (both are POSIX-normalised). */
export function matchGlob(pattern: string, candidate: string): boolean {
  return globToRegExp(toPosixPath(pattern)).test(toPosixPath(candidate));
}

/** Recursively lists files below `baseAbs` as root-relative POSIX paths. */
function walkFiles(baseAbs: string, cwd: string): string[] {
  const found: string[] = [];
  const pending: string[] = [baseAbs];

  while (pending.length > 0) {
    const current = pending.pop() as string;
    let entries: Dirent[];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      // Unreadable directory: skip instead of aborting the whole gate.
      continue;
    }

    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const absolute = join(current, entry.name);
      if (entry.isDirectory()) {
        if (!WALK_IGNORED_DIRECTORIES.has(entry.name)) pending.push(absolute);
      } else if (entry.isFile()) {
        found.push(toPosixPath(relative(cwd, absolute)));
      }
    }
  }

  return found.sort(comparePaths);
}

/** Resolves a set of globs to unique, sorted root-relative file paths. */
function resolveGlobFiles(patterns: readonly string[], cwd: string): string[] {
  const matches = new Set<string>();
  const walkCache = new Map<string, string[]>();

  for (const rawPattern of patterns) {
    const pattern = toPosixPath(rawPattern);
    const segments = pattern.split("/");
    const wildcardIndex = segments.findIndex((segment) => segment.includes("*"));

    if (wildcardIndex === -1) {
      const absolute = resolve(cwd, ...segments);
      if (existsSync(absolute) && statSync(absolute).isFile()) matches.add(pattern);
      continue;
    }

    const baseSegments = segments.slice(0, wildcardIndex);
    const baseAbsolute = resolve(cwd, ...baseSegments);
    if (!existsSync(baseAbsolute) || !statSync(baseAbsolute).isDirectory()) continue;

    let files = walkCache.get(baseAbsolute);
    if (!files) {
      files = walkFiles(baseAbsolute, cwd);
      walkCache.set(baseAbsolute, files);
    }
    for (const file of files) {
      if (matchGlob(pattern, file)) matches.add(file);
    }
  }

  return [...matches].sort(comparePaths);
}

// --- Fingerprints ---

/** A file that contributes to a surface fingerprint. */
export interface SurfaceFile {
  /** Root-relative POSIX path. */
  path: string;
  /** UTF-8 file content. */
  content: string;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Stable surface fingerprint: sha256 over sorted `path \0 sha256(content)`
 * entries. Reordering the input never changes the digest; one changed byte does.
 */
export function computeFingerprint(files: readonly SurfaceFile[]): string {
  const entries = files
    .map((file) => `${toPosixPath(file.path)}\u0000${sha256Hex(file.content)}`)
    .sort(comparePaths);
  return sha256Hex(entries.join("\n"));
}

/** Reads and fingerprints the files currently matched by a surface. */
export function fingerprintSurface(
  surface: Pick<ThreatSurface, "paths">,
  cwd: string,
): { files: string[]; fingerprint: string } {
  const files = resolveSurfaceFiles(surface, cwd);
  const fingerprint = computeFingerprint(
    files.map((file) => ({ path: file, content: readFileSync(resolve(cwd, file), "utf8") })),
  );
  return { files, fingerprint };
}

// --- Manifest schema ---

function isCalendarDate(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

const IsoDateSchema = v.pipe(
  v.string(),
  v.regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
  v.check(isCalendarDate, "expected a real calendar date"),
);

const FingerprintSchema = v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/, "expected sha256 hex"));

/** One security surface and the files whose change invalidates its review. */
export const ThreatSurfaceSchema = v.object({
  id: v.pipe(v.string(), v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "expected kebab-case id")),
  description: v.pipe(v.string(), v.minLength(1)),
  paths: v.pipe(v.array(v.pipe(v.string(), v.minLength(1))), v.minLength(1)),
  model: v.pipe(
    v.string(),
    v.regex(/^docs\/security\/threat-models\/[a-z0-9-]+\.mdx$/, "expected threat model path"),
  ),
  reviewed_at: IsoDateSchema,
  fingerprint: FingerprintSchema,
});

/** Versioned manifest stored at `docs/security/threat-model.json`. */
export const ManifestSchema = v.pipe(
  v.object({
    version: v.literal(1),
    surfaces: v.pipe(v.array(ThreatSurfaceSchema), v.minLength(1)),
  }),
  v.check(
    (manifest) =>
      new Set(manifest.surfaces.map((surface) => surface.id)).size === manifest.surfaces.length,
    "surface ids must be unique",
  ),
);

/** Parsed threat surface. */
export type ThreatSurface = v.InferOutput<typeof ThreatSurfaceSchema>;

/** Parsed threat-model manifest. */
export type Manifest = v.InferOutput<typeof ManifestSchema>;

/** Validates untrusted JSON and returns a typed manifest (throws on bad input). */
export function parseManifest(value: unknown): Manifest {
  return v.parse(ManifestSchema, value);
}

// --- Evaluation ---

/** Aggregate result of `evaluateManifest`. */
export interface ThreatModelEvaluation {
  /** Surface ids whose files no longer match the recorded fingerprint (or match nothing). */
  drifted: string[];
  /** Surface ids whose MDX model file is missing. */
  missingModels: string[];
  /** Route server files owned by no surface. */
  uncovered: string[];
  /** Surface ids whose `reviewed_at` is older than 12 months. */
  stale: string[];
  /** Route-server coverage, independent of fingerprint drift. */
  coverage: { covered: number; total: number; percent: number };
}

/** Resolves every file matched by a surface (deduplicated, sorted, POSIX paths). */
export function resolveSurfaceFiles(surface: Pick<ThreatSurface, "paths">, cwd: string): string[] {
  return resolveGlobFiles(surface.paths, cwd);
}

function parseDateValue(value: Date | string): Date {
  if (value instanceof Date) return new Date(value.getTime());
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid date: ${value}`);
  return parsed;
}

/** Subtracts whole calendar months, clamping to the last day of the target month. */
function minusMonths(value: Date, months: number): Date {
  const year = value.getUTCFullYear();
  const monthIndex = value.getUTCMonth() - months;
  const targetYear = year + Math.floor(monthIndex / 12);
  const targetMonth = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(targetYear, targetMonth, Math.min(value.getUTCDate(), lastDay)));
}

/** True when a review is strictly older than 12 months relative to `now`. */
export function isStale(reviewedAt: string, now: Date | string): boolean {
  const reviewed = parseDateValue(reviewedAt);
  const cutoff = minusMonths(parseDateValue(now), STALE_AFTER_MONTHS);
  return reviewed.getTime() < cutoff.getTime();
}

/**
 * Evaluates a manifest against the tree at `cwd`:
 * fingerprint drift, missing models, uncovered server routes and stale reviews.
 */
export function evaluateManifest(
  manifest: Manifest,
  cwd: string,
  now: Date | string = new Date(),
): ThreatModelEvaluation {
  const routeFiles = resolveGlobFiles(ROUTE_SERVER_GLOBS, cwd);
  const covered = new Set<string>();
  const drifted: string[] = [];
  const missingModels: string[] = [];
  const stale: string[] = [];

  for (const surface of manifest.surfaces) {
    const { files, fingerprint } = fingerprintSurface(surface, cwd);
    for (const file of files) covered.add(file);

    // A surface that matches nothing is treated as drift: the pattern broke.
    if (files.length === 0 || fingerprint !== surface.fingerprint) drifted.push(surface.id);
    if (!existsSync(resolve(cwd, surface.model))) missingModels.push(surface.id);
    if (isStale(surface.reviewed_at, now)) stale.push(surface.id);
  }

  const uncovered = routeFiles.filter((file) => !covered.has(file));
  const total = routeFiles.length;
  const coveredCount = total - uncovered.length;

  return {
    drifted,
    missingModels,
    uncovered,
    stale,
    coverage: {
      covered: coveredCount,
      total,
      percent: total === 0 ? 100 : Math.round((coveredCount / total) * 1000) / 10,
    },
  };
}
