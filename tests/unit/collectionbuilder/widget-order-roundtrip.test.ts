/**
 * @file tests/unit/collectionbuilder/widget-order-roundtrip.test.ts
 * @description Save-order contract for Collection Builder widgets.
 *
 * The builder canvas order IS the persisted order. The save path must therefore
 * carry the widget list as an ordered array across the whole round trip
 * (client serialise → action parse → collection file text → reload parse).
 *
 * Regression: the action used to re-key the posted array into an index-keyed
 * object map (`{"0":…,"1":…}`). `JSON.stringify` emits integer-like keys in
 * ascending numeric order, so the stored text could never express an order that
 * differs from the index order — a reordered list came back sorted after reload.
 */

import { describe, expect, it } from "vitest";
import {
  normalizeCollectionFieldsPayload,
  serializeCollectionFieldsPayload,
} from "@src/routes/(app)/config/collectionbuilder/collectionbuilder-utils";

type Widget = Record<string, unknown>;

function widget(dbFieldName: string, index: number): Widget {
  return {
    _dragId: `drag-${index}`,
    id: index + 1,
    label: dbFieldName.toUpperCase(),
    db_fieldName: dbFieldName,
    widget: { Name: "Input", key: "Input" },
  };
}

const names = (list: Widget[]) => list.map((f) => String(f.db_fieldName));

/** Full save → reload round trip, exactly as the action writes and load reads. */
function persistAndReload(posted: Widget[]): Widget[] {
  const formEncoded = serializeCollectionFieldsPayload(posted);
  const actionFields = normalizeCollectionFieldsPayload(JSON.parse(formEncoded));
  expect(actionFields).not.toBeNull();
  // The action hands the list to the AST generator, which writes JSON into the
  // collection file (`fields: ...`) and the loader reads it back.
  const fileText = JSON.stringify(actionFields);
  const reloaded = normalizeCollectionFieldsPayload(JSON.parse(fileText));
  return reloaded as Widget[];
}

describe("collection builder widget order", () => {
  it("round-trips a reordered widget list without re-sorting it", () => {
    const original = ["alpha", "beta", "gamma", "delta"].map(widget);
    const reordered = [original[3], original[0], original[2], original[1]] as Widget[];

    expect(names(persistAndReload(reordered))).toEqual(["delta", "alpha", "gamma", "beta"]);
  });

  it("keeps order for more than ten widgets (integer-like keys are the trap)", () => {
    const list = Array.from({ length: 12 }, (_, i) => widget(`f${i + 1}`, i)) as Widget[];
    // Move the last widget to the front — the case where index order ≠ display order.
    const reordered = [list[11], ...list.slice(0, 11)] as Widget[];

    const reloaded = persistAndReload(reordered);
    expect(names(reloaded)).toEqual([
      "f12",
      "f1",
      "f2",
      "f3",
      "f4",
      "f5",
      "f6",
      "f7",
      "f8",
      "f9",
      "f10",
      "f11",
    ]);
  });

  it("persists the widget list as an ordered array, never as an index-keyed map", () => {
    const list = ["alpha", "beta", "gamma"].map(widget);
    const reordered = [list[2], list[0], list[1]] as Widget[];

    const parsed = normalizeCollectionFieldsPayload(
      JSON.parse(serializeCollectionFieldsPayload(reordered)),
    );
    const persisted = JSON.parse(JSON.stringify(parsed)) as unknown;
    expect(Array.isArray(persisted), "persisted fields must be an ordered array").toBe(true);
  });

  it("serialises an index-keyed map to a list so the next save migrates it", () => {
    // Legacy file shape (index-keyed map) — accepted on read, written back as an array.
    const legacy = { "0": widget("alpha", 0), "1": widget("beta", 1) };
    const normalized = normalizeCollectionFieldsPayload(legacy);
    expect(names(normalized as Widget[])).toEqual(["alpha", "beta"]);
    expect(JSON.parse(serializeCollectionFieldsPayload(normalized as Widget[]))[0]).toBeDefined();
  });

  it("strips drag/inspector bookkeeping before the payload leaves the browser", () => {
    const encoded = serializeCollectionFieldsPayload([widget("alpha", 0)]);
    const [field] = JSON.parse(encoded) as Widget[];
    expect(field).not.toHaveProperty("_dragId");
    expect(field).not.toHaveProperty("__fieldIndex");
    expect(field).toHaveProperty("db_fieldName", "alpha");
  });

  it("rejects payload shapes the builder cannot persist", () => {
    expect(normalizeCollectionFieldsPayload("not-a-list")).toBeNull();
    expect(normalizeCollectionFieldsPayload(42)).toBeNull();
  });
});
