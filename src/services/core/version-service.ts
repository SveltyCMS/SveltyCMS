/**
 * @file src/services/core/version-service.ts
 * @description
 * Core service for version detection and update checking.
 *
 * SveltyCMS uses two branches:
 * - `next`: Active development — all features and fixes land here.
 * - `main`: Production — merged from `next` when stable. Releases triggered by tags.
 *
 * This service reads the installed version from package.json and checks
 * GitHub Releases for newer versions.
 *
 * ### Features:
 * - local version detection from package.json
 * - update checking via GitHub Releases API
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { logger } from "@utils/logger";

export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  checkedAt: string;
  error?: string;
}

// ─── Version Service ────────────────────────────────────────────────

export class VersionService {
  private static instance: VersionService;
  private readonly repoReleasesUrl = "https://api.github.com/repos/SveltyCMS/SveltyCMS/releases";
  private readonly userAgent = "SveltyCMS-Version-Check";

  private constructor() {}

  public static getInstance(): VersionService {
    if (!VersionService.instance) {
      VersionService.instance = new VersionService();
    }
    return VersionService.instance;
  }

  /**
   * Reads the installed version from package.json.
   */
  readLocalVersion(): string {
    try {
      const pkgPath = resolve(process.cwd(), "package.json");
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      return String(pkg.version || "0.0.0");
    } catch {
      logger.warn("[VersionService] Could not read package.json version");
      return "0.0.0";
    }
  }

  /**
   * Compares the installed version against the latest release on GitHub.
   *
   * Returns `updateAvailable: true` if a newer release exists.
   */
  async checkForUpdates(): Promise<UpdateCheckResult> {
    const currentVersion = this.readLocalVersion();

    try {
      const response = await fetch(this.repoReleasesUrl, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "application/vnd.github.v3+json",
        },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        logger.warn(
          `[VersionService] GitHub API returned ${response.status}: ${response.statusText}`,
        );
        return {
          currentVersion,
          latestVersion: null,
          updateAvailable: false,
          checkedAt: new Date().toISOString(),
          error: `GitHub API returned ${response.status}`,
        };
      }

      const releases: Array<{ tag_name: string; prerelease: boolean }> = await response.json();

      if (!Array.isArray(releases) || releases.length === 0) {
        return {
          currentVersion,
          latestVersion: null,
          updateAvailable: false,
          checkedAt: new Date().toISOString(),
          error: "No releases found",
        };
      }

      // Use the latest non-prerelease release
      const latestRelease = releases.find((r) => !r.prerelease) ?? releases[0];

      if (!latestRelease) {
        return {
          currentVersion,
          latestVersion: null,
          updateAvailable: false,
          checkedAt: new Date().toISOString(),
        };
      }

      const latestVersion = latestRelease.tag_name.replace(/^v/, "");
      const updateAvailable = this.isNewer(latestVersion, currentVersion);

      return {
        currentVersion,
        latestVersion,
        updateAvailable,
        checkedAt: new Date().toISOString(),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      logger.error(`[VersionService] Update check failed: ${message}`);
      return {
        currentVersion,
        latestVersion: null,
        updateAvailable: false,
        checkedAt: new Date().toISOString(),
        error: message,
      };
    }
  }

  /**
   * Compares two semver strings. Returns true if `latest` > `current`.
   */
  private isNewer(latest: string, current: string): boolean {
    const toNumbers = (v: string) => v.split(".").map((n) => parseInt(n, 10) || 0);

    const a = toNumbers(latest);
    const b = toNumbers(current);

    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const diff = (a[i] || 0) - (b[i] || 0);
      if (diff !== 0) return diff > 0;
    }

    return false; // equal versions
  }
}

/** Singleton instance — use this for all version operations. */
export const versionService = VersionService.getInstance();
