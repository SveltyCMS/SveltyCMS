/**
 * @file tests/unit/utils/write-pipeline-date-validation.test.ts
 * @description Regression test for impossible ISO dates on the write path.
 *
 * `prepareWritePayload` normalized DateTime values with `toISOString()` before
 * field validation ran. JavaScript's `Date` rolls calendar-invalid input over
 * (`2026-02-31` → March 3, `2025-13-01` → January 2026), so an impossible date
 * was persisted as a valid — but different — day. The pipeline now validates
 * the RAW string with `isISODateString` first and rejects a 400
 * FIELD_VALIDATION_ERROR instead of normalizing it.
 */

import { describe, expect, it } from "vitest";
import { prepareWritePayload } from "@src/services/sdk/namespaces/collections/write-pipeline";
import { ensureSchemaHotFlags } from "@src/services/sdk/namespaces/collections/schema-store";
import type { DatabaseId, Schema } from "@src/content/types";
import { AppError } from "@utils/error-handling";

const dateTimeSchema: Schema = {
  _id: "events",
  name: "events",
  label: "Events",
  fields: [
    {
      db_fieldName: "startsAt",
      label: "Starts At",
      type: "datetime",
      widget: { Name: "DateTime" },
    },
  ],
};

const hot = ensureSchemaHotFlags(dateTimeSchema);
const admin = { _id: "user-1", isAdmin: true };

function prepareCreate(
  value: string,
  options: { system?: boolean; skipValidation?: boolean } = {},
) {
  return prepareWritePayload({ startsAt: value }, dateTimeSchema, hot, {
    user: admin,
    operation: "create",
    tenantId: "tenant-1" as DatabaseId,
    ...options,
  });
}

function rejectionOf(value: string): AppError | null {
  try {
    prepareCreate(value);
    return null;
  } catch (error) {
    return error instanceof AppError ? error : null;
  }
}

describe("prepareWritePayload — DateTime raw-string validation", () => {
  it("discovers the DateTime field through the schema hot flags", () => {
    expect(hot._dateTimeFieldNames).toContain("startsAt");
  });

  it("accepts a valid leap day and normalizes it to the canonical form", () => {
    const prepared = prepareCreate("2028-02-29");

    expect(prepared.startsAt).toBe("2028-02-29T00:00:00.000Z");
  });

  it("accepts a valid timestamp with an explicit offset", () => {
    const prepared = prepareCreate("2028-02-29T12:30:00+02:00");

    expect(prepared.startsAt).toBe("2028-02-29T10:30:00.000Z");
  });

  it.each([
    "2026-02-31", // February 31 (rolled over to March 3)
    "2025-13-01", // month 13 (rolled over to January 2026)
    "2026-02-29", // February 29 in a non-leap year
    "2026-02-31T10:00:00.000Z", // canonical-looking but impossible timestamp
  ])("rejects %s", (value) => {
    const error = rejectionOf(value);

    expect(error, `expected ${value} to be rejected`).toBeInstanceOf(AppError);
    expect(error?.code).toBe("FIELD_VALIDATION_ERROR");
    expect(error?.status).toBe(400);
    expect(error?.message).toContain("startsAt");
    expect(error?.message).toContain(value);
  });

  it("keeps the skipValidation contract for imports/benchmarks", () => {
    // Internal writes normalize rather than reject (legacy imports may carry
    // rollover-shaped data); the strict gate is the client-facing path.
    const prepared = prepareCreate("2026-02-31", { skipValidation: true });

    expect(prepared.startsAt).toBe("2026-03-03T00:00:00.000Z");
  });

  it("keeps the system-write contract for migrations", () => {
    const prepared = prepareCreate("2026-02-31", { system: true });

    expect(prepared.startsAt).toBe("2026-03-03T00:00:00.000Z");
  });

  it("still normalizes a valid bare timestamp to millisecond precision", () => {
    const prepared = prepareCreate("2026-03-03T10:00:00Z");

    expect(prepared.startsAt).toBe("2026-03-03T10:00:00.000Z");
  });
});
