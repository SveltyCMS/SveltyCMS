/**
 * @file src/services/core/version-service.ts
 * @description
 * Core service for managing SveltyCMS version channels (LTS, Stable, Next).
 *
 * Responsibilities include:
 * - Defining available release channels and their version ranges
 * - Detecting the active channel based on the installed version
 * - Comparing local version against remote release tags
 *
 * ### Features:
 * - channel enumeration (lts, stable, next)
 * - channel auto-detection from package.json
 * - lightweight update checking via GitHub Releases API
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { logger } from "@utils/logger";

// ─── Channel Definitions ────────────────────────────────────────────

/**
 * Release channel version ranges.
 *
 * - **lts**: Long-Term Support — patch-only updates within the current minor.
 * - **stable**: Current production release — latest stable features.
 * - **next**: Preview channel — upcoming minor/major features ahead of stable.
 */
export const CHANNELS = {
  lts: "v0.0.x",
  stable: "v0.0.x",
  next: "v0.1.x",
} as const;

export type ChannelName = keyof typeof CHANNELS;

export interface ChannelInfo {
  name: ChannelName;
  range: string;
  label: string;
}

export interface UpdateCheckResult {
  channel: ChannelName;
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
  private readonly userAgent = "SveltyCMS-Version-Channel";

  private constructor() {}

  public static getInstance(): VersionService {
    if (!VersionService.instance) {
      VersionService.instance = new VersionService();
    }
    return VersionService.instance;
  }

  // ─── Channel Detection ──────────────────────────────────────────

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
   * Determines the active release channel based on the installed version.
   *
   * Logic:
   * - Versions matching `0.0.x` resolve to `lts`.
   * - Versions matching `0.1.x` (or higher minor) resolve to `next` if pre-release,
   *   otherwise `stable`.
   */
  getCurrentChannel(): ChannelName {
    const version = this.readLocalVersion();
    const [major, minor] = version.split(".").map(Number);

    if (major === 0 && minor === 0) return "lts";

    // If the version contains a pre-release tag (e.g., `0.1.0-beta.1`), it's next
    if (version.includes("-")) return "next";

    // Otherwise, higher minors are on the stable channel
    return "stable";
  }

  /**
   * Returns metadata for all available channels.
   */
  getAvailableChannels(): ChannelInfo[] {
    return (Object.entries(CHANNELS) as [ChannelName, string][]).map(([name, range]) => ({
      name,
      range,
      label:
        name === "lts"
          ? "Long-Term Support"
          : name === "stable"
            ? "Stable Release"
            : "Next (Preview)",
    }));
  }

  // ─── Update Checking ────────────────────────────────────────────

  /**
   * Compares the installed version against the latest release on GitHub.
   *
   * Returns `updateAvailable: true` if a newer release exists for the active channel.
   */
  async checkForUpdates(): Promise<UpdateCheckResult> {
    const channel = this.getCurrentChannel();
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
          channel,
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
          channel,
          currentVersion,
          latestVersion: null,
          updateAvailable: false,
          checkedAt: new Date().toISOString(),
          error: "No releases found",
        };
      }

      // Filter releases by channel: next includes prereleases; lts/stable only full releases
      const relevantReleases =
        channel === "next" ? releases : releases.filter((r) => !r.prerelease);

      const latestRelease = relevantReleases[0];

      if (!latestRelease) {
        return {
          channel,
          currentVersion,
          latestVersion: null,
          updateAvailable: false,
          checkedAt: new Date().toISOString(),
        };
      }

      const latestVersion = latestRelease.tag_name.replace(/^v/, "");
      const updateAvailable = this.isNewer(latestVersion, currentVersion);

      return {
        channel,
        currentVersion,
        latestVersion,
        updateAvailable,
        checkedAt: new Date().toISOString(),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      logger.error(`[VersionService] Update check failed: ${message}`);
      return {
        channel,
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
