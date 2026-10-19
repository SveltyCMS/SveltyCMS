/**
 * @file tests/unit/security/access-rules.test.ts
 * @description Row-level access rules compile into a query constraint that is
 * merged before pagination/count, and evaluate correctly on cached rows.
 */

import { describe, expect, it } from "vitest";
import {
  buildReadConstraint,
  mergeAccessConstraint,
  rowMatchesConstraint,
} from "@src/services/security/access-rule-service";

const CONFIG = {
  posts: {
    editor: { read: { authorId: "$user._id" } },
    reviewer: { read: { status: ["draft", "review"] } },
    regional: { read: { tenantId: "$tenant.id", status: "published" } },
    empty: { read: {} },
  },
} as never;

const editor = { _id: "user-1", role: "editor" };

describe("buildReadConstraint", () => {
  it("resolves $user._id", () => {
    expect(buildReadConstraint(CONFIG, "posts", { user: editor })).toEqual({
      authorId: "user-1",
    });
  });

  it("turns an array into $in", () => {
    expect(buildReadConstraint(CONFIG, "posts", { user: { _id: "u2", role: "reviewer" } })).toEqual(
      { status: { $in: ["draft", "review"] } },
    );
  });

  it("resolves $tenant.id and keeps literals", () => {
    expect(
      buildReadConstraint(CONFIG, "posts", {
        user: { _id: "u3", role: "regional" },
        tenantId: "tenant-a",
      }),
    ).toEqual({ tenantId: "tenant-a", status: "published" });
  });

  it("is unrestricted for admins, unknown roles, empty rules, and disabled config", () => {
    expect(buildReadConstraint(CONFIG, "posts", { user: { _id: "a", role: "admin" } })).toBeNull();
    expect(buildReadConstraint(CONFIG, "posts", { user: { _id: "u", role: "writer" } })).toBeNull();
    expect(buildReadConstraint(CONFIG, "posts", { user: { _id: "u", role: "empty" } })).toBeNull();
    expect(buildReadConstraint(null, "posts", { user: editor })).toBeNull();
  });

  it("drops prototype-pollution keys", () => {
    expect(
      buildReadConstraint(
        { posts: { editor: { read: { __proto__: "x", authorId: "$user._id" } } } } as never,
        "posts",
        { user: editor },
      ),
    ).toEqual({ authorId: "user-1" });
  });
});

describe("mergeAccessConstraint", () => {
  it("keeps the security constraint on the left of $and", () => {
    const merged = mergeAccessConstraint({ status: "draft" }, { authorId: "user-1" });
    expect(merged).toEqual({ $and: [{ authorId: "user-1" }, { status: "draft" }] });
    // A caller-supplied field of the same name cannot widen the scope.
    expect(merged).not.toHaveProperty("authorId", "anyone");
  });

  it("returns the untouched side when one side is empty", () => {
    expect(mergeAccessConstraint({ status: "draft" }, null)).toEqual({ status: "draft" });
    expect(mergeAccessConstraint(null, { authorId: "u" })).toEqual({ authorId: "u" });
    expect(mergeAccessConstraint(null, null)).toEqual({});
  });
});

describe("rowMatchesConstraint", () => {
  it("matches equality, $in, and $and", () => {
    expect(rowMatchesConstraint({ authorId: "u1" }, { authorId: "u1" })).toBe(true);
    expect(rowMatchesConstraint({ authorId: "u2" }, { authorId: "u1" })).toBe(false);
    expect(
      rowMatchesConstraint({ status: "draft" }, { status: { $in: ["draft", "review"] } }),
    ).toBe(true);
    expect(
      rowMatchesConstraint(
        { id: { _id: "u1" }, status: "draft" },
        { $and: [{ authorId: { $in: ["u1"] } }, { status: "draft" }] },
      ),
    ).toBe(false); // authorId missing — never treat a missing field as a match
  });

  it("compares an embedded {_id} owner object", () => {
    expect(rowMatchesConstraint({ authorId: { _id: "u1" } }, { authorId: "u1" })).toBe(true);
  });

  it("passes rows through when no constraint is configured", () => {
    expect(rowMatchesConstraint({ anything: 1 }, null)).toBe(true);
    expect(rowMatchesConstraint({ anything: 1 }, {})).toBe(true);
  });
});
