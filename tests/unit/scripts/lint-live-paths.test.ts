/**
 * @file tests/unit/scripts/lint-live-paths.test.ts
 * @description Fixtures for the live-config path scanner: every static live
 * constant outside the resolvers is an offense; comments and reviewed
 * suppressions are accepted.
 */

import { describe, expect, it } from "vitest";
import { findLivePathReferences } from "../../../scripts/lint/lint-live-paths";

const file = (path: string, source: string) => ({ path, source });

describe("findLivePathReferences", () => {
  it("flags live path constants in test-reachable code", () => {
    const offenses = findLivePathReferences([
      file("src/services/x.ts", "const dir = paths.collections;\n"),
      file("src/services/y.ts", "const db = DEFAULT_DATABASE_DIR;\n"),
    ]);

    expect(offenses).toHaveLength(2);
    expect(offenses[0]).toMatchObject({ file: "src/services/x.ts", match: "paths.collections" });
    expect(offenses[1]).toMatchObject({ file: "src/services/y.ts", match: "DEFAULT_DATABASE_DIR" });
  });

  it("ignores comments and the resolver allowlist", () => {
    const offenses = findLivePathReferences([
      file("src/services/z.ts", "// never read paths.collections in a test\n"),
      file("src/utils/path-resolver.ts", "export const live = paths.collections;\n"),
    ]);

    expect(offenses).toEqual([]);
  });

  it("honours the suppression marker", () => {
    const offenses = findLivePathReferences([
      file("src/services/w.ts", "// lint-live-paths: allow\nconst dir = paths.collections;\n"),
    ]);

    expect(offenses).toEqual([]);
  });
});
