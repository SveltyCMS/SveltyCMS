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
 * Auto policy (default) — deliberately one small table:
 * | commits since the last tag                          | result               |
 * | --------------------------------------------------- | -------------------- |
 * | anything else — 0.x features ship as patches here   | patch                |
 * | `BREAKING CHANGE` in body or `type!:` in subject    | minor while major=0  |
 * | same marker, major >= 1                             | major                |
 * So `feat` does not auto-promote during 0.x; a 0.x feature release is an
 * explicit `bun run version:bump minor`.
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
 * - shows the tag → proposed version and the commits it inspected
 * - idempotent: a no-op when package.json already holds the derived version
 */

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const PACKAGE_PATH = "package.json";
const RELEASE_TAG = /^v(\d+\.\d+\.\d+)$/;
const BREAKING_MARKER = /\bBREAKING[ -]CHANGE\b/;
const BANG_SUBJECT = /^[a-z]+(?:\([^)]+\))?!:/i;
const EVIDENCE_COMMITS = 5;
const EVIDENCE_MARKERS = 5;
const USAGE = "usage: bun run version:bump [auto|patch|minor|major] [--dry-run]";

type BumpKind = "auto" | "patch" | "minor" | "major";
type ConcreteBump = Exclude<BumpKind, "auto">;

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

function parseVersion(value: string, context: string): ParsedVersion {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/.exec(value);
  if (!match) {
    fail(`cannot parse ${context} version "${value}" — expected MAJOR.MINOR.PATCH`);
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
    return fail(
      `package.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (typeof parsed.version !== "string" || parsed.version.length === 0) {
    fail('package.json has no non-empty string "version" field');
  }
  return parsed.version;
}

/** Replaces only the top-level version value, keeping every other byte intact. */
function replaceVersionField(raw: string, from: string, to: string): string {
  const pattern = /^([ \t]*"version"[ \t]*:[ \t]*)"([^"]*)"([ \t]*,[ \t]*)?$/m;
  const match = pattern.exec(raw);
  if (!match) fail('could not locate the top-level "version" field in package.json');
  if (match[2] !== from) {
    fail(
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

let dryRun = false;
let kind: BumpKind = "auto";
for (const arg of process.argv.slice(2)) {
  if (arg === "--dry-run") {
    dryRun = true;
  } else if (arg === "auto" || arg === "patch" || arg === "minor" || arg === "major") {
    if (kind !== "auto") fail(`multiple bump kinds given — ${USAGE}`);
    kind = arg;
  } else {
    fail(`unknown argument "${arg}" — ${USAGE}`);
  }
}

// ── 1. Safety gate: the manifest must be clean (dry-run only warns) ─────────

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

// ── 2. Version source: latest reachable v* tag, package.json fallback ───────

const latest = latestReachableRelease();
const sourceVersion = latest ? parseVersion(latest.version, "git tag") : currentVersion;
const sourceLabel = latest
  ? `git tag v${latest.version} (highest v* tag reachable from HEAD)`
  : `${PACKAGE_PATH} ${currentRaw} (no v* tag found)`;

// ── 3. Bump kind: explicit flag or the auto policy table ────────────────────

const commits = latest ? readCommits(`${latest.tag}..HEAD`) : [];
const breaking = commits.filter(
  (commit) =>
    BREAKING_MARKER.test(`${commit.subject}\n${commit.body}`) || BANG_SUBJECT.test(commit.subject),
);

let bumpKind: ConcreteBump;
let policy: string;
if (kind !== "auto") {
  bumpKind = kind;
  policy = "explicit on the command line";
} else if (breaking.length > 0) {
  bumpKind = sourceVersion.major === 0 ? "minor" : "major";
  policy = `breaking marker with major ${sourceVersion.major === 0 ? "= 0" : "≥ 1"}`;
} else {
  bumpKind = "patch";
  policy = "default: no breaking marker, 0.x features ship as patches";
}

const proposedVersion = bumpVersion(sourceVersion, bumpKind);
const proposedRaw = formatVersion(proposedVersion);

// ── 4. Guards: no re-release, no downgrade ──────────────────────────────────

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

const comparison = compareVersions(proposedVersion, currentVersion);
if (comparison < 0) {
  fail(
    `derived version ${proposedRaw} is lower than ${PACKAGE_PATH} ${currentRaw} — refusing to downgrade.\n` +
      `   Tag the pending release first, or pass an explicit bump kind.`,
  );
}

// ── 5. Report the evidence, then write ──────────────────────────────────────

console.log();
console.log(`🔖 version:bump — ${kind === "auto" ? "auto" : `explicit ${kind}`}`);
console.log();
report("source", sourceLabel);
if (latest) {
  report(
    "commits",
    `${latest.tag}..HEAD — ${commits.length} inspected, ${breaking.length} breaking marker(s)`,
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
report("bump", `${bumpKind} — ${policy}`);
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
if (breaking.length > 0) {
  report("breaking", `${breaking.length} marker(s):`);
  for (const commit of breaking.slice(0, EVIDENCE_MARKERS)) {
    console.log(`                 - ${commit.hash.slice(0, 7)} ${commit.subject}`);
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
