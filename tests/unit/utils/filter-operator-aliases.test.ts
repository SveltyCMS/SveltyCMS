/**
 * @file tests/unit/utils/filter-operator-aliases.test.ts
 * @description REST parsing for the case-insensitive filter operators.
 *
 * `_ieq`, `_nieq` and `_nicontains` (Directus spellings) and their bare forms
 * must translate to the `$`-prefixed operators the SQL, Mongo and in-memory
 * compilers implement. Unknown operators stay fail-closed.
 */

import { describe, expect, it } from "vitest";
import { parseCollectionQueryParams, unsupportedFilterOperators } from "@src/utils/api-params";

describe("parseCollectionQueryParams — case-insensitive operators", () => {
  it("maps _ieq / _nieq / _nicontains bracket filters to $ operators", () => {
    const params = parseCollectionQueryParams(
      new URLSearchParams({
        "filter[title][_ieq]": "Hello",
        "filter[status][_nieq]": "archived",
        "filter[body][_nicontains]": "draft",
      }),
    );

    expect(params.filter).toEqual({
      title: { $ieq: "Hello" },
      status: { $nieq: "archived" },
      body: { $nicontains: "draft" },
    });
    expect(unsupportedFilterOperators(params.filter)).toEqual([]);
  });

  it("accepts the bare spellings too", () => {
    const params = parseCollectionQueryParams(
      new URLSearchParams({
        "filter[title][ieq]": "Hello",
        "filter[status][nieq]": "archived",
        "filter[body][nicontains]": "draft",
      }),
    );

    expect(params.filter).toEqual({
      title: { $ieq: "Hello" },
      status: { $nieq: "archived" },
      body: { $nicontains: "draft" },
    });
  });

  it("normalizes the JSON filter syntax to the same shape", () => {
    const params = parseCollectionQueryParams(
      new URLSearchParams({
        filter: JSON.stringify({
          title: { _ieq: "Hello" },
          status: { nieq: "archived" },
          body: { $nicontains: "draft" },
        }),
      }),
    );

    expect(params.filter).toEqual({
      title: { $ieq: "Hello" },
      status: { $nieq: "archived" },
      body: { $nicontains: "draft" },
    });
  });

  it("keeps the existing contains operator case-insensitive end to end", () => {
    const params = parseCollectionQueryParams(
      new URLSearchParams({ "filter[title][contains]": "Hello" }),
    );

    expect(params.filter).toEqual({ title: { $contains: "Hello" } });
    expect(unsupportedFilterOperators(params.filter)).toEqual([]);
  });

  it("still fails closed for an unknown operator", () => {
    const params = parseCollectionQueryParams(new URLSearchParams({ "filter[title][_iq]": "x" }));

    expect(unsupportedFilterOperators(params.filter)).toEqual([
      { field: "title", operator: "_iq" },
    ]);
  });
});
