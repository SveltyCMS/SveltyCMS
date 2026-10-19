/**
 * @file tests/unit/sdk/write-field-validation.test.ts
 * @description Server-side Valibot enforcement in prepareWritePayload.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { email, pipe, string } from "valibot";
import { prepareWritePayload } from "@src/services/sdk/namespaces/collections/write-pipeline";
import { ensureSchemaHotFlags } from "@src/services/sdk/namespaces/collections/schema-store";
import { widgetRegistryService } from "@src/services/core/widget-registry-service";
import type { DatabaseId, Schema } from "@src/content/types";

function makeSchema(): Schema {
  return {
    _id: "contacts",
    name: "Contacts",
    fields: [
      {
        db_fieldName: "email",
        name: "Email",
        widget: { Name: "Email" },
        required: true,
      },
    ],
  } as unknown as Schema;
}

const admin = { _id: "admin-1", isAdmin: true };

describe("prepareWritePayload - server-side widget validation", () => {
  beforeEach(() => {
    vi.spyOn(widgetRegistryService, "getWidgetSync").mockImplementation((name: string) =>
      name === "Email"
        ? ({
            validationSchema: () => pipe(string(), email("Invalid email")),
          } as never)
        : undefined,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects a payload that violates the widget schema", () => {
    const schema = makeSchema();
    const hot = ensureSchemaHotFlags(schema);
    expect(hot._hasFieldValidators).toBe(true);

    expect(() =>
      prepareWritePayload({ email: "not-an-email" }, schema, hot, {
        user: admin,
        operation: "create",
        tenantId: "tenant-1" as DatabaseId,
      }),
    ).toThrow(/Email: Invalid email/);
  });

  it("accepts a valid value", () => {
    const schema = makeSchema();
    const hot = ensureSchemaHotFlags(schema);

    const prepared = prepareWritePayload({ email: "editor@example.com" }, schema, hot, {
      user: admin,
      operation: "create",
      tenantId: "tenant-1" as DatabaseId,
    });

    expect(prepared.email).toBe("editor@example.com");
  });

  it("does not validate fields absent from a partial update", () => {
    const schema = makeSchema();
    const hot = ensureSchemaHotFlags(schema);

    const prepared = prepareWritePayload({ title: "Unrelated" }, schema, hot, {
      user: admin,
      operation: "update",
      tenantId: "tenant-1" as DatabaseId,
      entryId: "entry-1",
    });

    expect(prepared.title).toBe("Unrelated");
  });

  it("bypasses validation when skipValidation is requested", () => {
    const schema = makeSchema();
    const hot = ensureSchemaHotFlags(schema);

    const prepared = prepareWritePayload({ email: "not-an-email" }, schema, hot, {
      user: admin,
      operation: "create",
      tenantId: "tenant-1" as DatabaseId,
      skipValidation: true,
    });

    expect(prepared.email).toBe("not-an-email");
  });

  it("bypasses validation for system writes", () => {
    const schema = makeSchema();
    const hot = ensureSchemaHotFlags(schema);

    const prepared = prepareWritePayload({ email: "legacy-value" }, schema, hot, {
      user: undefined,
      system: true,
      operation: "create",
      tenantId: "tenant-1" as DatabaseId,
    });

    expect(prepared.email).toBe("legacy-value");
  });
});
