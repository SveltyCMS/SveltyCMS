/**
 * @file tests/unit/services/execution-plan.test.ts
 * @description Unit tests for collection schema pre-compiled execution plan.
 *
 * Features:
 * - WeakMap plan caching by schema reference
 * - Plain collection detection (>80% of collections)
 * - Active widget detection and activeWidgetFields population
 * - Encrypted field detection and encryptedFields population
 * - Relation field detection and display hydration planning
 * - Workflow and hook detection
 */

import { describe, it, expect } from "vitest";
import {
  getCollectionExecutionPlan,
  isPlainCollection,
} from "@src/services/sdk/namespaces/collections/execution-plan";
import type { Schema } from "@src/content/types";

describe("CollectionExecutionPlan", () => {
  it("marks a standard scalar schema as isPlain === true", () => {
    const schema: Schema = {
      _id: "posts",
      name: "posts",
      fields: [
        { db_fieldName: "title", label: "Title", widget: { Name: "Input" }, type: "string" },
        { db_fieldName: "content", label: "Content", widget: { Name: "Textarea" }, type: "string" },
        { db_fieldName: "views", label: "Views", widget: { Name: "Input" }, type: "number" },
      ],
    };

    const plan = getCollectionExecutionPlan(schema);
    expect(plan.isPlain).toBe(true);
    expect(plan.hasWidgets).toBe(false);
    expect(plan.hasEncryption).toBe(false);
    expect(plan.hasWorkflows).toBe(false);
    expect(plan.hasRelations).toBe(false);
    expect(plan.hasHooks).toBe(false);
    expect(plan.hasGuards).toBe(false);
    expect(plan.hasOwnership).toBe(false);
    expect(plan.relationFields).toEqual([]);
    expect(plan.encryptedFields).toEqual([]);
    expect(isPlainCollection(schema)).toBe(true);
  });

  it("caches execution plan by schema reference via WeakMap", () => {
    const schema: Schema = {
      _id: "categories",
      name: "categories",
      fields: [{ db_fieldName: "name", label: "Name", widget: { Name: "Input" }, type: "string" }],
    };

    const plan1 = getCollectionExecutionPlan(schema);
    const plan2 = getCollectionExecutionPlan(schema);
    expect(plan1).toBe(plan2);
  });

  it("detects encrypted fields and flags hasEncryption === true, isPlain === false", () => {
    const schema: Schema = {
      _id: "secrets",
      name: "secrets",
      fields: [
        {
          db_fieldName: "token",
          label: "Token",
          widget: { Name: "Input" },
          type: "string",
          encrypt: true,
        },
        { db_fieldName: "label", label: "Label", widget: { Name: "Input" }, type: "string" },
      ],
    };

    const plan = getCollectionExecutionPlan(schema);
    expect(plan.isPlain).toBe(false);
    expect(plan.hasEncryption).toBe(true);
    expect(plan.encryptedFields).toContain("token");
    expect(isPlainCollection(schema)).toBe(false);
  });

  it("detects relations and compiles relationFields", () => {
    const schema: Schema = {
      _id: "articles",
      name: "articles",
      fields: [
        {
          db_fieldName: "authorId",
          label: "Author",
          widget: { Name: "Relation" },
          collection: "authors",
          displayField: "name",
        },
        {
          db_fieldName: "tags",
          label: "Tags",
          widget: { Name: "RelationList" },
          collection: "tags",
          displayField: "title",
        },
      ],
    };

    const plan = getCollectionExecutionPlan(schema);
    expect(plan.isPlain).toBe(false);
    expect(plan.hasRelations).toBe(true);
    expect(plan.relationFields).toHaveLength(2);
    expect(plan.relationFields[0]).toEqual({
      name: "authorId",
      target: "authors",
      displayField: "name",
      isList: false,
    });
    expect(plan.relationFields[1]).toEqual({
      name: "tags",
      target: "tags",
      displayField: "title",
      isList: true,
    });
  });

  it("detects review workflows and flags hasWorkflows === true", () => {
    const schemaWithWorkflow: Schema = {
      _id: "proposals",
      name: "proposals",
      fields: [
        { db_fieldName: "title", label: "Title", widget: { Name: "Input" }, type: "string" },
      ],
      workflow: true,
    } as unknown as Schema;

    const plan = getCollectionExecutionPlan(schemaWithWorkflow);
    expect(plan.isPlain).toBe(false);
    expect(plan.hasWorkflows).toBe(true);
  });

  it("detects lifecycle hooks and flags hasHooks === true", () => {
    const schemaWithHooks: Schema = {
      _id: "audit",
      name: "audit",
      fields: [
        { db_fieldName: "title", label: "Title", widget: { Name: "Input" }, type: "string" },
      ],
      hooks: {
        beforeSave: () => {},
      },
    } as unknown as Schema;

    const plan = getCollectionExecutionPlan(schemaWithHooks);
    expect(plan.isPlain).toBe(false);
    expect(plan.hasHooks).toBe(true);
  });
});
