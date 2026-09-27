/**
 * @file tests/unit/scripts/git-safe-release.test.ts
 * @description Contract tests for `--release` handling in `scripts/git-safe.ts`.
 * The wrapper must strip the flag before git sees it (git rejects unknown push
 * options) and report the bump kind the pre-push hook should run — while leaving
 * every other argument, including its position, untouched. The real
 * `extractReleaseRequest()` export is called directly, so the process is never
 * spawned; the flag is never forwarded, and a typo fails the push instead of
 * quietly arming the default bump.
 */

import { describe, it, expect } from "vitest";
import { extractReleaseRequest } from "../../../scripts/git-safe";

/** The refspecs a real release push carries (see the hook's stdin contract). */
const REFSPECS = ["origin", "HEAD:next", "HEAD:main"];

describe("extractReleaseRequest — no release request", () => {
  it("returns a copy untouched when the flag is absent", () => {
    const request = extractReleaseRequest(REFSPECS);

    expect(request.kind).toBeNull();
    expect(request.args).toEqual(REFSPECS);
    expect(request.args).not.toBe(REFSPECS);
  });

  it("does not swallow flags that merely start with `--release`", () => {
    const request = extractReleaseRequest(["origin", "--release-notes=file"]);

    expect(request.kind).toBeNull();
    expect(request.args).toEqual(["origin", "--release-notes=file"]);
  });
});

describe("extractReleaseRequest — armed", () => {
  it("defaults to auto when no kind is given", () => {
    const request = extractReleaseRequest([...REFSPECS, "--release"]);

    expect(request.kind).toBe("auto");
    expect(request.args).toEqual(REFSPECS);
  });

  it("accepts every documented bump kind", () => {
    for (const kind of ["auto", "patch", "minor", "major"] as const) {
      expect(extractReleaseRequest(["origin", `--release=${kind}`]).kind).toBe(kind);
    }
  });

  it("removes the flag in place without reordering the refspecs", () => {
    const request = extractReleaseRequest(["origin", "--release=minor", "HEAD:next", "HEAD:main"]);

    expect(request.kind).toBe("minor");
    expect(request.args).toEqual(REFSPECS);
  });

  it("refuses an unknown kind instead of arming auto", () => {
    expect(() => extractReleaseRequest(["origin", "--release=banana"])).toThrow(
      /--release=banana is not a bump kind/,
    );
  });

  it("refuses a duplicate flag", () => {
    expect(() => extractReleaseRequest(["origin", "--release", "--release=patch"])).toThrow(
      /more than once/,
    );
  });
});
