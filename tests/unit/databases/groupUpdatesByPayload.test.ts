import { describe, it, expect } from "vitest";
import { groupUpdatesByPayload } from "@src/databases/core/relational-utils";

describe("groupUpdatesByPayload (Bulk-Update N+1 Fix)", () => {
  it("groups identical payloads into one bucket, preserving all ids", () => {
    const g = groupUpdatesByPayload([
      { id: "a", data: { status: "active", count: 1 } },
      { id: "b", data: { status: "active", count: 1 } },
      { id: "c", data: { status: "draft", count: 2 } },
    ]);
    expect(g.length).toBe(2);
    const active = g.find((x) => x.data?.status === "active")!;
    expect(active.ids.sort()).toEqual(["a", "b"]);
    const draft = g.find((x) => x.data?.status === "draft")!;
    expect(draft.ids).toEqual(["c"]);
  });

  it("key order must not affect grouping (value equality, not stringify)", () => {
    const g = groupUpdatesByPayload([
      { id: "x", data: { a: 1, b: { c: 2 } } },
      { id: "y", data: { b: { c: 2 }, a: 1 } },
    ]);
    expect(g.length).toBe(1);
  });

  it("empty payloads collapse together", () => {
    const g = groupUpdatesByPayload([
      { id: "p", data: undefined },
      { id: "q", data: {} },
    ]);
    expect(g.length).toBe(1);
    expect(g[0].ids.sort()).toEqual(["p", "q"]);
  });

  it("distinct values split into separate buckets", () => {
    const g = groupUpdatesByPayload([
      { id: "s", data: { n: 1 } },
      { id: "t", data: { n: 2 } },
    ]);
    expect(g.length).toBe(2);
  });
});
