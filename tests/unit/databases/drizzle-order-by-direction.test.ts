/**
 * @file tests/unit/databases/drizzle-order-by-direction.test.ts
 * @description
 * Regression guard for the shared SQL ORDER BY emitter: every accepted sort
 * direction spelling must map to the SAME clause direction the keyset cursor
 * was built from. The Mongo-style numeric form (`1` ascending, `-1` descending)
 * reachable through `withIdTiebreaker`/`defaultPageSortOption` was previously
 * emitted as DESC (anything that was not exactly `"asc"`), so `{ status: 1 }`
 * ordered DESC while `resolvePageSort` told the cursor ASC — page N+1 then
 * repeated page N.
 *
 * ### Features:
 * - `1` / `"asc"` / `"ASC"` → ASC, `-1` / `"desc"` / unknown → DESC
 * - object and tuple-array sort specs behave identically
 * - multi-key specs keep per-key directions
 */

import { describe, expect, it } from "vitest";
import { desc, type Column, type SQL } from "drizzle-orm";
import { applyOrderBy } from "@src/databases/core/drizzle-sql-helpers";

/** Column stub — only `name` is read by the clause builder. */
const statusCol = { name: "status" } as unknown as Column;
const createdAtCol = { name: "createdAt" } as unknown as Column;

/** Direction token of each emitted sort clause ("asc"/"desc"). */
function directions(clauses: SQL[]): string[] {
  return clauses.map((clause) => {
    const chunks = (clause as unknown as { queryChunks: unknown[] }).queryChunks;
    const tail = chunks[chunks.length - 1] as { value?: string[] };
    return (tail?.value ?? []).join("").trim().toLowerCase();
  });
}

function emit(sort: unknown, columns: Column[] = [statusCol, createdAtCol]): string[] {
  const captured: SQL[] = [];
  const builder = {
    orderBy: (...clauses: SQL[]) => {
      captured.push(...clauses);
      return builder;
    },
  };
  const byName = new Map(columns.map((c) => [c.name, c]));
  applyOrderBy(
    builder,
    {},
    { sort } as never,
    (_table: unknown, name: string) => byName.get(name),
    () => desc(createdAtCol) as never,
  );
  return directions(captured);
}

describe("applyOrderBy direction normalization", () => {
  it("maps the Mongo-style numeric form (1 = ascending)", () => {
    expect(emit({ status: 1 })).toEqual(["asc"]);
    expect(emit({ status: -1 })).toEqual(["desc"]);
  });

  it("maps the wire string form (case-insensitive asc)", () => {
    expect(emit({ status: "asc" })).toEqual(["asc"]);
    expect(emit({ status: "ASC" })).toEqual(["asc"]);
    expect(emit({ status: "desc" })).toEqual(["desc"]);
  });

  it("keeps DESC for unknown/missing directions", () => {
    expect(emit({ status: undefined })).toEqual(["desc"]);
    expect(emit({ status: "sideways" })).toEqual(["desc"]);
  });

  it("treats tuple-array specs like object specs", () => {
    expect(emit([["status", 1]])).toEqual(["asc"]);
    expect(emit([["status", -1]])).toEqual(["desc"]);
    expect(emit([["status", "asc"]])).toEqual(["asc"]);
  });

  it("keeps per-key directions in multi-key specs", () => {
    expect(
      emit([
        ["status", 1],
        ["createdAt", -1],
      ]),
    ).toEqual(["asc", "desc"]);
    expect(emit({ status: 1, createdAt: -1 })).toEqual(["asc", "desc"]);
  });
});
