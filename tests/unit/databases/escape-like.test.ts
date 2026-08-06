/**
 * @file tests/unit/databases/escape-like.test.ts
 * @description Whitebox proofs for LIKE wildcard escaping in SQL filter paths.
 *
 * User input containing `%`, `_` or `\` must be matched literally when it
 * reaches a LIKE pattern (media filename search, JSON-path `contains`,
 * `$regex` translation) — otherwise a search for "%" widens the filter to
 * every row. All call sites pair the escaped pattern with a bound ESCAPE
 * character (never inlined, MariaDB-safe).
 */

import { describe, it, expect } from "vitest";
import { escapeLikePattern } from "@src/databases/core/drizzle-sql-helpers";

describe("escapeLikePattern", () => {
  it("leaves plain text untouched", () => {
    expect(escapeLikePattern("hello world")).toBe("hello world");
  });

  it("escapes the LIKE wildcard %", () => {
    expect(escapeLikePattern("100%")).toBe("100\\%");
    expect(escapeLikePattern("%")).toBe("\\%");
  });

  it("escapes the single-char wildcard _", () => {
    expect(escapeLikePattern("a_b")).toBe("a\\_b");
    expect(escapeLikePattern("_")).toBe("\\_");
  });

  it("escapes the backslash escape char itself", () => {
    expect(escapeLikePattern("a\\b")).toBe("a\\\\b");
  });

  it("escapes mixed wildcards in one pass", () => {
    expect(escapeLikePattern("50%_off\\sale")).toBe("50\\%\\_off\\\\sale");
  });

  it("handles empty and regex-anchor-only input", () => {
    expect(escapeLikePattern("")).toBe("");
    expect(escapeLikePattern("^foo$")).toBe("^foo$"); // anchors are handled by callers
  });
});
