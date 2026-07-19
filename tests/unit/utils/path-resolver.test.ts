/**
 * @file tests/unit/utils/path-resolver.test.ts
 * @description Unit tests for centralized path-resolver.ts
 */
import { describe, it, expect } from "vitest";
import path from "node:path";

const CWD = process.cwd();

import { paths } from "@utils/path-resolver";

describe("path-resolver", () => {
  describe("static paths", () => {
    it("root equals process.cwd()", () => {
      expect(paths.root).toBe(CWD);
    });

    it("config resolves to config/", () => {
      expect(paths.config).toBe(path.join(CWD, "config"));
    });

    it("collections resolves to config/collections", () => {
      expect(paths.collections).toBe(path.join(CWD, "config", "collections"));
    });

    it("compiledCollections resolves to .compiledCollections", () => {
      expect(paths.compiledCollections).toBe(path.join(CWD, ".compiledCollections"));
    });

    it("media resolves to mediaFolder/global", () => {
      expect(paths.media).toBe(path.join(CWD, "mediaFolder", "global"));
    });

    it("database resolves to config/database", () => {
      expect(paths.database).toBe(path.join(CWD, "config", "database"));
    });

    it("privateConfigLive always resolves to config/private.ts", () => {
      expect(paths.privateConfigLive).toBe(path.join(CWD, "config", "private.ts"));
    });

    it("privateConfigTest always resolves to config/private.test.ts", () => {
      expect(paths.privateConfigTest).toBe(path.join(CWD, "config", "private.test.ts"));
    });

    it("privateConfig follows private-config-policy (vitest → private.test.ts)", () => {
      // Under VITEST/TEST_MODE, active bootstrap is never live private.ts
      expect(paths.privateConfig).toBe(path.join(CWD, "config", "private.test.ts"));
    });
  });

  describe("benchmark paths", () => {
    it("benchmark.collections is under config/collections/test", () => {
      expect(paths.benchmark.collections).toBe(path.join(CWD, "config", "collections", "test"));
    });

    it("benchmark.compiled is under .compiledCollections/test", () => {
      expect(paths.benchmark.compiled).toBe(path.join(CWD, ".compiledCollections", "test"));
    });

    it("benchmark.sandboxCompiled is under .compiledCollections/test/_local_sandbox", () => {
      expect(paths.benchmark.sandboxCompiled).toBe(
        path.join(CWD, ".compiledCollections", "test", "_local_sandbox"),
      );
    });
  });

  describe("isSafe() traversal guard", () => {
    it("returns true when target is inside base", () => {
      const base = path.join(CWD, "config");
      const target = path.join(CWD, "config", "collections");
      expect(paths.isSafe(base, target)).toBe(true);
    });

    it("returns false when target escapes via ../", () => {
      const base = path.join(CWD, "config");
      const target = path.join(CWD, "..", "etc");
      expect(paths.isSafe(base, target)).toBe(false);
    });

    it("returns false when target is absolute outside base", () => {
      const base = path.join(CWD, "config");
      expect(paths.isSafe(base, "/etc")).toBe(false);
    });

    it("returns true when base and target are the same", () => {
      const base = path.join(CWD, "config");
      expect(paths.isSafe(base, base)).toBe(true);
    });
  });
});
