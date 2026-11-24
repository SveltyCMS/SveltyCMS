/**
 * @file tests/unit/utils/query-filter-guard.test.ts
 * @description Unit tests for query filter ReDoS and wildcard-density guard.
 */

import { describe, expect, it } from "vitest";
import {
  guardQueryFilter,
  QueryFilterGuardError,
  validateRegexPattern,
  validateWildcardDensity,
} from "../../../src/utils/security/query-filter-guard";

describe("query-filter-guard", () => {
  it("disables raw $regex by default", () => {
    expect(() => guardQueryFilter({ title: { $regex: "^hello" } })).toThrowError(
      QueryFilterGuardError,
    );
  });

  it("allows safe $regex when allowRegex is true", () => {
    expect(() =>
      guardQueryFilter({ title: { $regex: "^hello-[a-z0-9]+$" } }, { allowRegex: true }),
    ).not.toThrow();
  });

  it("rejects nested-quantifier ReDoS patterns", () => {
    expect(() => validateRegexPattern("(a+)+")).toThrowError(QueryFilterGuardError);
    expect(() => validateRegexPattern("(a|aa)+")).toThrowError(QueryFilterGuardError);
    expect(() => validateRegexPattern("([a-z]+)*")).toThrowError(QueryFilterGuardError);
  });

  it("rejects leading wildcards by default", () => {
    expect(() => validateWildcardDensity("%admin")).toThrowError(QueryFilterGuardError);
    expect(() => validateWildcardDensity("*admin")).toThrowError(QueryFilterGuardError);
  });

  it("rejects excessive wildcard density", () => {
    expect(() => validateWildcardDensity("a%b%c%d%e%", { maxWildcards: 4 })).toThrowError(
      QueryFilterGuardError,
    );
    expect(() => validateWildcardDensity("admin%", { maxWildcards: 4 })).not.toThrow();
  });
});
