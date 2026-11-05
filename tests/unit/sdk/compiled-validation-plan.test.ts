/**
 * @file tests/unit/sdk/compiled-validation-plan.test.ts
 * @description Unit tests for WeakMap-Cached Zero-Copy Schema Validation (AOT Plans).
 *
 * Features:
 * - AOT compiled validation plan caching per schema in WeakMap
 * - Zero array allocations on valid document write path
 * - Strict numeric range and SQL integer overflow boundary enforcement
 * - Integration with Valibot field validators
 */

import { describe, it, expect } from "vitest";
import { getOrCompileValidationPlan } from "@src/services/sdk/namespaces/collections/write-pipeline";
import type { Schema } from "@src/content/types";
import type { SchemaHotFlags } from "@src/services/sdk/namespaces/collections/schema-store";
import { string, minLength, pipe } from "valibot";

describe("AOT Compiled Schema Validation Plans", () => {
  const sampleSchema: Schema = {
    _id: "test-articles",
    name: "articles",
    fields: [
      {
        db_fieldName: "price",
        label: "Price",
        type: "number",
        required: true,
        min: 0,
        max: 10_000,
        widget: { Name: "Number" } as any,
        translated: false,
      },
    ],
  };

  const hotFlags: SchemaHotFlags = {
    _hasNumberFields: true,
    _numberFields: [{ db_fieldName: "price", min: 0, max: 10_000 }],
    _hasFieldValidators: true,
    _fieldValidators: [
      {
        key: "title",
        name: "Title",
        schema: pipe(string(), minLength(3, "Title must be at least 3 characters")),
      },
    ],
  };

  it("should compile and cache plan in WeakMap across calls", () => {
    const plan1 = getOrCompileValidationPlan(sampleSchema, hotFlags);
    const plan2 = getOrCompileValidationPlan(sampleSchema, hotFlags);

    expect(plan1).toBe(plan2);
  });

  it("should return null with zero array allocation on valid payloads", () => {
    const plan = getOrCompileValidationPlan(sampleSchema, hotFlags);
    const validDoc = {
      price: 49.99,
      title: "Valid Article Title",
    };

    const result = plan(validDoc);
    // null contract ensures zero heap allocation on valid write paths
    expect(result).toBeNull();
  });

  it("should catch numeric range errors (below min or above max)", () => {
    const plan = getOrCompileValidationPlan(sampleSchema, hotFlags);

    const tooLow = { price: -5, title: "Valid Title" };
    const lowResult = plan(tooLow);
    expect(lowResult).not.toBeNull();
    expect(lowResult?.[0]).toContain("below minimum allowed value");

    const tooHigh = { price: 25_000, title: "Valid Title" };
    const highResult = plan(tooHigh);
    expect(highResult).not.toBeNull();
    expect(highResult?.[0]).toContain("exceeds maximum allowed value");
  });

  it("should guard against SQL safe integer overflow", () => {
    const unboundedSchema: Schema = {
      _id: "test-numbers",
      name: "numbers",
      fields: [],
    };
    const unboundedHot: SchemaHotFlags = {
      _hasNumberFields: true,
      _numberFields: [{ db_fieldName: "counter" }],
    };

    const plan = getOrCompileValidationPlan(unboundedSchema, unboundedHot);
    const overflowDoc = { counter: 3_000_000_000 };

    const result = plan(overflowDoc);
    expect(result).not.toBeNull();
    expect(result?.[0]).toContain("outside the safe integer range");
  });

  it("should catch Valibot field validator failures", () => {
    const plan = getOrCompileValidationPlan(sampleSchema, hotFlags);
    const invalidTitle = { price: 100, title: "ab" };

    const result = plan(invalidTitle);
    expect(result).not.toBeNull();
    expect(result?.[0]).toContain("Title must be at least 3 characters");
  });

  it("should support skipFieldValidators option for hook and numeric-only gates", () => {
    const plan = getOrCompileValidationPlan(sampleSchema, hotFlags);
    // title is invalid, but skipFieldValidators: true should ignore it and only check numbers
    const doc = { price: 100, title: "ab" };

    const result = plan(doc, { skipFieldValidators: true });
    expect(result).toBeNull();
  });
});
