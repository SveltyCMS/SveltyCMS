/**
 * @file tests/unit/databases/mariadb-collation.test.ts
 * @description MariaDB collation classifier behind the case-insensitive filter guard.
 *
 * ### Features:
 * - `_ci` collations keep the indexable `col = ?` / `LIKE` form
 * - `_bin` / `_cs` collations force the `lower()` fallback
 * - unknown/empty names fail safe
 */

import { describe, expect, it } from "vitest";
import { isCaseInsensitiveCollation } from "@src/databases/mariadb/adapter-core";

describe("isCaseInsensitiveCollation", () => {
  it("accepts the collations the fleet creates", () => {
    expect(isCaseInsensitiveCollation("utf8mb4_unicode_ci")).toBe(true);
    expect(isCaseInsensitiveCollation("utf8mb4_uca1400_ai_ci")).toBe(true);
    expect(isCaseInsensitiveCollation("utf8mb4_general_ci")).toBe(true);
  });

  it("rejects binary and case-sensitive collations", () => {
    expect(isCaseInsensitiveCollation("utf8mb4_bin")).toBe(false);
    expect(isCaseInsensitiveCollation("utf8mb4_0900_as_cs")).toBe(false);
    expect(isCaseInsensitiveCollation("utf8mb4_cs")).toBe(false);
  });

  it("fails safe on an empty or unknown name", () => {
    expect(isCaseInsensitiveCollation("")).toBe(false);
    expect(isCaseInsensitiveCollation("   ")).toBe(false);
  });
});
