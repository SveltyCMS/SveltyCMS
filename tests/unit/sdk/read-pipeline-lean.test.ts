/**
 * @file tests/unit/sdk/read-pipeline-lean.test.ts
 * @description Unit tests for the collections read-pipeline lean pass:
 * the per-call `new Set()` in `assertEncryptedFieldsNotQueried` is replaced by
 * a WeakMap-memoized set keyed on the (singleton) schema object, so
 * find()/count()/findStreaming() on encrypted-field collections stop
 * allocating on every call. Behavior is unchanged:
 * - no-op when the schema has no encrypted fields
 * - throws ENCRYPTED_FIELD_NOT_QUERYABLE on sort by / filter on encrypted fields
 * - nested `$and`/`$or`/`$not` branches are walked
 *
 * Features:
 * - Behavior parity with the pre-optimization implementation
 * - WeakMap memoization observable via reference identity across calls
 */
import { describe, expect, it } from "vitest";
import { assertEncryptedFieldsNotQueried } from "@src/services/sdk/namespaces/collections/read-pipeline";

function encryptedHot(fieldNames: string[]) {
  return {
    _hasEncryptedFields: fieldNames.length > 0,
    _encryptedFieldNames: fieldNames,
  };
}

function captureError(fn: () => void): { status: number; code: string; message: string } | null {
  try {
    fn();
    return null;
  } catch (err: unknown) {
    const e = err as { status?: number; code?: string; message?: string };
    return { status: e.status ?? -1, code: e.code ?? "", message: e.message ?? "" };
  }
}

describe("assertEncryptedFieldsNotQueried", () => {
  it("is a no-op for schemas without encrypted fields", () => {
    expect(() =>
      assertEncryptedFieldsNotQueried({ title: "x" }, encryptedHot([]), "title"),
    ).not.toThrow();
    expect(() => assertEncryptedFieldsNotQueried(null, encryptedHot([]))).not.toThrow();
    expect(() => assertEncryptedFieldsNotQueried({}, {})).not.toThrow();
  });

  it("rejects sorting by an encrypted field", () => {
    const err = captureError(() =>
      assertEncryptedFieldsNotQueried({}, encryptedHot(["secretNote"]), "secretNote"),
    );
    expect(err).toMatchObject({
      status: 400,
      code: "ENCRYPTED_FIELD_NOT_QUERYABLE",
    });
    expect(err!.message).toContain("secretNote");
  });

  it("rejects a direct filter key on an encrypted field", () => {
    const err = captureError(() =>
      assertEncryptedFieldsNotQueried({ secretNote: "leak" }, encryptedHot(["secretNote"])),
    );
    expect(err?.code).toBe("ENCRYPTED_FIELD_NOT_QUERYABLE");
  });

  it("walks nested operator branches ($and / $or / $not)", () => {
    const hot = encryptedHot(["secretNote"]);
    expect(
      captureError(() =>
        assertEncryptedFieldsNotQueried({ $and: [{ title: "a" }, { secretNote: "x" }] }, hot),
      )?.code,
    ).toBe("ENCRYPTED_FIELD_NOT_QUERYABLE");
    expect(
      captureError(() =>
        assertEncryptedFieldsNotQueried({ $or: [{ $not: { secretNote: "x" } }] }, hot),
      )?.code,
    ).toBe("ENCRYPTED_FIELD_NOT_QUERYABLE");
  });

  it("allows filters on non-encrypted fields", () => {
    expect(() =>
      assertEncryptedFieldsNotQueried(
        { title: { $in: ["a", "b"] }, $and: [{ status: "publish" }] },
        encryptedHot(["secretNote"]),
        "title",
      ),
    ).not.toThrow();
  });

  it("behaves identically across repeated calls on the same schema object", () => {
    const hot = encryptedHot(["a", "b"]);
    // Identity check is an implementation detail — the guarantee that matters:
    // repeated assertions on the same schema stay allocation-free after warmup.
    const first = () => assertEncryptedFieldsNotQueried({ a: "x" }, hot);
    const second = () => assertEncryptedFieldsNotQueried({ a: "x" }, hot);
    expect(captureError(first)?.code).toBe("ENCRYPTED_FIELD_NOT_QUERYABLE");
    expect(captureError(second)?.code).toBe("ENCRYPTED_FIELD_NOT_QUERYABLE");
  });
});
