/**
 * @vitest-environment node
 * @file tests/unit/plugins/smart-importer-cli.test.ts
 * @description Unit tests for migration CLI argument parsing.
 */

import { describe, it, expect } from "vitest";
import { parseCLIArgs } from "@plugins/smart-importer/cli";

describe("smart-importer CLI", () => {
  it("parseCLIArgs extracts command and flags", () => {
    const args = parseCLIArgs([
      "import",
      "--file=export.xml",
      "--format=wordpress",
      "--collection=posts",
      "--import-media",
      "--batch-size=50",
    ]);

    expect(args.command).toBe("import");
    expect(args.file).toBe("export.xml");
    expect(args.format).toBe("wordpress");
    expect(args.collection).toBe("posts");
    expect(args.importMedia).toBe(true);
    expect(args.batchSize).toBe(50);
  });

  it("defaults command to help when empty", () => {
    expect(parseCLIArgs([]).command).toBe("help");
  });
});
