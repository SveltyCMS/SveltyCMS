/**
 * @file tests/unit/utils/api-unwrap-list.test.ts
 * @description Pins the single list-envelope normalizer shared by the config
 * API clients (`webhooks-api`, `workflows-api`, `automations-api`).
 *
 * ### Features:
 * - failure → empty list
 * - flat `{ data: T[] }` and nested `{ data: { data: T[] } }` envelopes
 * - non-list objects never leak through
 */

import { describe, expect, it } from "vitest";
import { unwrapList } from "@utils/http-client";

describe("unwrapList", () => {
  it("returns [] for a failed response", () => {
    expect(unwrapList({ success: false, message: "nope" })).toEqual([]);
  });

  it("returns a flat data array", () => {
    const rows = [{ id: "1" }, { id: "2" }];
    expect(unwrapList({ success: true, data: rows })).toEqual(rows);
  });

  it("unwraps a nested data array", () => {
    const rows = [{ id: "1" }];
    expect(unwrapList({ success: true, data: { data: rows } })).toEqual(rows);
  });

  it("returns [] when the payload is not a list", () => {
    expect(unwrapList({ success: true, data: { id: "1" } })).toEqual([]);
  });
});
