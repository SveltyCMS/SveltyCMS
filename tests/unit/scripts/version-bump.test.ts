/**
 * @file tests/unit/scripts/version-bump.test.ts
 * @description Regression tests for the release-bump policy in
 * `scripts/version.ts`. The real `decideBump()` / `nextVersion()` exports are
 * imported — never re-implemented — so the SemVer mapping (MINOR for `feat`,
 * breaking changes minor on 0.x and major after, everything else patch) is
 * asserted against the code that ships. The explicit-target contract on top of
 * it (argv parsing, the literal parser, and both release refusals) is asserted
 * the same way: `parseCliArgs()`, `parseTargetVersion()`,
 * `assertProposalAccepted()` and `explainNoOp()` are called directly, so the
 * process is never spawned.
 */

import { describe, it, expect } from "vitest";
import {
  assertProposalAccepted,
  decideBump,
  explainNoOp,
  nextVersion,
  parseCliArgs,
  parseTargetVersion,
} from "../../../scripts/version";

/** `feat(area-N): …` subjects, one per requested count. */
function featSubjects(count: number): string[] {
  return Array.from(
    { length: count },
    (_, index) => `feat(area-${index % 7}): add capability ${index}`,
  );
}

describe("decideBump — patch-level commits", () => {
  it("bumps patch for a fix commit (SemVer §6)", () => {
    const decision = decideBump("0.4.2", "auto", ["fix(media): repair upload retry"]);

    expect(decision.kind).toBe("patch");
    expect(decision.reason).toContain("SemVer §6");
    expect(decision.evidence).toEqual(["fix(media): repair upload retry"]);
  });

  it("bumps patch when every commit is a patch-level type", () => {
    const subjects = [
      "fix(a): one",
      "perf(b): two",
      "refactor(c): three",
      "docs: four",
      "chore(d): five",
      "test(e): six",
      "build: seven",
      "ci: eight",
      "style: nine",
      "revert: ten",
    ];

    const decision = decideBump("0.4.2", "auto", subjects);

    expect(decision.kind).toBe("patch");
    expect(decision.reason).toContain("SemVer §6");
    expect(decision.evidence).toEqual(subjects);
  });

  it("bumps patch for merge commits and subjects that are not Conventional Commits", () => {
    const decision = decideBump("0.4.2", "auto", [
      "Merge branch 'next' into main",
      "Merge pull request #42 from SveltyCMS/fix/upload",
      "wip",
      "Fix the thing",
      "feature: add stuff",
      "feat without a colon",
      "enhance(ui): tidy spacing",
    ]);

    expect(decision.kind).toBe("patch");
    expect(decision.evidence).toHaveLength(7);
  });
});

describe("decideBump — feature commits", () => {
  it("bumps minor for a feat commit (SemVer §7: MINOR = new functionality)", () => {
    const decision = decideBump("0.4.2", "auto", ["feat(content): add scheduled publishing"]);

    expect(decision.kind).toBe("minor");
    expect(decision.reason).toContain("SemVer §7");
    expect(decision.reason).toContain("1 feat commit(s)");
    expect(decision.evidence).toEqual(["feat(content): add scheduled publishing"]);
  });

  it("takes the highest rule when a range mixes feat and fix", () => {
    const decision = decideBump("0.4.2", "auto", [
      "fix(a): one",
      "feat(b): two",
      "docs: three",
      "fix(c): four",
    ]);

    expect(decision.kind).toBe("minor");
    expect(decision.reason).toContain("1 feat commit(s)");
    expect(decision.evidence).toEqual(["feat(b): two"]);
  });

  it("names every feat commit in evidence when several decide the bump", () => {
    const decision = decideBump("0.9.3", "auto", [
      "chore: tidy",
      "feat(search): add facets",
      "fix(media): retry",
      "feat(api): expose widget schema",
    ]);

    expect(decision.kind).toBe("minor");
    expect(decision.reason).toContain("2 feat commit(s)");
    expect(decision.evidence).toEqual([
      "feat(search): add facets",
      "feat(api): expose widget schema",
    ]);
  });
});

describe("decideBump — breaking changes", () => {
  it("bumps minor for a breaking change while major is 0 (SemVer §4)", () => {
    const bang = decideBump("0.9.0", "auto", ["feat(api)!: drop legacy route"]);
    expect(bang.kind).toBe("minor");
    expect(bang.reason).toContain("SemVer §4");
    expect(bang.evidence).toEqual(["feat(api)!: drop legacy route"]);

    const footer = decideBump(
      "0.9.0",
      "auto",
      ["refactor(api): rework responses"],
      ["BREAKING CHANGE: response shape changed"],
    );
    expect(footer.kind).toBe("minor");
    expect(footer.reason).toContain("SemVer §4");
    expect(footer.evidence).toEqual(["refactor(api): rework responses"]);
  });

  it("bumps major for a breaking change once major is >= 1 (SemVer §8)", () => {
    const bang = decideBump("1.4.0", "auto", ["fix(api)!: reshape error payload"]);
    expect(bang.kind).toBe("major");
    expect(bang.reason).toContain("SemVer §8");
    expect(bang.evidence).toEqual(["fix(api)!: reshape error payload"]);

    const footer = decideBump(
      "2.0.0",
      "auto",
      ["fix(api): tidy"],
      ["BREAKING-CHANGE: renamed field"],
    );
    expect(footer.kind).toBe("major");
    expect(footer.evidence).toEqual(["fix(api): tidy"]);
  });

  it("aligns bodies with their subjects and lets breaking outrank feat", () => {
    const decision = decideBump(
      "1.0.0",
      "auto",
      ["fix(a): one", "chore(b): two"],
      ["", "BREAKING CHANGE: drop the v1 route"],
    );

    expect(decision.kind).toBe("major");
    expect(decision.evidence).toEqual(["chore(b): two"]);
  });

  it("keeps a breaking marker ahead of feat subjects in a mixed range", () => {
    const decision = decideBump("1.0.0", "auto", [
      "feat(a): new thing",
      "fix(b)!: reshape API",
      "feat(c): another thing",
    ]);

    expect(decision.kind).toBe("major");
    expect(decision.evidence).toEqual(["fix(b)!: reshape API"]);
  });
});

describe("decideBump — explicit overrides", () => {
  const subjects = ["feat(a): new thing", "fix(b)!: reshape API"];

  it("lets an explicit patch argument beat breaking and feat detection", () => {
    const decision = decideBump("1.2.3", "patch", subjects, ["", "BREAKING CHANGE: x"]);

    expect(decision.kind).toBe("patch");
    expect(decision.reason).toContain("explicit patch argument");
    expect(decision.evidence).toEqual([]);
  });

  it("lets an explicit minor argument beat patch detection", () => {
    const decision = decideBump("0.1.0", "minor", ["fix(a): tiny"]);

    expect(decision.kind).toBe("minor");
    expect(decision.reason).toContain("explicit minor argument");
  });

  it("lets an explicit major argument beat patch detection", () => {
    const decision = decideBump("0.1.0", "major", ["chore: tidy"]);

    expect(decision.kind).toBe("major");
    expect(decision.reason).toContain("explicit major argument");
  });
});

describe("decideBump — this repo's history", () => {
  it("proposes 0.1.0 for 94 feat commits since v0.0.8, never 0.0.9", () => {
    // v0.0.8..HEAD holds 999 commits, 94 of them `feat` and none breaking.
    const decision = decideBump("0.0.9", "auto", featSubjects(94));

    expect(decision.kind).toBe("minor");
    expect(decision.reason).toContain("94 feat commit(s)");
    expect(decision.evidence).toHaveLength(94);
    expect(nextVersion("0.0.9", decision.kind)).toBe("0.1.0");
    // The version source is the released tag, not the manifest — both give 0.1.0.
    expect(nextVersion("0.0.8", decision.kind)).toBe("0.1.0");
  });

  it("would still propose a patch when the range has no feat at all", () => {
    const decision = decideBump("0.0.9", "auto", ["fix(a): one", "perf(b): two"]);

    expect(decision.kind).toBe("patch");
    expect(nextVersion("0.0.9", decision.kind)).toBe("0.0.10");
  });
});

describe("nextVersion", () => {
  it("resets the lower components", () => {
    expect(nextVersion("1.2.3", "patch")).toBe("1.2.4");
    expect(nextVersion("1.2.3", "minor")).toBe("1.3.0");
    expect(nextVersion("1.2.3", "major")).toBe("2.0.0");
  });

  it("rejects an unparseable current version instead of guessing", () => {
    expect(() => decideBump("v1.0.0", "auto", ["feat(a): x"])).toThrow(
      /cannot parse current version/,
    );
    expect(() => nextVersion("1.0", "minor")).toThrow(/cannot parse current version/);
  });
});

describe("parseTargetVersion — explicit version literals", () => {
  it("accepts a plain literal and a v-prefixed one", () => {
    expect(parseTargetVersion("0.0.10")).toBe("0.0.10");
    expect(parseTargetVersion("v0.0.8")).toBe("0.0.8");
    expect(parseTargetVersion("1.2.3")).toBe("1.2.3");
  });

  it("refuses a partial literal instead of guessing", () => {
    expect(() => parseTargetVersion("1.0")).toThrow(/cannot parse version target "1.0"/);
    expect(() => parseTargetVersion("next")).toThrow(/expected a literal MAJOR\.MINOR\.PATCH/);
  });

  it("refuses prerelease/build metadata the release workflow cannot tag", () => {
    expect(() => parseTargetVersion("0.0.10-rc.1")).toThrow(/cannot parse version target/);
    expect(() => parseTargetVersion("0.0.10+build.5")).toThrow(/cannot parse version target/);
  });

  it("refuses a non-canonical literal with leading zeros", () => {
    expect(() => parseTargetVersion("0.0.010")).toThrow(/not canonical/);
  });
});

describe("assertProposalAccepted — release guards", () => {
  it("refuses a version that already carries a v* tag", () => {
    expect(() => assertProposalAccepted("0.0.8", "0.0.10", true)).toThrow(/refusing to re-release/);
  });

  it("refuses a downgrade even when the version is untagged", () => {
    expect(() => assertProposalAccepted("0.0.9", "0.0.10", false)).toThrow(/refusing to downgrade/);
  });

  it("accepts a target ahead of the manifest and reports the comparison", () => {
    expect(assertProposalAccepted("0.0.10", "0.0.9", false)).toBeGreaterThan(0);
  });

  it("accepts the manifest version itself — an idempotent no-op, not an error", () => {
    expect(assertProposalAccepted("0.0.10", "0.0.10", false)).toBe(0);
  });

  it("refuses an unparseable manifest version instead of guessing", () => {
    expect(() => assertProposalAccepted("0.0.10", "v0.0.9", false)).toThrow(
      /cannot parse package\.json version/,
    );
  });
});

describe("parseCliArgs — CLI contract", () => {
  it("defaults to auto without arguments", () => {
    expect(parseCliArgs([])).toEqual({ dryRun: false, request: { mode: "kind", kind: "auto" } });
  });

  it("keeps the bump kinds and accepts --dry-run in any position", () => {
    expect(parseCliArgs(["patch"]).request).toEqual({ mode: "kind", kind: "patch" });
    expect(parseCliArgs(["minor", "--dry-run"])).toEqual({
      dryRun: true,
      request: { mode: "kind", kind: "minor" },
    });
  });

  it("recognises a version literal as an explicit target", () => {
    // The CLI half of `bun run version:bump 0.0.10`.
    expect(parseCliArgs(["0.0.10"])).toEqual({
      dryRun: false,
      request: { mode: "target", version: "0.0.10" },
    });
    expect(parseCliArgs(["--dry-run", "v0.0.8"]).request).toEqual({
      mode: "target",
      version: "0.0.8",
    });
  });

  it("refuses an invalid literal", () => {
    expect(() => parseCliArgs(["1.0"])).toThrow(/cannot parse version target/);
    expect(() => parseCliArgs(["0.0.10-rc.1"])).toThrow(/cannot parse version target/);
  });

  it("refuses two version arguments and unknown ones", () => {
    expect(() => parseCliArgs(["patch", "0.0.10"])).toThrow(/more than one version argument/);
    expect(() => parseCliArgs(["--bump"])).toThrow(/unknown argument "--bump"/);
  });
});

describe("explainNoOp — the confusing no-op", () => {
  it("explains why a tag-derived proposal repeats the manifest", () => {
    const { note, hint } = explainNoOp("0.0.9", "v0.0.8");

    expect(note).toContain("next release above v0.0.8");
    expect(note).toContain("no tag yet");
    expect(hint).toContain("bun run version:bump 0.0.10");
  });

  it("falls back to the manifest being the source when no tag exists", () => {
    const { note } = explainNoOp("0.1.0", null);

    expect(note).toContain("version source");
  });
});
