/**
 * @file tests/unit/content/schema-hooks.test.ts
 * @description Unit tests for schema lifecycle hook runners.
 *
 * Features tested:
 * - beforeValidate/afterValidate transforms (sync and async)
 * - applySchemaHookPipeline ordering (before → validate → after)
 * - default plain-Error throwing with joined messages
 * - optional createError factory for typed errors (e.g. FIELD_VALIDATION_ERROR)
 */
import { describe, expect, it, vi } from "vitest";
import {
  applyAfterValidate,
  applyBeforeValidate,
  applySchemaHookPipeline,
  runAfterOperation,
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

  it("throws a plain Error with joined messages by default", async () => {
    await expect(
      applySchemaHookPipeline(undefined, { x: 1 }, baseCtx, () => ["missing title", "bad slug"]),
    ).rejects.toThrow("missing title; bad slug");
  });

  it("uses the custom createError factory and passes the raw messages array", async () => {
    const factory = vi.fn((msgs: string[]) => {
      const err = new Error(msgs.join("; ")) as Error & { code?: string };
      err.code = "FIELD_VALIDATION_ERROR";
      return err;
    });

    await expect(
      applySchemaHookPipeline(undefined, { x: 1 }, baseCtx, () => ["e1", "e2"], {
        createError: factory,
      }),
    ).rejects.toMatchObject({ message: "e1; e2", code: "FIELD_VALIDATION_ERROR" });

    expect(factory).toHaveBeenCalledWith(["e1", "e2"]);
  });

  it("does not invoke createError when validation passes", async () => {
    const factory = vi.fn((msgs: string[]) => new Error(msgs.join("; ")));
    const result = await applySchemaHookPipeline(undefined, { x: 1 }, baseCtx, () => [], {
      createError: factory,
    });
    expect(result).toEqual({ x: 1 });
    expect(factory).not.toHaveBeenCalled();
  });
});

describe("applySchemaHookPipeline — resolveInput / validate / beforeOperation", () => {
  it("runs field then list resolveInput before beforeValidate", async () => {
    const order: string[] = [];
    const hooks: SchemaHooks = {
      resolveInput: (data) => {
        order.push("list:resolveInput");
        return data;
      },
      beforeValidate: (data) => {
        order.push("beforeValidate");
        return data;
      },
    };
    const fields = [
      {
        db_fieldName: "title",
        hooks: {
          resolveInput: (data: Record<string, unknown>) => {
            order.push("field:resolveInput");
            return { ...data, resolved: true };
          },
        },
      },
    ];

    const result = await applySchemaHookPipeline(hooks, { title: "x" }, baseCtx, undefined, {
      fields,
    });

    expect(order).toEqual(["field:resolveInput", "list:resolveInput", "beforeValidate"]);
    expect(result.resolved).toBe(true);
  });

  it("joins field, list and callback validation errors once and aborts the pipeline", async () => {
    const beforeOperation = vi.fn((data: Record<string, unknown>) => data);
    const afterValidate = vi.fn((data: Record<string, unknown>) => data);
    const hooks: SchemaHooks = {
      validate: () => "list error",
      beforeOperation,
      afterValidate,
    };
    const fields = [{ db_fieldName: "title", hooks: { validate: () => ["field error"] } }];

    await expect(
      applySchemaHookPipeline(hooks, { title: "" }, baseCtx, () => ["callback error"], { fields }),
    ).rejects.toThrow("field error; list error; callback error");
    expect(beforeOperation).not.toHaveBeenCalled();
    expect(afterValidate).not.toHaveBeenCalled();
  });

  it("runs field then list beforeOperation before afterValidate", async () => {
    const order: string[] = [];
    const hooks: SchemaHooks = {
      beforeOperation: (data) => {
        order.push("list:beforeOperation");
        return data;
      },
      afterValidate: (data) => {
        order.push("afterValidate");
        return data;
      },
    };
    const fields = [
      {
        db_fieldName: "title",
        hooks: {
          beforeOperation: (data: Record<string, unknown>) => {
            order.push("field:beforeOperation");
            return data;
          },
        },
      },
    ];

    await applySchemaHookPipeline(hooks, { title: "x" }, baseCtx, undefined, { fields });
    expect(order).toEqual(["field:beforeOperation", "list:beforeOperation", "afterValidate"]);
  });
});

describe("runAfterOperation", () => {
  it("runs field then list afterOperation with the final document", async () => {
    const order: string[] = [];
    const hooks: SchemaHooks = {
      afterOperation: (data) => {
        order.push("list");
        expect(data).toEqual({ title: "x" });
      },
    };
    const fields = [
      {
        db_fieldName: "title",
        hooks: {
          afterOperation: () => {
            order.push("field");
          },
        },
      },
    ];

    await runAfterOperation(hooks, fields, { title: "x" }, baseCtx);
    expect(order).toEqual(["field", "list"]);
  });

  it("resolves as a no-op without list or field hooks", async () => {
    await expect(
      runAfterOperation(undefined, undefined, { a: 1 }, baseCtx),
    ).resolves.toBeUndefined();
  });

  it("propagates failures to the caller (write paths catch and log)", async () => {
    const hooks: SchemaHooks = {
      afterOperation: () => {
        throw new Error("audit down");
      },
    };
    await expect(runAfterOperation(hooks, undefined, { a: 1 }, baseCtx)).rejects.toThrow(
      "audit down",
    );
  });
});
