/**
 * @file tests/unit/services/marketplace-checksum.test.ts
 * @description Checksum + path-safety helpers for remote marketplace install.
 */

import { describe, expect, it } from "vitest";
import {
  hashPackageFiles,
  verifyPackageChecksum,
} from "@src/services/intelligence/marketplace-client";

describe("marketplace checksum", () => {
  it("hashes files in sorted filename order", async () => {
    const a = await hashPackageFiles({ b: "two", a: "one" });
    const b = await hashPackageFiles({ a: "one", b: "two" });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects a mismatched checksum", async () => {
    const files = { "index.ts": "export {}" };
    const actual = await hashPackageFiles(files);
    const plugin = {
      id: "demo",
      checksum: "0".repeat(64),
    };
    expect(() => verifyPackageChecksum(plugin, actual)).toThrow(/Checksum mismatch/);
  });

  it("skips verification when no checksum is published", async () => {
    const files = { "index.ts": "export {}" };
    const actual = await hashPackageFiles(files);
    expect(() => verifyPackageChecksum({ id: "demo" }, actual)).not.toThrow();
  });
});
