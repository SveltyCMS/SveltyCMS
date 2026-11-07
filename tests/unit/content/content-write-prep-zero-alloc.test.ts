/**
 * @file tests/unit/content/content-write-prep-zero-alloc.test.ts
 * @description Zero-allocation contract for `prepareCollectionFields()`.
 *
 * Sanitizers return the SAME string reference when the value contains no `<`,
 * and array fields have to be probed before `filter()` allocates. A clean
 * payload must therefore be returned by reference; only a changed field forces
 * the single shallow clone.
 *
 * ### Features:
 * - clean text + clean array + short string → same object reference
 * - a string containing `<` that sanitizes differently → clone + sanitized value
 * - an array with `null` rows → clone + filtered array + warn
 * - `maxLength` truncation still clones
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "@utils/logger";
import { prepareCollectionFields } from "@src/content/content-write-prep.server";

const schema = {
  fields: [
    { db_fieldName: "title", type: "string", maxLength: 10, widget: { Name: "Input" } },
    { db_fieldName: "body", type: "textarea", maxLength: 200, widget: { Name: "Textarea" } },
    { db_fieldName: "tags", type: "array", widget: { Name: "Array" } },
  ],
};

const bothFlags = { sanitize: true, constraints: true };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("prepareCollectionFields — zero-allocation clean path", () => {
  it("returns the input object by reference when nothing changes", () => {
    const data = {
      title: "Short",
      body: "Plain text with no markup",
      tags: ["one", "two"],
      untouched: { nested: true },
    };

    const result = prepareCollectionFields(data, schema, bothFlags);

    expect(result).toBe(data);
    expect(result.tags).toBe(data.tags);
  });

  it("returns the array by reference when it has no null rows", () => {
    const tags = ["alpha", "beta", 0, ""];
    const data = { title: "Short", body: "Plain", tags };

    const result = prepareCollectionFields(data, schema, bothFlags);

    expect(result).toBe(data);
    expect(result.tags).toBe(tags);
  });
});

describe("prepareCollectionFields — changed fields clone lazily", () => {
  it("clones and sanitizes a string containing `<`", () => {
    const data = { title: "Short", body: "<b>Hi</b>", tags: ["one"] };

    const result = prepareCollectionFields(data, schema, bothFlags);

    expect(result).not.toBe(data);
    expect(result.body).toBe("Hi");
    // Fields that did not change keep their values (and array references).
    expect(result.title).toBe("Short");
    expect(result.tags).toBe(data.tags);
  });

  it("clones, filters null array rows, and warns once", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const tags = ["one", null, "two", undefined];
    const data = { title: "Short", body: "Plain", tags };

    const result = prepareCollectionFields(data, schema, bothFlags);

    expect(result).not.toBe(data);
    expect(result.tags).not.toBe(tags);
    expect(result.tags).toEqual(["one", "two"]);
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0][0])).toContain("had 2 null entries removed");
  });

  it("clones when maxLength truncates a string", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const data = { title: "0123456789ABCDEF", body: "Plain", tags: ["one"] };

    const result = prepareCollectionFields(data, schema, bothFlags);

    expect(result).not.toBe(data);
    expect(result.title).toBe("0123456789");
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0][0])).toContain("truncated from 16 to 10");
  });
});
