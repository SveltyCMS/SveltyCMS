/**
 * @file tests/unit/api/version.test.ts
 * @description
 * Unit tests for the real version service (`src/services/core/version-service.ts`).
 *
 * Features tested:
 * - `compareVersions()` ordering: patch/minor/major, equal, older, `v` prefix,
 *   multi-digit segments, unequal segment counts, prerelease/dev precedence
 * - `checkForUpdates()` against a stubbed `fetch`: update available, up to date,
 *   GitHub HTTP failure, network failure, empty list, malformed payload
 * - `readLocalVersion()` against the real package.json
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkForUpdates, compareVersions, readLocalVersion } from "@services/core/version-service";

/** The version this repo actually ships — the service must report exactly this. */
const PACKAGE_VERSION = (
  JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf-8")) as {
    version: string;
  }
).version;

/** Same major/minor with the patch bumped — a multi-digit bump for the current release. */
const NEXT_PATCH = `${PACKAGE_VERSION.split(".").slice(0, 2).join(".")}.${
  Number.parseInt(PACKAGE_VERSION.split(".")[2] ?? "0", 10) + 1
}`;

/** Guaranteed newer than PACKAGE_VERSION, whatever the current release is. */
const NEXT_MAJOR = `${Number.parseInt(PACKAGE_VERSION.split(".")[0] ?? "0", 10) + 1}.0.0`;

type FetchArgs = [input: RequestInfo | URL, init?: RequestInit];

/** Stubs global `fetch` with a GitHub releases payload — or a thrown / non-OK failure. */
function stubFetch(outcome: Response | Error) {
  const mock = vi.fn((..._args: FetchArgs) =>
    outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

/** GitHub releases list response. */
function releasesResponse(releases: Array<{ tag_name: string; prerelease?: boolean }>): Response {
  return new Response(JSON.stringify(releases), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("compareVersions — SemVer ordering", () => {
  it("detects a newer patch version", () => {
    expect(compareVersions("0.0.8", "0.0.7")).toBe(1);
  });

  it("detects a newer minor version", () => {
    expect(compareVersions("0.1.0", "0.0.9")).toBe(1);
  });

  it("detects a newer major version", () => {
    expect(compareVersions("1.0.0", "0.9.9")).toBe(1);
  });

  it("returns 0 for equal versions", () => {
    expect(compareVersions("0.0.7", "0.0.7")).toBe(0);
  });

  it("orders an older version below a newer one", () => {
    expect(compareVersions("0.0.6", "0.0.7")).toBe(-1);
    expect(compareVersions("0.0.7", "0.0.6")).toBe(1);
  });

  it("ignores a `v` prefix on either side", () => {
    expect(compareVersions("v0.0.8", "0.0.7")).toBe(1);
    expect(compareVersions("0.0.7", "V0.0.8")).toBe(-1);
    expect(compareVersions("v1.2.3", "v1.2.3")).toBe(0);
  });

  it("compares multi-digit segments numerically, not lexically", () => {
    expect(compareVersions("0.0.10", "0.0.9")).toBe(1);
    expect(compareVersions("0.0.9", "0.0.10")).toBe(-1);
    expect(compareVersions("0.10.0", "0.9.0")).toBe(1);
  });

  it("treats missing segments as zero", () => {
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.0.1", "1.0")).toBe(1);
  });

  it("ignores build metadata", () => {
    expect(compareVersions("1.0.0+build.5", "1.0.0")).toBe(0);
  });

  it("ranks a dev/prerelease above the previous release but below its own release", () => {
    expect(compareVersions("0.0.10-dev.3", "0.0.9")).toBe(1);
    expect(compareVersions("0.0.10-dev.3", "0.0.10")).toBe(-1);
    expect(compareVersions("0.0.10", "0.0.10-dev.3")).toBe(1);
  });

  it("orders prerelease identifiers by SemVer §11 precedence", () => {
    expect(compareVersions("1.0.0-rc.10", "1.0.0-rc.2")).toBe(1);
    expect(compareVersions("1.0.0-alpha", "1.0.0-beta")).toBe(-1);
    expect(compareVersions("1.0.0-rc", "1.0.0-rc.1")).toBe(-1);
    expect(compareVersions("1.0.0-alpha.1", "1.0.0-alpha")).toBe(1);
  });

  it("treats unparsable input as 0.0.0 instead of throwing", () => {
    expect(compareVersions("unknown", "0.0.0")).toBe(0);
  });
});

describe("checkForUpdates — GitHub responses", () => {
  it("reports an available update with the documented payload and request", async () => {
    const fetchMock = stubFetch(
      releasesResponse([{ tag_name: `v${NEXT_PATCH}`, prerelease: false }]),
    );

    const result = await checkForUpdates();

    expect(result.currentVersion).toBe(PACKAGE_VERSION);
    expect(result.latestVersion).toBe(NEXT_PATCH);
    expect(result.updateAvailable).toBe(true);
    expect(result.error).toBeUndefined();
    // Wire contract consumed by src/components/version-check.svelte.
    expect(Object.keys(result).sort()).toEqual([
      "checkedAt",
      "currentVersion",
      "latestVersion",
      "updateAvailable",
    ]);
    expect(new Date(result.checkedAt).toISOString()).toBe(result.checkedAt);

    const call = fetchMock.mock.calls[0] ?? [];
    expect(String(call[0])).toContain("api.github.com/repos/SveltyCMS/SveltyCMS/releases");
    expect((call[1]?.headers as Record<string, string> | undefined)?.["User-Agent"]).toBe(
      "SveltyCMS-Version-Check",
    );
    expect(call[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("reports up to date when the latest release matches the installed version", async () => {
    stubFetch(releasesResponse([{ tag_name: `v${PACKAGE_VERSION}` }]));

    const result = await checkForUpdates();

    expect(result.latestVersion).toBe(PACKAGE_VERSION);
    expect(result.updateAvailable).toBe(false);
    expect(result.error).toBeUndefined();
  });

  it("prefers the newest stable release over a newer prerelease", async () => {
    stubFetch(
      releasesResponse([
        { tag_name: `v${NEXT_MAJOR}-rc.1`, prerelease: true },
        { tag_name: `v${NEXT_PATCH}`, prerelease: false },
      ]),
    );

    const result = await checkForUpdates();

    expect(result.latestVersion).toBe(NEXT_PATCH);
    expect(result.updateAvailable).toBe(compareVersions(NEXT_PATCH, PACKAGE_VERSION) > 0);
  });

  it("falls back to a prerelease when no stable release exists", async () => {
    stubFetch(releasesResponse([{ tag_name: `v${NEXT_MAJOR}-dev.1`, prerelease: true }]));

    const result = await checkForUpdates();

    expect(result.latestVersion).toBe(`${NEXT_MAJOR}-dev.1`);
    expect(result.updateAvailable).toBe(true);
  });

  it("reports a GitHub HTTP failure as a typed error, never as an update", async () => {
    stubFetch(new Response(null, { status: 403, statusText: "Forbidden" }));

    const result = await checkForUpdates();

    expect(result.updateAvailable).toBe(false);
    expect(result.latestVersion).toBeNull();
    expect(result.error).toContain("403");
    expect(Object.keys(result).sort()).toEqual([
      "checkedAt",
      "currentVersion",
      "error",
      "latestVersion",
      "updateAvailable",
    ]);
  });

  it("reports a network failure as a typed error", async () => {
    stubFetch(new Error("connect ECONNREFUSED"));

    const result = await checkForUpdates();

    expect(result.error).toBe("connect ECONNREFUSED");
    expect(result.updateAvailable).toBe(false);
    expect(result.latestVersion).toBeNull();
    expect(result.currentVersion).toBe(PACKAGE_VERSION);
  });

  it("reports an empty release list instead of claiming an update", async () => {
    stubFetch(releasesResponse([]));

    const result = await checkForUpdates();

    expect(result.error).toBe("No releases found");
    expect(result.updateAvailable).toBe(false);
    expect(result.latestVersion).toBeNull();
  });

  it("rejects a malformed GitHub payload as a typed error", async () => {
    stubFetch(
      new Response(JSON.stringify([{ name: "missing tag_name" }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await checkForUpdates();

    expect(result.error).toBe("Unexpected GitHub releases payload");
    expect(result.updateAvailable).toBe(false);
  });
});

describe("readLocalVersion", () => {
  it("returns the package.json version, cached across calls", () => {
    expect(readLocalVersion()).toBe(PACKAGE_VERSION);
    expect(readLocalVersion()).toBe(PACKAGE_VERSION);
  });
});
