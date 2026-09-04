/**
 * @file tests/unit/services/populate-resolver.test.ts
 * @description Unit tests for relation population and cross-field query coalescing.
 */

import { describe, it, expect, vi } from "vitest";
import { resolvePopulatedRelations } from "@src/services/sdk/namespaces/populate-resolver";

describe("Populate Resolver", () => {
  it("coalesces multiple fields pointing to the same collection into a single query", async () => {
    const findManyMock = vi.fn().mockImplementation((collectionName: string, _query: any) => {
      if (collectionName === "users") {
        return Promise.resolve({
          success: true,
          data: [
            { _id: "user_1", name: "Alice", email: "alice@example.com" },
            { _id: "user_2", name: "Bob", email: "bob@example.com" },
            { _id: "user_3", name: "Charlie", email: "charlie@example.com" },
          ],
        });
      }
      if (collectionName === "categories") {
        return Promise.resolve({
          success: true,
          data: [{ _id: "cat_1", title: "Tech" }],
        });
      }
      return Promise.resolve({ success: false });
    });

    const mockDbAdapter = {
      crud: {
        findMany: findManyMock,
      },
    };

    const schema = {
      fields: [
        { name: "author", relation: "col_users" },
        { name: "editor", relation: "col_users" },
        { name: "categories", relation: "col_categories" },
      ],
    };

    const items = [
      { _id: "post_1", author: "user_1", editor: "user_2", categories: ["cat_1"] },
      { _id: "post_2", author: "user_3", editor: "user_1", categories: [] },
    ];

    const getCollectionName = (id: string) => {
      if (id === "col_users") return "users";
      if (id === "col_categories") return "categories";
      return id;
    };

    await resolvePopulatedRelations(
      items,
      schema,
      ["author", "editor", "categories"],
      "tenant_1",
      mockDbAdapter,
      getCollectionName,
    );

    // CRITICAL: Despite having two fields pointing to "users" across two items,
    // "users" was queried EXACTLY ONCE with all unique user IDs coalesced!
    expect(findManyMock).toHaveBeenCalledTimes(2); // 1 for "users", 1 for "categories"

    expect(findManyMock).toHaveBeenCalledWith(
      "users",
      { _id: { $in: expect.arrayContaining(["user_1", "user_2", "user_3"]) } },
      expect.objectContaining({ limit: 3 }),
    );

    expect(findManyMock).toHaveBeenCalledWith(
      "categories",
      { _id: { $in: ["cat_1"] } },
      expect.objectContaining({ limit: 1 }),
    );

    // Assert relations are populated onto items
    expect((items[0] as any)._populated_author).toEqual({
      _id: "user_1",
      name: "Alice",
      email: "alice@example.com",
    });
    expect((items[0] as any)._populated_editor).toEqual({
      _id: "user_2",
      name: "Bob",
      email: "bob@example.com",
    });
    expect((items[0] as any)._populated_categories).toEqual([{ _id: "cat_1", title: "Tech" }]);

    expect((items[1] as any)._populated_author).toEqual({
      _id: "user_3",
      name: "Charlie",
      email: "charlie@example.com",
    });
    expect((items[1] as any)._populated_editor).toEqual({
      _id: "user_1",
      name: "Alice",
      email: "alice@example.com",
    });
  });
});
