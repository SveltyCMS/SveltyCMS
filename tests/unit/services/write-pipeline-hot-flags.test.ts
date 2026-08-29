/**
 * @file tests/unit/services/write-pipeline-hot-flags.test.ts
 * @description DateTime is inlined on the write path; async widgets still gate the pipeline.
 *
 * ### Features:
 * - writeTouchesActiveWidgets payload intersection
 * - DateTime-only schemas skip the async widget pipeline flag
 */

import { describe, it, expect } from "vitest";
import {
  prepareWritePayload,
  writeTouchesActiveWidgets,
} from "@src/services/sdk/namespaces/collections/write-pipeline";
import { ensureSchemaHotFlags } from "@src/services/sdk/namespaces/collections/schema-store";
import type { Schema } from "@src/content/types";

describe("writeTouchesActiveWidgets", () => {
  it("returns false when no async widget fields are registered", () => {
    expect(writeTouchesActiveWidgets({ _activeWidgetFieldNames: [] }, { title: "x" })).toBe(false);
    expect(writeTouchesActiveWidgets({}, { title: "x" })).toBe(false);
  });

  it("returns true only when the payload includes an async widget field", () => {
    const hot = { _activeWidgetFieldNames: ["heroImage", "seo"] };
    expect(writeTouchesActiveWidgets(hot, { count: 3 })).toBe(false);
    expect(writeTouchesActiveWidgets(hot, { heroImage: "a.png" })).toBe(true);
  });
});

describe("ensureSchemaHotFlags DateTime inline", () => {
  it("does not mark DateTime-only schemas as needing the async widget pipeline", () => {
    const schema = {
      _id: "Articles",
      name: "Articles",
      fields: [
        { db_fieldName: "title", widget: { Name: "Input" }, type: "string" },
        { db_fieldName: "publishedAt", widget: { Name: "DateTime" }, type: "string" },
        { db_fieldName: "body", widget: { Name: "RichText" }, type: "string" },
      ],
    } as Schema;
    const hot = ensureSchemaHotFlags(schema);
    expect(hot._hasDateTimeFields).toBe(true);
    expect(hot._hasActiveWidgets).toBe(false);
    expect(hot._activeWidgetFieldNames).toEqual([]);
    expect(hot._hasSanitizableFields).toBe(true);
  });

  it("normalizes DateTime fields synchronously in prepareWritePayload", () => {
    const schema = {
      _id: "Articles",
      name: "Articles",
      fields: [{ db_fieldName: "publishedAt", widget: { Name: "DateTime" }, type: "string" }],
    } as Schema;
    const hot = ensureSchemaHotFlags(schema);
    const prepared = prepareWritePayload(
      { title: "t", publishedAt: "2026-08-26T12:00:00.000Z" },
      schema,
      hot,
      {
        user: { _id: "u1", isAdmin: true },
        operation: "create",
        tenantId: "global" as any,
      },
    );
    expect(prepared.publishedAt).toBe("2026-08-26T12:00:00.000Z");
    expect(prepared.createdAt).toEqual(expect.any(String));
  });
});
