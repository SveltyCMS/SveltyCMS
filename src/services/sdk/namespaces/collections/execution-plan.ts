/**
 * @file src/services/sdk/namespaces/collections/execution-plan.ts
 * @description Pre-compiled execution plan for collection schemas.
 *
 * Features:
 * - WeakMap-backed cached plans per Schema reference
 * - Static analysis of widgets, field encryption, workflows, relation hydration, and hooks
 * - `isPlain` flag (>80% of collections) enabling ultra-fast zero-allocation path
 * - Fast-path predicates for point-reads, inserts, and updates
 */

import type { Schema } from "@src/content/types";
import { ensureSchemaHotFlags } from "./schema-store";
import { junctionFieldsOf } from "./junction-fields";

export interface RelationFieldPlan {
  readonly name: string;
  readonly target: string;
  readonly displayField: string;
  readonly isList: boolean;
}

export interface CollectionExecutionPlan {
  /** True when schema has no active widgets, encryption, workflows, hooks, junctions, or relations (>80% of collections) */
  readonly isPlain: boolean;
  /** Schema has widgets requiring async modifyRequest pipeline */
  readonly hasWidgets: boolean;
  /** Schema has fields flagged with encrypt: true */
  readonly hasEncryption: boolean;
  /** Schema or collection has review workflow requirements */
  readonly hasWorkflows: boolean;
  /** Schema declares Relation or RelationList fields */
  readonly hasRelations: boolean;
  /** Schema declares many-to-many junction fields */
  readonly hasJunctions: boolean;
  /** Schema declares lifecycle hooks (beforeSave, resolveInput, validate, etc.) */
  readonly hasHooks: boolean;
  /** Schema has field-level permissions or visibility guards */
  readonly hasGuards: boolean;
  /** Schema declares custom ownership fields */
  readonly hasOwnership: boolean;
  /** Pre-compiled relation fields for display hydration */
  readonly relationFields: readonly RelationFieldPlan[];
  /** Pre-compiled encrypted field names */
  readonly encryptedFields: readonly string[];
  /** Pre-compiled active widget field names */
  readonly activeWidgetFields: readonly string[];
}

const planCache = new WeakMap<Schema, CollectionExecutionPlan>();

/**
 * Compile or return cached execution plan for a collection schema.
 * Inspects declared fields, widgets, hooks, workflows, and encryption to
 * predetermine pipeline requirements once per schema instance.
 */
export function getCollectionExecutionPlan(schema: Schema): CollectionExecutionPlan {
  const cached = planCache.get(schema);
  if (cached) return cached;

  const hot = ensureSchemaHotFlags(schema);
  const hasWidgets = Boolean(hot._hasActiveWidgets);
  const activeWidgetFields = hot._activeWidgetFieldNames ?? [];
  const hasEncryption = Boolean(hot._hasEncryptedFields);
  const encryptedFields = hot._encryptedFieldNames ?? [];
  const hasHooks = Boolean(
    hot._hasHooks ||
    hot._hasAfterOperationHooks ||
    hot._hasHookFields ||
    (schema.hooks && typeof schema.hooks === "object" && Object.keys(schema.hooks).length > 0),
  );
  const hasGuards = Boolean(hot._hasGuardedFields);

  const ownership = (schema as { ownership?: { field?: unknown } }).ownership;
  const hasOwnership = Boolean(
    ownership &&
    typeof ownership === "object" &&
    typeof ownership.field === "string" &&
    ownership.field.length > 0,
  );

  const hasWorkflows = Boolean(
    (schema as { workflow?: unknown }).workflow ||
    (schema as { reviewWorkflow?: unknown }).reviewWorkflow ||
    (schema as { hasWorkflow?: unknown }).hasWorkflow ||
    schema.plugins?.includes("workflow"),
  );

  const fields = (schema.fields || []) as Array<Record<string, unknown>>;
  const relationFields: RelationFieldPlan[] = [];
  for (const field of fields) {
    const widgetName = (field.widget as { Name?: string } | undefined)?.Name;
    const isRelation = widgetName === "Relation";
    const isRelationList = widgetName === "RelationList";
    const type = typeof field.type === "string" ? field.type : "";
    const hasRel = isRelation || isRelationList || type === "relation" || Boolean(field.relation);
    if (hasRel) {
      const target =
        typeof field.collection === "string"
          ? field.collection
          : typeof field.relation === "string"
            ? field.relation
            : "";
      const displayField = typeof field.displayField === "string" ? field.displayField : "";
      const name = String(field.db_fieldName || field.name || field.label || "");
      if (name) {
        relationFields.push({
          name,
          target,
          displayField,
          isList: isRelationList || type === "relation-list" || field.multiple === true,
        });
      }
    }
  }
  const hasRelations = relationFields.length > 0;
  const hasJunctions = junctionFieldsOf(schema).length > 0;

  const isPlain =
    !hasWidgets &&
    !hasEncryption &&
    !hasWorkflows &&
    !hasRelations &&
    !hasJunctions &&
    !hasHooks &&
    !hasGuards &&
    !hasOwnership;

  const plan: CollectionExecutionPlan = Object.freeze({
    isPlain,
    hasWidgets,
    hasEncryption,
    hasWorkflows,
    hasRelations,
    hasJunctions,
    hasHooks,
    hasGuards,
    hasOwnership,
    relationFields: Object.freeze(relationFields),
    encryptedFields: Object.freeze(encryptedFields),
    activeWidgetFields: Object.freeze(activeWidgetFields),
  });

  planCache.set(schema, plan);
  return plan;
}

export const getExecutionPlan = getCollectionExecutionPlan;

/** Returns true when the collection schema has no active widgets, encryption, workflows, or relation hydration. */
export function isPlainCollection(schema: Schema): boolean {
  return getCollectionExecutionPlan(schema).isPlain;
}
