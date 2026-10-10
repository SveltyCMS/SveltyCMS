#!/usr/bin/env bun
/**
 * @file scripts/version.ts
 * @description
 * Derives the next SveltyCMS release version from git history and writes it
 * into package.json, so nobody has to hand-edit version numbers before a
 * release. The release workflow then tags exactly the version the manifest
 * carries — the two can never drift apart.
 *
 * Version source (reported on every run):
 * - the highest `v*` tag reachable from HEAD = the latest released version on
 *   this branch. `git describe --tags --abbrev=0 --match 'v*'` is used as a
 *   cross-check and flagged when it disagrees: describe picks the *nearest*
 *   tag by commit distance, which is not the highest version when tags were
 *   created out of order (this repo tagged v0.0.8 before v0.0.7).
 * - package.json when no `v*` tag exists yet.
 * - an explicit `MAJOR.MINOR.PATCH` literal on the command line, which wins over
 *   both: the manifest is set to exactly that version and no commit is
 *   inspected (`bun run version:bump 0.0.10`). This is the escape hatch for a
 *   release the tag-derived policy cannot express — e.g. when the pending
 *   manifest version is untagged and will never be released.
 *
 * Auto policy (default) — Conventional Commits subjects mapped to SemVer,
 * highest rule first:
 * | commits since the last tag                                   | result            |
 * | ------------------------------------------------------------ | ----------------- |
 * | `BREAKING CHANGE` body marker or `type!:` subject, 0.x       | minor (SemVer §4) |
 * | same marker once major >= 1                                  | major (SemVer §8) |
 * | `feat` subject (new backwards-compatible functionality)      | minor (SemVer §7) |
 * | everything else (fix, perf, refactor, docs, chore, ci, …)    | patch (SemVer §6) |
 * SemVer §7 makes MINOR the home of new backwards-compatible functionality, so
 * `feat` never ships as a patch; §4 lets 0.y.z change anything, which is why a
 * breaking commit on 0.x is a minor (release-please's `bump-minor-pre-major`
 * stance). A mixed range follows the highest rule that applies: breaking >
 * feat > everything else, so `feat!:` on 1.x outranks the `fix` commits next
 * to it. Explicit `patch|minor|major` arguments override detection; an explicit
 * `MAJOR.MINOR.PATCH` target skips detection entirely and is written as given
 * (canonicalised: no `v` prefix, no leading zeros, no prerelease/build suffix).
 *
 * Safety:
 * - refuses to run (except --dry-run, which only previews and warns) when
 *   package.json has uncommitted changes
 * - refuses a version that already carries a `v*` tag (the case the release
 *   workflow used to swallow as "Tag already exists — skipping tag creation")
 * - refuses to downgrade package.json
 * - applies the same refusals to an explicit target: an invalid literal, a
 *   version that already carries a tag, or one lower than package.json
 * - rewrites package.json in place, preserving its formatting and newline
 * - never creates a commit or a tag
 *
 * Usage:
 *   bun run version:bump                # auto (default)
 *   bun run version:bump patch|minor|major
 *   bun run version:bump 0.0.10         # set exactly this version (no detection)
 *   bun run version:bump --dry-run      # print the decision, write nothing
 *   bun run version:verify              # check package.json ↔ sbom.json, write nothing
 *
 * Features:
 * - dependency-free (node:child_process + node:fs only)
 * - `decideBump()` is pure and exported, so the policy is unit-tested without
 *   git (tests/unit/scripts/version-bump.test.ts)
 * - shows the source tag, the policy reason and the commits it decided from
 * - keeps the CycloneDX root component (`sbom.json` `metadata.component`) in
 *   lockstep with the manifest in the same write, so a bump does not depend on
 *   the pre-commit hook to avoid an SBOM/manifest drift
 * - `version:verify` asserts that lockstep (and a clean SemVer) read-only — the
 *   release workflow runs it before tagging so drift fails the release
 * - idempotent: a no-op when package.json already holds the proposed version,
 *   with a note explaining why and the explicit form to use for a different one
 * - `parseCliArgs()`, `parseTargetVersion()`, `assertProposalAccepted()`,
 *   `explainNoOp()`, `readPackageIdentity()`, `syncSbomVersion()` and
 *   `findSbomDrift()` are pure and exported, so the argument contract, both
 *   refusals and the SBOM contract are unit-tested without spawning the process
 */

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const PACKAGE_PATH = "package.json";
const SBOM_PATH = "sbom.json";
const RELEASE_TAG = /^v(\d+\.\d+\.\d+)$/;
const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/;
/** CLI target literal: `0.0.10` or `v0.0.10` — the tag shape CI can actually create. */
const TARGET_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)$/;
const BREAKING_MARKER = /\bBREAKING[ -]CHANGE\b/;
/** `type`, optional `(scope)`, optional `!`, then the `: ` Conventional Commits requires. */
const CONVENTIONAL_SUBJECT = /^([a-z]+)(?:\([^)]*\))?(!)?:\s/i;
const EVIDENCE_COMMITS = 5;
const USAGE =
  "usage: bun run version:bump [auto|patch|minor|major|x.y.z] [--dry-run] | bun run version:bump --verify";

/** Command label used by `fail()` — `version:bump`, or `version:verify` in verify mode. */
let commandLabel = "version:bump";

export type BumpKind = "auto" | "patch" | "minor" | "major";
export type ConcreteBump = Exclude<BumpKind, "auto">;

export interface BumpDecision {
  kind: ConcreteBump;
  reason: string;
  evidence: string[];
}

/** What the CLI was asked for: a bump kind (auto included) or an exact version. */
export type BumpRequest = { mode: "kind"; kind: BumpKind } | { mode: "target"; version: string };

export interface CliArgs {
  dryRun: boolean;
  /** Consistency-only mode: check package.json ↔ sbom.json, write nothing. */
  verify: boolean;
  request: BumpRequest;
}

interface GitResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

interface CommitRecord {
  hash: string;
  subject: string;
  body: string;
}

interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
}

function fail(message: string): never {
  console.error(`\n❌ ${commandLabel}: ${message}\n`);
  process.exit(1);
}

function git(args: string[]): GitResult {
  const result = spawnSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    // No shell: array args must reach git verbatim (Windows would word-split
    // them otherwise, mangling `--match 'v*'`).
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stderr = (result.stderr ?? "").trim();
  const spawnError = result.error ? ` (${result.error.message})` : "";
  return {
    ok: result.status === 0,
    stdout: (result.stdout ?? "").trim(),
    stderr: `${stderr}${spawnError}`.trim(),
  };
}

/** Throws instead of exiting so the parsing also serves the pure policy function. */
function parseVersion(value: string, context: string): ParsedVersion {
  const match = VERSION_PATTERN.exec(value);
  if (!match) {
    throw new Error(`cannot parse ${context} version "${value}" — expected MAJOR.MINOR.PATCH`);
  }
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function formatVersion(version: ParsedVersion): string {
  return `${version.major}.${version.minor}.${version.patch}`;
}

function compareVersions(a: ParsedVersion, b: ParsedVersion): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

function bumpVersion(current: ParsedVersion, kind: ConcreteBump): ParsedVersion {
  if (kind === "major") return { major: current.major + 1, minor: 0, patch: 0 };
  if (kind === "minor") return { major: current.major, minor: current.minor + 1, patch: 0 };
  return { major: current.major, minor: current.minor, patch: current.patch + 1 };
}

/** Applies a bump kind to a MAJOR.MINOR.PATCH string. Exported for unit tests. */
export function nextVersion(current: string, kind: ConcreteBump): string {
  return formatVersion(bumpVersion(parseVersion(current, "current"), kind));
}

/**
 * Validates an explicit CLI version target (`0.0.10`, `v0.0.10`) and returns the
 * canonical form. Only the plain `MAJOR.MINOR.PATCH` shape passes: the release
 * workflow tags `vX.Y.Z` and nothing else, so a prerelease, build metadata or a
 * leading zero is refused instead of written into a manifest CI cannot tag.
 * Exported for unit tests; throws instead of exiting.
 */
export function parseTargetVersion(value: string): string {
  const literal = value.trim();
  const match = TARGET_PATTERN.exec(literal);
  if (!match) {
    throw new Error(
      `cannot parse version target "${value}" — expected a literal MAJOR.MINOR.PATCH (e.g. 0.0.10)`,
    );
  }
  const canonical = `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`;
  if (canonical !== literal.replace(/^v/, "")) {
    throw new Error(
      `version target "${value}" is not canonical — write ${canonical}: no leading zeros, no prerelease or build metadata`,
    );
  }
  return canonical;
}

/**
 * Refuses the two release hazards this script exists to catch: re-releasing a
 * version that already carries a `v*` tag, and moving package.json backwards.
 * The tag lookup is passed in as data, so both refusals are pure and unit-tested
 * against the shipped messages. Returns the proposal-vs-manifest comparison
 * (0 = already at it, > 0 = ahead) for the caller's no-op check.
 */
export function assertProposalAccepted(
  proposed: string,
  current: string,
  alreadyTagged: boolean,
): number {
  if (alreadyTagged) {
    throw new Error(
      `version ${proposed} already has a v* tag — refusing to re-release.\n` +
        `   The release workflow tags whatever ${PACKAGE_PATH} says, so releasing it again would\n` +
        `   re-point at an existing release (the old "Tag already exists" swallow in CI).\n` +
        `   Pass a different version (e.g. \`bun run version:bump <x.y.z>\`), or delete the stale tag if it was created by mistake.`,
    );
  }
  const comparison = compareVersions(
    parseVersion(proposed, "proposal"),
    parseVersion(current, PACKAGE_PATH),
  );
  if (comparison < 0) {
    throw new Error(
      `version ${proposed} is lower than ${PACKAGE_PATH} ${current} — refusing to downgrade.\n` +
        `   Pass a higher version (e.g. \`bun run version:bump <x.y.z>\`).`,
    );
  }
  return comparison;
}

/**
 * Wording for the no-op case (proposal == manifest), which used to read as a
 * bare "nothing to write". A tag-derived proposal repeats the manifest exactly
 * when the manifest already is the next release above the newest tag, so the
 * note says that and the hint names the explicit form for anything else.
 * Exported for unit tests.
 */
export function explainNoOp(
  current: string,
  latestTag: string | null,
): { note: string; hint: string } {
  return {
    note: latestTag
      ? `${current} is already the next release above ${latestTag}, which has no tag yet — a tag-based bump keeps re-deriving it until that release is tagged`
      : `${PACKAGE_PATH} is the version source (no v* tag to derive from) and already holds the proposed version`,
    hint: `To release a different version, pass it explicitly: bun run version:bump ${nextVersion(current, "patch")}`,
  };
}

/** Conventional-Commit `!` (or a `BREAKING CHANGE` footer) marks an incompatible change. */
function hasBreakingMarker(subject: string, body: string): boolean {
  const bang = CONVENTIONAL_SUBJECT.exec(subject)?.[2];
  return bang === "!" || BREAKING_MARKER.test(body);
}

/** Only an exact `feat` type carries new functionality — `feature:` is a prose subject. */
function isFeatureSubject(subject: string): boolean {
  return CONVENTIONAL_SUBJECT.exec(subject)?.[1]?.toLowerCase() === "feat";
}

/**
 * Pure Conventional-Commits → SemVer policy. Exported so the rules are
 * testable without git. `current` is the released version the bump starts
 * from: it only decides whether a breaking change is a minor (major = 0,
 * SemVer §4) or a major (SemVer §8). Highest rule wins: breaking > feat >
 * everything else. `evidence` names the commit subjects that drove the
 * decision (all inspected subjects when the outcome is plain patch).
 */
export function decideBump(
  current: string,
  requested: BumpKind,
  subjects: string[],
  bodies: string[] = [],
): BumpDecision {
  if (requested !== "auto") {
    return {
      kind: requested,
      reason: `explicit ${requested} argument — commit detection skipped`,
      evidence: [],
    };
  }

  const version = parseVersion(current, "current");

  const breaking = subjects.filter((subject, index) =>
    hasBreakingMarker(subject, bodies[index] ?? ""),
  );
  if (breaking.length > 0) {
    const kind: ConcreteBump = version.major === 0 ? "minor" : "major";
    return {
      kind,
      reason:
        kind === "minor"
          ? `${breaking.length} breaking change(s) on 0.x — SemVer §4: anything may change before 1.0.0`
          : `${breaking.length} breaking change(s) with major ≥ 1 — SemVer §8: incompatible API change`,
      evidence: breaking,
    };
  }

  const features = subjects.filter((subject) => isFeatureSubject(subject));
  if (features.length > 0) {
    return {
      kind: "minor",
      reason: `${features.length} feat commit(s) — SemVer §7: MINOR adds backwards-compatible functionality`,
      evidence: features,
    };
  }

  return {
    kind: "patch",
    reason:
      "no feat and no breaking change — SemVer §6: PATCH carries backwards-compatible fixes only",
    evidence: [...subjects],
  };
}

function readCommits(range: string): CommitRecord[] {
  const log = git(["log", "--format=%H%x1f%s%x1f%b%x1e", range]);
  if (!log.ok) fail(`cannot read commits for ${range} (${log.stderr || "unknown git error"})`);
  return log.stdout
    .split("\x1e")
    .filter((record) => record.trim().length > 0)
    .map((record) => {
      const [hash, subject, body] = record.trim().split("\x1f");
      return { hash: (hash ?? "").trim(), subject: (subject ?? "").trim(), body: body ?? "" };
    });
}

/** Highest `v*` tag reachable from HEAD, or null when the branch has none. */
function latestReachableRelease(): { tag: string; version: string } | null {
  const tags = git(["tag", "--merged", "HEAD", "--list", "v*"]);
  if (!tags.ok) {
    fail(`cannot list git tags reachable from HEAD (${tags.stderr || "unknown git error"})`);
  }
  const releases = tags.stdout
    .split("\n")
    .map((tag) => ({ tag: tag.trim(), version: RELEASE_TAG.exec(tag.trim())?.[1] }))
    .filter((entry): entry is { tag: string; version: string } => entry.version !== undefined)
    .sort((a, b) =>
      compareVersions(parseVersion(b.version, "git tag"), parseVersion(a.version, "git tag")),
    );
  return releases[0] ?? null;
}

function readPackageVersion(raw: string): string {
  let parsed: { version?: unknown };
  try {
    parsed = JSON.parse(raw) as { version?: unknown };
  } catch (error) {
    throw new Error(
      `package.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (typeof parsed.version !== "string" || parsed.version.length === 0) {
    throw new Error('package.json has no non-empty string "version" field');
  }
  return parsed.version;
}

/** Replaces only the top-level version value, keeping every other byte intact. Exported for unit tests. */
export function replaceVersionField(raw: string, from: string, to: string): string {
  const span = locateVersionValue(raw, from);
  return raw.slice(0, span.start + 1) + to + raw.slice(span.end);
}

/**
 * The manifest identity the CycloneDX root component must mirror. Throws when
 * package.json is not JSON or lacks a non-empty string `name`/`version`, so a
 * broken manifest fails loudly instead of writing a half-formed SBOM.
 * Exported for unit tests.
 */
export function readPackageIdentity(raw: string): { name: string; version: string } {
  let parsed: { name?: unknown };
  try {
    parsed = JSON.parse(raw) as { name?: unknown };
  } catch (error) {
    throw new Error(
      `package.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (typeof parsed.name !== "string" || parsed.name.length === 0) {
    throw new Error('package.json has no non-empty string "name" field');
  }
  return { name: parsed.name, version: readPackageVersion(raw) };
}

/**
 * Rewrites the CycloneDX root component (`metadata.component`) to the manifest's
 * name + version, preserving every other byte (key order + the repository's
 * 2-space, no-trailing-newline format). Returns the updated text, or `null` when
 * the BOM is unparseable or carries no root component — a bump must not fail on
 * an SBOM the pre-commit hook regenerates anyway (the caller warns instead).
 * Exported for unit tests.
 */
export function syncSbomVersion(raw: string, name: string, version: string): string | null {
  let bom: { metadata?: { component?: Record<string, unknown> } };
  try {
    bom = JSON.parse(raw) as typeof bom;
  } catch {
    return null;
  }
  const component = bom.metadata?.component;
  if (!component || typeof component !== "object") return null;
  return JSON.stringify(
    {
      ...bom,
      metadata: {
        ...bom.metadata,
        component: { ...component, name, version, purl: `pkg:npm/${name}@${version}` },
      },
    },
    null,
    2,
  );
}

/**
 * Consistency problems between the manifest and the SBOM root component (empty
 * = in lockstep). `version:bump --verify` runs this before the release workflow
 * tags, so a hand-edited or stale SBOM can never ship under a mismatched version.
 * Exported for unit tests.
 */
export function findSbomDrift(sbomRaw: string, name: string, version: string): string[] {
  let bom: { metadata?: { component?: Record<string, unknown> } };
  try {
    bom = JSON.parse(sbomRaw) as typeof bom;
  } catch (error) {
    return [
      `${SBOM_PATH} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    ];
  }
  const component = bom.metadata?.component;
  if (!component) return [`${SBOM_PATH} has no metadata.component to check`];
  const expectedPurl = `pkg:npm/${name}@${version}`;
  const problems: string[] = [];
  if (component.name !== name) {
    problems.push(`${SBOM_PATH} name ${String(component.name)} ≠ ${name}`);
  }
  if (component.version !== version) {
    problems.push(`${SBOM_PATH} version ${String(component.version)} ≠ ${version}`);
  }
  if (component.purl !== expectedPurl) {
    problems.push(`${SBOM_PATH} purl ${String(component.purl)} ≠ ${expectedPurl}`);
  }
  return problems;
}

/**
 * Byte span of the top-level `"version"` **value** (quotes included), located by a
 * depth-tracking scan over the raw JSON text. Whole string tokens are skipped, so an
 * escaped quote cannot shift the depth and neither a nested `"version"` key nor the
 * word inside a value can ever be rewritten. The previous line-anchored regex only
 * matched a pretty-printed manifest and reported `could not locate the top-level
 * "version" field` for a minified one whose field was right there — a lie the release
 * path cannot afford, now that `--release` bumps the manifest automatically.
 * Exported for unit tests.
 */
export function locateVersionValue(raw: string, from: string): { start: number; end: number } {
  let depth = 0;
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw.charAt(index);
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      continue;
    }
    if (char !== '"') continue;

    let end = index + 1;
    while (end < raw.length) {
      const current = raw.charAt(end);
      if (current === "\\") {
        end += 2;
        continue;
      }
      if (current === '"') break;
      end += 1;
    }
    const token = raw.slice(index, end + 1);

    if (depth === 1 && token === '"version"') {
      const separator = /^[ \t\r\n]*:[ \t\r\n]*/.exec(raw.slice(end + 1));
      if (!separator) {
        throw new Error('the top-level "version" field has no `:` separator');
      }
      const valueStart = end + 1 + separator[0].length;
      if (raw.charAt(valueStart) !== '"') {
        throw new Error('the top-level "version" field is not a string');
      }
      let valueEnd = valueStart + 1;
      while (valueEnd < raw.length) {
        const current = raw.charAt(valueEnd);
        if (current === "\\") {
          valueEnd += 2;
          continue;
        }
        if (current === '"') break;
        valueEnd += 1;
      }
      const found = raw.slice(valueStart + 1, valueEnd);
      if (found !== from) {
        throw new Error(
          `first "version" field is "${found}" but the parsed version is "${from}" — refusing to rewrite`,
        );
      }
      return { start: valueStart, end: valueEnd };
    }

    index = end;
  }
  throw new Error('could not locate the top-level "version" field in package.json');
}

function report(label: string, value: string): void {
  console.log(`   ${label.padEnd(13)} ${value}`);
}

/**
 * `--verify`: assert package.json is a clean SemVer and the CycloneDX BOM's root
 * component matches it exactly, then exit. Read-only — the release workflow runs
 * it before tagging, so a drift between the two files fails the release instead
 * of shipping a mismatched version.
 */
function verifyManifestConsistency(): void {
  const raw = readFileSync(PACKAGE_PATH, "utf8");
  const { name, version } = readPackageIdentity(raw);
  if (!VERSION_PATTERN.test(version)) {
    fail(`${PACKAGE_PATH} version "${version}" is not a MAJOR.MINOR.PATCH release version`);
  }

  console.log(`\n🔖 ${commandLabel}\n`);
  report("manifest", `${PACKAGE_PATH} ${name}@${version}`);

  let sbomRaw: string;
  try {
    sbomRaw = readFileSync(SBOM_PATH, "utf8");
  } catch {
    fail(`${SBOM_PATH} is missing — regenerate it with \`bun run audit:sbom\``);
  }
  const problems = findSbomDrift(sbomRaw, name, version);
  if (problems.length > 0) {
    fail(`${PACKAGE_PATH} and ${SBOM_PATH} disagree:\n   - ${problems.join("\n   - ")}`);
  }
  report("sbom", `${SBOM_PATH} metadata.component ${name}@${version}`);
  report("result", "consistent — safe to tag and publish");
  console.log();
}

/**
 * Pure argv parser: `auto|patch|minor|major`, one explicit `MAJOR.MINOR.PATCH`
 * target, and `--dry-run` in any position. Anything else — an unknown flag, a
 * malformed literal, a second version argument — throws, so the CLI contract is
 * unit-tested without spawning the process.
 */
export function parseCliArgs(argv: string[]): CliArgs {
  let dryRun = false;
  let verify = false;
  let request: BumpRequest | null = null;
  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--verify") {
      verify = true;
      continue;
    }
    if (request) throw new Error(`more than one version argument given — ${USAGE}`);
    if (arg === "auto" || arg === "patch" || arg === "minor" || arg === "major") {
      request = { mode: "kind", kind: arg };
    } else if (/^v?\d/.test(arg)) {
      request = { mode: "target", version: parseTargetVersion(arg) };
    } else {
      throw new Error(`unknown argument "${arg}" — ${USAGE}`);
    }
  }
  return { dryRun, verify, request: request ?? { mode: "kind", kind: "auto" } };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function main(): void {
  const { dryRun, verify, request } = parseCliArgs(process.argv.slice(2));

  // ── 0. Verify mode: consistency only, nothing is written ──────────────
  if (verify) {
    commandLabel = "version:verify";
    verifyManifestConsistency();
    return;
  }

  const target = request.mode === "target" ? request.version : "";
  const requested: BumpKind = request.mode === "kind" ? request.kind : "auto";

  // ── 1. Safety gate: the manifest must be clean (dry-run only warns) ───────

  const raw = readFileSync(PACKAGE_PATH, "utf8");
  const dirty = git(["status", "--porcelain", "--", PACKAGE_PATH]);
  if (!dirty.ok) fail(`git status failed (${dirty.stderr || "unknown git error"})`);
  const dirtyWarning = dirty.stdout
    ? `${PACKAGE_PATH} has uncommitted changes — a real run refuses until they are committed`
    : "";
  if (dirtyWarning && !dryRun) {
    fail(
      `${PACKAGE_PATH} has uncommitted changes — commit or stash them before bumping.\n` +
        `   Pass --dry-run to preview the decision without touching the file.`,
    );
  }

  const currentRaw = readPackageVersion(raw);

  // ── 2. Version source: explicit target, else the latest reachable v* tag ──

  const latest = latestReachableRelease();
  const commits = target === "" && latest ? readCommits(`${latest.tag}..HEAD`) : [];
  const breaking = commits.filter((commit) => hasBreakingMarker(commit.subject, commit.body));
  const features = commits.filter((commit) => isFeatureSubject(commit.subject));

  // ── 3. Proposal: the explicit target verbatim, else the bump policy ───────

  let sourceLabel: string;
  let proposedRaw: string;
  let reason = "";
  let evidence: string[] = [];

  if (target !== "") {
    sourceLabel = `explicit target ${target} — commit detection skipped`;
    proposedRaw = target;
  } else {
    const sourceRaw = latest ? latest.version : currentRaw;
    sourceLabel = latest
      ? `git tag v${latest.version} (highest v* tag reachable from HEAD)`
      : `${PACKAGE_PATH} ${currentRaw} (no v* tag found)`;
    const decision = decideBump(
      sourceRaw,
      requested,
      commits.map((commit) => commit.subject),
      commits.map((commit) => commit.body),
    );
    proposedRaw = nextVersion(sourceRaw, decision.kind);
    reason = `${decision.kind} — ${decision.reason}`;
    evidence = decision.evidence;
  }

  // ── 4. Guards: no re-release, no downgrade ────────────────────────────────

  const tagged = git(["tag", "--list", `v${proposedRaw}`]);
  if (!tagged.ok)
    fail(`cannot look up tag v${proposedRaw} (${tagged.stderr || "unknown git error"})`);
  const comparison = assertProposalAccepted(proposedRaw, currentRaw, tagged.stdout !== "");

  // ── 5. Report the evidence, then write ────────────────────────────────────

  const label =
    target !== ""
      ? `explicit target ${target}`
      : requested === "auto"
        ? "auto"
        : `explicit ${requested}`;
  console.log();
  console.log(`🔖 version:bump — ${label}`);
  console.log();
  report("source", sourceLabel);
  if (target !== "") {
    report(
      "tags",
      latest
        ? `highest reachable v* tag is ${latest.tag} — a target must not be it`
        : "no v* tag reachable from HEAD yet",
    );
  } else if (latest) {
    report(
      "commits",
      `${latest.tag}..HEAD — ${commits.length} inspected, ${features.length} feat, ${breaking.length} breaking marker(s)`,
    );
    const describe = git(["describe", "--tags", "--abbrev=0", "--match", "v*"]);
    if (describe.ok && describe.stdout && describe.stdout !== latest.tag) {
      report(
        "tag note",
        `git describe prefers ${describe.stdout} (nearest, not highest) — using ${latest.tag}`,
      );
    }
  } else {
    report("commits", "none — no baseline tag to diff against");
  }

  report("manifest", `${PACKAGE_PATH} ${currentRaw}`);
  if (dirtyWarning) report("warning", dirtyWarning);
  if (target === "") report("bump", reason);
  if (evidence.length > 0) {
    report("decides", `${evidence.length} commit(s):`);
    for (const subject of evidence.slice(0, EVIDENCE_COMMITS)) {
      console.log(`                 - ${subject}`);
    }
    if (evidence.length > EVIDENCE_COMMITS) {
      console.log(`                 … ${evidence.length - EVIDENCE_COMMITS} more`);
    }
  }
  report("proposal", `${currentRaw} → ${proposedRaw}`);

  if (commits.length > 0) {
    const shown = commits.slice(0, EVIDENCE_COMMITS);
    report("inspected", `latest ${shown.length} of ${commits.length} commit(s):`);
    for (const commit of shown) {
      console.log(`                 - ${commit.hash.slice(0, 7)} ${commit.subject}`);
    }
    if (commits.length > shown.length) {
      console.log(`                 … ${commits.length - shown.length} more`);
    }
  }

  if (comparison === 0) {
    report("result", `${PACKAGE_PATH} already at ${proposedRaw} — nothing to write`);
    if (target === "") {
      const guidance = explainNoOp(currentRaw, latest ? latest.tag : null);
      report("note", guidance.note);
      report("hint", guidance.hint);
    } else {
      report(
        "note",
        `requested version ${proposedRaw} already matches the manifest — idempotent, nothing to do`,
      );
    }
    console.log();
    process.exit(0);
  }
  if (dryRun) {
    report("result", `dry-run — ${PACKAGE_PATH} left untouched`);
    console.log();
    process.exit(0);
  }

  const updated = replaceVersionField(raw, currentRaw, proposedRaw);
  try {
    const roundTrip = JSON.parse(updated) as { version?: unknown };
    if (roundTrip.version !== proposedRaw) {
      throw new Error(`version field reads back as ${String(roundTrip.version)}`);
    }
  } catch (error) {
    fail(
      `rewritten ${PACKAGE_PATH} failed the round-trip check (${error instanceof Error ? error.message : String(error)}) — nothing written`,
    );
  }
  writeFileSync(PACKAGE_PATH, updated, "utf8");

  // Keep the CycloneDX BOM in lockstep with the manifest. The pre-commit hook
  // regenerates it whenever package.json is staged, but a bump that never runs
  // that hook (the CI release job commits directly) must not ship a mismatched
  // SBOM — so the version is written here too. A missing/unreadable SBOM only
  // warns: regenerating it is `bun run audit:sbom`.
  try {
    const sbomRaw = readFileSync(SBOM_PATH, "utf8");
    const identity = readPackageIdentity(updated);
    const synced = syncSbomVersion(sbomRaw, identity.name, proposedRaw);
    if (synced === null) {
      report(
        "sbom",
        `${SBOM_PATH} has no readable metadata.component — the pre-commit hook regenerates it`,
      );
    } else if (synced !== sbomRaw) {
      writeFileSync(SBOM_PATH, synced, "utf8");
      report("sbom", `${SBOM_PATH} metadata.component → ${identity.name}@${proposedRaw}`);
    } else {
      report("sbom", `${SBOM_PATH} already at ${proposedRaw}`);
    }
  } catch {
    report("sbom", `${SBOM_PATH} not found — skipped (regenerate with \`bun run audit:sbom\`)`);
  }

  report("result", `wrote ${PACKAGE_PATH}: ${currentRaw} → ${proposedRaw}`);
  report("next", "review the diff, commit, merge to main — CI creates the tag and release");
  console.log();
}

if (import.meta.main) {
  try {
    main();
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}
