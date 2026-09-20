/**
 * @file tests/unit/utils/boolean-filter.test.ts
 * @description Tests for AND/OR filter-group codec and compile helpers.
 */

import { describe, expect, it } from "vitest";
import {
  compileBooleanFilterGroup,
  decodeBooleanFilterParam,
  parseBooleanFilterGroup,
  serializeBooleanFilterGroup,
} from "@utils/boolean-filter";

describe("boolean-filter", () => {
  it("parses and serializes a compact group", () => {
    const group = parseBooleanFilterGroup({
      combinator: "OR",
      rules: [
        { field: "status", operator: "equals", value: "publish" },
        { field: "status", operator: "equals", value: "draft" },
      ],
    });
    expect(group?.combinator).toBe("OR");
    expect(group?.rules).toHaveLength(2);
    const encoded = serializeBooleanFilterGroup(group);
    expect(encoded).toBeTruthy();
    expect(decodeBooleanFilterParam(encoded)?.rules[0].field).toBe("status");
  });

  it("collapses same-field OR equals into an in-list", () => {
    const compiled = compileBooleanFilterGroup({
      combinator: "OR",
      rules: [
        { field: "status", operator: "equals", value: "publish" },
        { field: "status", operator: "equals", value: "draft" },
      ],
    });
    expect(compiled.andFilter.status).toEqual({ in: ["publish", "draft"] });
    expect(compiled.orGroups).toEqual([]);
  });

  it("emits orGroups for mixed-field OR", () => {
    const compiled = compileBooleanFilterGroup({
      combinator: "OR",
      rules: [
        { field: "status", operator: "equals", value: "publish" },
        { field: "title", operator: "equals", value: "Hello" },
      ],
    });
    expect(compiled.orGroups).toEqual([{ status: "publish" }, { title: "Hello" }]);
  });

  it("drops invalid fields and oversize payloads", () => {
    expect(
      parseBooleanFilterGroup({
        combinator: "AND",
        rules: [{ field: "../x", operator: "equals" }],
      }),
    ).toBeNull();
    expect(decodeBooleanFilterParam("not-json")).toBeNull();
  });
});
