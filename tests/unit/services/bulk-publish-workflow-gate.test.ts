/**
 * @file tests/unit/services/bulk-publish-workflow-gate.test.ts
 * @description Bulk publishing must pass the same review gate as a single update.
 *
 * WHY: `collectBulkRejections` validated required fields for publish transitions but never
 * consulted the workflow, so a gated collection could be published by sending the same
 * status change through the bulk endpoint that a single update would reject with 403.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const assertPublishAllowed = vi.hoisted(() => vi.fn());

vi.mock("@src/services/sdk/namespaces/collections/lazy-services", () => ({
  getWorkflowServiceLazy: vi.fn(async () => ({ assertPublishAllowed })),
  getPubSubLazy: vi.fn(async () => ({ publish: vi.fn() })),
}));

import { collectBulkRejections } from "@src/services/sdk/namespaces/collections/bulk-operations";
import type { Schema } from "@src/content/types";

const schema = { _id: "Posts", name: "Posts", fields: [] } as unknown as Schema;
const hot = { _hasRequiredFields: false, _hasConditionallyRequiredFields: false };
const ctx = {} as never;

function execCtx(overrides: Record<string, unknown> = {}) {
  return {
    user: { _id: "u1", role: "editor" },
    system: false,
    tenantId: "tenant-1",
    options: {},
    ...overrides,
  } as never;
}

describe("bulk publish workflow gate", () => {
  beforeEach(() => assertPublishAllowed.mockReset());

  it("rejects a publish transition when the workflow gate refuses", async () => {
    assertPublishAllowed.mockRejectedValueOnce(new Error("WORKFLOW_PUBLISH_GATE: review required"));
    const out: Array<{ id: string; message: string }> = [];

    await collectBulkRejections(
      ctx,
      schema,
      hot as never,
      [{ id: "e1", data: { status: "published" } }] as never,
      execCtx(),
      out,
    );

    expect(assertPublishAllowed).toHaveBeenCalledWith("Posts", "tenant-1", expect.anything(), "e1");
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("e1");
    expect(out[0]!.message).toContain("WORKFLOW_PUBLISH_GATE");
  });

  it("accepts the same transition when the gate allows it", async () => {
    const out: Array<{ id: string; message: string }> = [];

    await collectBulkRejections(
      ctx,
      schema,
      hot as never,
      [{ id: "e1", data: { status: "published" } }] as never,
      execCtx(),
      out,
    );

    expect(out).toHaveLength(0);
  });

  it("does not gate non-publish updates or system writes", async () => {
    const out: Array<{ id: string; message: string }> = [];

    await collectBulkRejections(
      ctx,
      schema,
      hot as never,
      [{ id: "e1", data: { title: "draft edit" } }] as never,
      execCtx(),
      out,
    );
    await collectBulkRejections(
      ctx,
      schema,
      hot as never,
      [{ id: "e2", data: { status: "published" } }] as never,
      execCtx({ system: true }),
      out,
    );

    expect(assertPublishAllowed).not.toHaveBeenCalled();
    expect(out).toHaveLength(0);
  });
});
