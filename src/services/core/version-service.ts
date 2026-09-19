/**
 * @file src/services/core/version-service.ts
 * @description
 * Core service for version detection and update checking.
 *
 * SveltyCMS uses two branches:
 * - `next`: Active development — all features and fixes land here.
 * - `main`: Production — merged from `next` when stable. Releases triggered by tags.
 *
 * This service reads the installed version from package.json and checks the
 * GitHub Releases API for a newer release.
 *
 * ### Features:
 * - local version detection from package.json (read once per process, then cached)
 * - update check against GitHub with a User-Agent, a 5s timeout and a typed failure path
 * - `compareVersions()` — SemVer ordering including `v` prefixes, missing segments,
 *   build metadata and prerelease/dev identifiers (`0.0.10-dev.3` > `0.0.9`, < `0.0.10`)
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { nowISODateString } from "@utils/date";
import { logger } from "@utils/logger";
import * as v from "valibot";

/** Result of an update check — the wire contract of `GET /api/system/version/check`. */
export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  checkedAt: string;
  error?: string;
}

const GITHUB_RELEASES_URL = "https://api.github.com/repos/SveltyCMS/SveltyCMS/releases";
const USER_AGENT = "SveltyCMS-Version-Check";
const FETCH_TIMEOUT_MS = 5000;
/** Used when package.json cannot be read or carries no usable version. */
const FALLBACK_VERSION = "0.0.0";

/** Minimal shape of the GitHub releases payload; anything else is a typed failure. */
const GitHubReleaseSchema = v.object({
  tag_name: v.string(),
  prerelease: v.optional(v.boolean(), false),
});

/**
 * Read once per process — package.json cannot change while the process runs.
 */
let cachedLocalVersion: string | null = null;

/** Human-readable message for any thrown value (never assume an Error instance). */
function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  return String(error);
}

/**
 * Reads the installed version from package.json, cached for the process lifetime.
 * Falls back to `0.0.0` (logged) when the file is missing or unreadable.
 */
export function readLocalVersion(): string {
  if (cachedLocalVersion !== null) return cachedLocalVersion;

  try {
    cachedLocalVersion = readPackageVersion() ?? FALLBACK_VERSION;
  } catch (err) {
    logger.warn(`[VersionService] Could not read package.json version: ${errorMessage(err)}`);
    cachedLocalVersion = FALLBACK_VERSION;
  }

  return cachedLocalVersion;
}

/** Extracts `version` from package.json contents; `null` when absent or empty. */
function readPackageVersion(): string | null {
  const parsed: unknown = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf-8"));
  if (typeof parsed !== "object" || parsed === null || !("version" in parsed)) return null;

  const version = parsed.version;
  return typeof version === "string" && version.trim() ? version.trim() : null;
}

/**
 * Compares two version strings semantically.
 *
 * Handles `v` prefixes, trailing build metadata, unequal segment counts
 * (`1.0` === `1.0.0`) and prerelease identifiers per SemVer §11:
 * numeric identifiers compare numerically, numeric ranks below alphanumeric,
 * and a prerelease ranks below its own release (`0.0.10-dev.3` < `0.0.10`).
 *
 * @returns `-1` when `a` is older, `1` when `a` is newer, `0` when equal.
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const left = parseVersion(a);
  const right = parseVersion(b);

  const segments = Math.max(left.numbers.length, right.numbers.length);
  for (let i = 0; i < segments; i++) {
    const diff = (left.numbers[i] ?? 0) - (right.numbers[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }

  if (left.prerelease && !right.prerelease) return -1;
  if (!left.prerelease && right.prerelease) return 1;
  if (left.prerelease && right.prerelease) {
    return comparePrerelease(left.prerelease, right.prerelease);
  }

  return 0;
}

interface ParsedVersion {
  numbers: number[];
  prerelease: string[] | null;
}

/** Parses a version into numeric segments + prerelease identifiers, ignoring `v`/build metadata. */
function parseVersion(raw: string): ParsedVersion {
  const core = raw.trim().replace(/^[vV]/, "").split("+")[0] ?? "";

  const separator = core.indexOf("-");
  const corePart = separator === -1 ? core : core.slice(0, separator);
  const prereleasePart = separator === -1 ? "" : core.slice(separator + 1);

  const numbers = corePart.split(".").map((segment) => {
    const parsed = Number.parseInt(segment, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  });

  const identifiers = prereleasePart.split(".").filter(Boolean);
  return { numbers, prerelease: identifiers.length > 0 ? identifiers : null };
}

/** SemVer §11 precedence for two non-empty prerelease identifier lists. */
function comparePrerelease(a: string[], b: string[]): -1 | 0 | 1 {
  const identifiers = Math.max(a.length, b.length);

  for (let i = 0; i < identifiers; i++) {
    const left = a[i];
    const right = b[i];
    // A shorter list of identifiers ranks lower when all preceding ones match.
    if (left === undefined) return -1;
    if (right === undefined) return 1;

    const leftNumber = /^\d+$/.test(left) ? Number.parseInt(left, 10) : null;
    const rightNumber = /^\d+$/.test(right) ? Number.parseInt(right, 10) : null;

    if (leftNumber !== null && rightNumber !== null) {
      if (leftNumber !== rightNumber) return leftNumber > rightNumber ? 1 : -1;
      continue;
    }
    if (leftNumber !== null) return -1;
    if (rightNumber !== null) return 1;
    if (left !== right) return left > right ? 1 : -1;
  }

  return 0;
}

/**
 * Compares the installed version against the latest GitHub release.
 *
 * Never throws: a GitHub/network failure is reported through `error` together
 * with `updateAvailable: false`, so callers can render a status without
 * try/catch handling.
 */
export async function checkForUpdates(): Promise<UpdateCheckResult> {
  const currentVersion = readLocalVersion();
  const checkedAt = nowISODateString();

  try {
    const response = await fetch(GITHUB_RELEASES_URL, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/vnd.github.v3+json",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      const reason = `GitHub API returned ${response.status}`;
      logger.warn(`[VersionService] ${reason} (${response.statusText})`);
      return {
        currentVersion,
        latestVersion: null,
        updateAvailable: false,
        checkedAt,
        error: reason,
      };
    }

    const parsed = v.safeParse(v.array(GitHubReleaseSchema), await response.json());
    if (!parsed.success) {
      const reason = "Unexpected GitHub releases payload";
      logger.warn(`[VersionService] ${reason}: ${parsed.issues[0]?.message ?? "unknown issue"}`);
      return {
        currentVersion,
        latestVersion: null,
        updateAvailable: false,
        checkedAt,
        error: reason,
      };
    }

    // Prefer the newest stable release; only fall back to a prerelease when none exists.
    const latestRelease = parsed.output.find((release) => !release.prerelease) ?? parsed.output[0];
    if (!latestRelease) {
      const reason = "No releases found";
      logger.warn(`[VersionService] ${reason}`);
      return {
        currentVersion,
        latestVersion: null,
        updateAvailable: false,
        checkedAt,
        error: reason,
      };
    }

    const latestVersion = latestRelease.tag_name.trim().replace(/^[vV]/, "");
    return {
      currentVersion,
      latestVersion,
      updateAvailable: compareVersions(latestVersion, currentVersion) > 0,
      checkedAt,
    };
  } catch (err) {
    const message = errorMessage(err);
    logger.warn(`[VersionService] Update check failed: ${message}`);
    return {
      currentVersion,
      latestVersion: null,
      updateAvailable: false,
      checkedAt,
      error: message,
    };
  }
}
