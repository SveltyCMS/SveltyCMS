/**
 * @file src/content/schema-hooks.ts
 * @description Schema lifecycle hook types and pure runners for document write paths.
 *
 * Provides `beforeValidate` and `afterValidate` transform functions that
 * run on every write path (Local API, HTTP API, admin UI) before and after
 * field-level gate validation. Hooks are for data normalization/transformation —
 * rejection should stay in validation rules.
 *
 * ### Features:
 * - beforeValidate: normalize input (trim, slugify, stamp defaults)
 * - afterValidate: computed/side-effect-free transforms after validation
 * - Fully optional — schemas without hooks work unchanged
 * - Pure `applySchemaHooks` helper for unit testing and shared use
 * - ValidationContext provides schema metadata and operation context
 */

import type { Schema } from "./types";

/**
 * Context passed to schema lifecycle hooks.
 * Provides runtime metadata about the operation being performed.
 */
export interface ValidationContext {
  /** The schema definition being validated against */
  schema: Schema;
  /** The type of write operation */
  operation: "create" | "update";
  /** Tenant scope for multi-tenant isolation */
  tenantId?: string;
  /** User performing the operation */
  userId?: string;
  /** The full document being validated (before transform) */
  document?: Record<string, unknown>;
}

/**
 * Schema lifecycle hooks that run during document write paths.
 *
 * Hooks are transform functions — they receive the data and return
 * (possibly modified) data. They must NOT throw for rejection; use
 * validation rules for that.
 *
 * @example
 * ```typescript
 * const postSchema = {
 *   _id: 'post',
 *   fields: [
 *     { name: 'title', type: 'string' },
 *     { name: 'slug', type: 'string' },
 *   ],
 *   hooks: {
 *     beforeValidate: (data) => ({
 *       ...data,
 *       slug: data.slug || String(data.title || '').toLowerCase().replace(/\s+/g, '-'),
 *     }),
 *   },
 * };
 * ```
 */
export interface SchemaHooks {
  /**
   * Runs before field validation.
   * Use for data normalization/transformation (trim, slugify, defaults).
   * Must return the (possibly modified) data object.
   */
  beforeValidate?: (
    data: Record<string, unknown>,
    context: ValidationContext,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>;

  /**
   * Runs after field validation passes.
   * Use for computed/side-effect-free transforms that depend on valid data.
   * Must return the (possibly modified) data object.
   */
  afterValidate?: (
    data: Record<string, unknown>,
    context: ValidationContext,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>;
}

/**
 * Apply `beforeValidate` (if present). Pure helper for tests and write paths.
 */
export async function applyBeforeValidate(
  hooks: SchemaHooks | undefined | null,
  data: Record<string, unknown>,
  context: ValidationContext,
): Promise<Record<string, unknown>> {
  if (!hooks?.beforeValidate) return data;
  const next = await hooks.beforeValidate(data, context);
  return next && typeof next === "object" ? next : data;
}

/**
 * Apply `afterValidate` (if present). Pure helper for tests and write paths.
 */
export async function applyAfterValidate(
  hooks: SchemaHooks | undefined | null,
  data: Record<string, unknown>,
  context: ValidationContext,
): Promise<Record<string, unknown>> {
  if (!hooks?.afterValidate) return data;
  const next = await hooks.afterValidate(data, context);
  return next && typeof next === "object" ? next : data;
}

/**
 * Run beforeValidate → optional sync validator → afterValidate.
 * `validate` should throw or return error strings; when it returns a non-empty
 * string array the runner throws an Error with joined messages.
 */
export async function applySchemaHookPipeline(
  hooks: SchemaHooks | undefined | null,
  data: Record<string, unknown>,
  context: Omit<ValidationContext, "document">,
  validate?: (data: Record<string, unknown>) => string[] | void,
): Promise<Record<string, unknown>> {
  let current = data;
  const ctx: ValidationContext = {
    ...context,
    document: { ...current },
  };

  current = await applyBeforeValidate(hooks, current, {
    ...ctx,
    document: { ...current },
  });

  if (validate) {
    const errors = validate(current);
    if (Array.isArray(errors) && errors.length > 0) {
      throw new Error(errors.join("; "));
    }
  }

  current = await applyAfterValidate(hooks, current, {
    ...ctx,
    document: { ...current },
  });

  return current;
}
