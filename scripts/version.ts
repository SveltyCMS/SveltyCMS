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
 * to it. Explicit `patch|minor|major` arguments override detection.
 *
 * Safety:
 * - refuses to run (except --dry-run, which only previews and warns) when
 *   package.json has uncommitted changes
 * - refuses a version that already carries a `v*` tag (the case the release
 *   workflow used to swallow as "Tag already exists — skipping tag creation")
 * - refuses to downgrade package.json
 * - rewrites package.json in place, preserving its formatting and newline
 * - never creates a commit or a tag
 *
 * Usage:
 *   bun run version:bump                # auto (default)
 *   bun run version:bump patch|minor|major
 *   bun run version:bump --dry-run      # print the decision, write nothing
 *
 * Features:
 * - dependency-free (node:child_process + node:fs only)
 * - `decideBump()` is pure and exported, so the policy is unit-tested without
 *   git (tests/unit/scripts/version-bump.test.ts)
 * - shows the source tag, the policy reason and the commits it decided from
 * - idempotent: a no-op when package.json already holds the derived version
 */

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const PACKAGE_PATH = "package.json";
const RELEASE_TAG = /^v(\d+\.\d+\.\d+)$/;
const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/;
const BREAKING_MARKER = /\bBREAKING[ -]CHANGE\b/;
/** `type`, optional `(scope)`, optional `!`, then the `: ` Conventional Commits requires. */
const CONVENTIONAL_SUBJECT = /^([a-z]+)(?:\([^)]*\))?(!)?:\s/i;
const EVIDENCE_COMMITS = 5;
const USAGE = "usage: bun run version:bump [auto|patch|minor|major] [--dry-run]";

export type BumpKind = "auto" | "patch" | "minor" | "major";
export type ConcreteBump = Exclude<BumpKind, "auto">;

export interface BumpDecision {
  kind: ConcreteBump;
  reason: string;
  evidence: string[];
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
  console.error(`\n❌ version:bump: ${message}\n`);
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

/** Replaces only the top-level version value, keeping every other byte intact. */
function replaceVersionField(raw: string, from: string, to: string): string {
  const pattern = /^([ \t]*"version"[ \t]*:[ \t]*)"([^"]*)"([ \t]*,[ \t]*)?$/m;
  const match = pattern.exec(raw);
  if (!match) throw new Error('could not locate the top-level "version" field in package.json');
  if (match[2] !== from) {
    throw new Error(
      `first "version" field is "${match[2]}" but the parsed version is "${from}" — refusing to rewrite`,
    );
  }
  const line = `${match[1]}"${to}"${match[3] ?? ""}`;
  return raw.slice(0, match.index) + line + raw.slice(match.index + match[0].length);
}

function report(label: string, value: string): void {
  console.log(`   ${label.padEnd(13)} ${value}`);
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function main(): void {
  let dryRun = false;
  let requested: BumpKind = "auto";
  for (const arg of process.argv.slice(2)) {
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "auto" || arg === "patch" || arg === "minor" || arg === "major") {
      if (requested !== "auto") fail(`multiple bump kinds given — ${USAGE}`);
      requested = arg;
    } else {
      fail(`unknown argument "${arg}" — ${USAGE}`);
    }
  }

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
  const currentVersion = parseVersion(currentRaw, PACKAGE_PATH);

  // ── 2. Version source: latest reachable v* tag, package.json fallback ─────

  const latest = latestReachableRelease();
  const sourceRaw = latest ? latest.version : currentRaw;
  const sourceLabel = latest
    ? `git tag v${latest.version} (highest v* tag reachable from HEAD)`
    : `${PACKAGE_PATH} ${currentRaw} (no v* tag found)`;

  // ── 3. Bump kind: explicit flag or the auto policy ────────────────────────

  const commits = latest ? readCommits(`${latest.tag}..HEAD`) : [];
  const breaking = commits.filter((commit) => hasBreakingMarker(commit.subject, commit.body));
  const features = commits.filter((commit) => isFeatureSubject(commit.subject));
  const decision = decideBump(
    sourceRaw,
    requested,
    commits.map((commit) => commit.subject),
    commits.map((commit) => commit.body),
  );

  const proposedRaw = nextVersion(sourceRaw, decision.kind);

  // ── 4. Guards: no re-release, no downgrade ────────────────────────────────

  const tagged = git(["tag", "--list", `v${proposedRaw}`]);
  if (!tagged.ok)
    fail(`cannot look up tag v${proposedRaw} (${tagged.stderr || "unknown git error"})`);
  if (tagged.stdout) {
    fail(
      `derived version ${proposedRaw} already has a v* tag — refusing to re-release.\n` +
        `   The release workflow tags whatever ${PACKAGE_PATH} says, so releasing it again would\n` +
        `   re-point at an existing release (the old "Tag already exists" swallow in CI).\n` +
        `   Bump explicitly (e.g. \`bun run version:bump minor\`) or delete the stale tag if it was created by mistake.`,
    );
  }

  const comparison = compareVersions(parseVersion(proposedRaw, "proposal"), currentVersion);
  if (comparison < 0) {
    fail(
      `derived version ${proposedRaw} is lower than ${PACKAGE_PATH} ${currentRaw} — refusing to downgrade.\n` +
        `   Tag the pending release first, or pass an explicit bump kind.`,
    );
  }

  // ── 5. Report the evidence, then write ────────────────────────────────────

  console.log();
  console.log(`🔖 version:bump — ${requested === "auto" ? "auto" : `explicit ${requested}`}`);
  console.log();
  report("source", sourceLabel);
  if (latest) {
    report(
      "commits",
      `${latest.tag}..HEAD — ${commits.length} inspected, ${features.length} feat, ${breaking.length} breaking marker(s)`,
    );
  } else {
    report("commits", "none — no baseline tag to diff against");
  }

  const describe = git(["describe", "--tags", "--abbrev=0", "--match", "v*"]);
  if (latest && describe.ok && describe.stdout && describe.stdout !== latest.tag) {
    report(
      "tag note",
      `git describe prefers ${describe.stdout} (nearest, not highest) — using ${latest.tag}`,
    );
  }

  report("manifest", `${PACKAGE_PATH} ${currentRaw}`);
  if (dirtyWarning) report("warning", dirtyWarning);
  report("bump", `${decision.kind} — ${decision.reason}`);
  if (decision.evidence.length > 0) {
    report("decides", `${decision.evidence.length} commit(s):`);
    for (const subject of decision.evidence.slice(0, EVIDENCE_COMMITS)) {
      console.log(`                 - ${subject}`);
    }
    if (decision.evidence.length > EVIDENCE_COMMITS) {
      console.log(`                 … ${decision.evidence.length - EVIDENCE_COMMITS} more`);
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
