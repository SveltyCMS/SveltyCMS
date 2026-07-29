/**
 * @file tests/unit/content/schema-hooks.test.ts
 * @description Unit tests for schema lifecycle hook runners.
 */
import { describe, expect, it, vi } from "vitest";
import {
  applyAfterValidate,
  applyBeforeValidate,
  applySchemaHookPipeline,
  type SchemaHooks,
} from "@src/content/schema-hooks";
import type { Schema } from "@src/content/types";

const schema = {
  _id: "posts",
  name: "Posts",
  fields: [],
} as unknown as Schema;

const baseCtx = {
  schema,
  operation: "create" as const,
  tenantId: "t1",
  userId: "u1",
};

describe("applyBeforeValidate / applyAfterValidate", () => {
  it("returns data unchanged when hooks are missing", async () => {
    const data = { title: "Hello" };
    expect(await applyBeforeValidate(undefined, data, { ...baseCtx, document: data })).toEqual(
      data,
    );
    expect(await applyAfterValidate(null, data, { ...baseCtx, document: data })).toEqual(data);
  });

  it("runs beforeValidate transform", async () => {
    const hooks: SchemaHooks = {
      beforeValidate: (data) => ({
        ...data,
        slug: String(data.title || "")
          .toLowerCase()
          .replace(/\s+/g, "-"),
      }),
    };
    const result = await applyBeforeValidate(
      hooks,
      { title: "Hello World" },
      { ...baseCtx, document: { title: "Hello World" } },
    );
    expect(result.slug).toBe("hello-world");
  });

  it("runs afterValidate transform", async () => {
    const hooks: SchemaHooks = {
      afterValidate: (data) => ({ ...data, stamped: true }),
    };
    const result = await applyAfterValidate(
      hooks,
      { title: "x" },
      { ...baseCtx, document: { title: "x" } },
    );
    expect(result.stamped).toBe(true);
  });

  it("supports async hooks", async () => {
    const hooks: SchemaHooks = {
      beforeValidate: async (data) => {
        await Promise.resolve();
        return { ...data, async: true };
      },
    };
    const result = await applyBeforeValidate(hooks, { a: 1 }, { ...baseCtx, document: { a: 1 } });
    expect(result.async).toBe(true);
  });
});

describe("applySchemaHookPipeline", () => {
  it("runs beforeValidate → validate → afterValidate in order", async () => {
    const order: string[] = [];
    const hooks: SchemaHooks = {
      beforeValidate: (data) => {
        order.push("before");
        return { ...data, title: String(data.title || "").trim() };
      },
      afterValidate: (data) => {
        order.push("after");
        return { ...data, ok: true };
      },
    };
    const validate = vi.fn((data: Record<string, unknown>) => {
      order.push("validate");
      if (!data.title) return ["title required"];
    });

    const result = await applySchemaHookPipeline(hooks, { title: "  Post  " }, baseCtx, validate);

    expect(order).toEqual(["before", "validate", "after"]);
    expect(result.title).toBe("Post");
    expect(result.ok).toBe(true);
    expect(validate).toHaveBeenCalledWith(expect.objectContaining({ title: "Post" }));
  });

  it("throws when validate returns errors (after beforeValidate)", async () => {
    const after = vi.fn((data: Record<string, unknown>) => data);
    const hooks: SchemaHooks = {
      beforeValidate: (data) => ({ ...data, n: Number(data.n) }),
      afterValidate: after,
    };

    await expect(
      applySchemaHookPipeline(hooks, { n: "bad" }, baseCtx, () => ["invalid number"]),
    ).rejects.toThrow(/invalid number/);
    expect(after).not.toHaveBeenCalled();
  });

  it("passes when validate returns empty array", async () => {
    const result = await applySchemaHookPipeline(
      {
        afterValidate: (d) => ({ ...d, done: true }),
      },
      { x: 1 },
      baseCtx,
      () => [],
    );
    expect(result.done).toBe(true);
  });
});
