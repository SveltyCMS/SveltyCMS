/**
 * @file src/content/schema-hooks.ts
 * @description Schema lifecycle hook types and pure runners for document write paths.
 *
 * Provides list and field hooks that run on every write path (Local API, HTTP API,
 * admin UI). `resolveInput`, `validate`, and `beforeOperation` participate in
 * `applySchemaHookPipeline`. `afterOperation` is a separate post-persist runner.
 * `beforeValidate` and `afterValidate` stay in that pipeline when no newer hooks
 * are declared. Rejection belongs in `validate` (or the legacy callback).
 *
 * ### Features:
 * - field then list resolveInput, before the existing beforeValidate transform
 * - field validate, list validate, and the legacy callback joined into one error
 * - field then list beforeOperation, after validation and before afterValidate
 * - runAfterOperation: field then list, never inside the write pipeline
 * - Fully optional — schemas without hooks work unchanged
 * - ValidationContext provides schema metadata, operation, and optional field
 * - Optional error factory: write paths can throw typed errors
 *   (e.g. AppError with FIELD_VALIDATION_ERROR) without coupling this
 *   dependency-light module to the error-handling package
 */

import type { Schema } from "./types";

/**
 * Context passed to schema lifecycle hooks.
 * Provides runtime metadata about the operation being performed.
 */
/** Field identity passed to field-level hooks. */
export interface HookFieldRef {
  db_fieldName?: string;
  name?: string;
  label?: string;
  hooks?: FieldHooks;
}

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
  /** Field whose hook is running, when the hook is field-scoped. */
  field?: HookFieldRef;
  /** Storage key for `field` (`db_fieldName`, then `name`, then `label`). */
  fieldKey?: string;
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
type DataHook = (
  data: Record<string, unknown>,
  context: ValidationContext,
) => Record<string, unknown> | Promise<Record<string, unknown>>;

type ValidateHook = (
  data: Record<string, unknown>,
  context: ValidationContext,
  addValidationError: (message: string) => void,
) => void | string | string[] | Promise<void | string | string[]>;

/**
 * Per-field hooks. Same four steps as {@link SchemaHooks}, scoped to one field.
 * `context.field` and `context.fieldKey` identify the field that is running.
 */
export interface FieldHooks {
  resolveInput?: DataHook;
  validate?: ValidateHook;
  beforeOperation?: DataHook;
  afterOperation?: (
    data: Record<string, unknown>,
    context: ValidationContext,
  ) => void | Promise<void>;
}

export interface SchemaHooks {
  /**
   * List-level input normalization. Runs after every field `resolveInput`
   * and before `beforeValidate`.
   */
  resolveInput?: DataHook;

  /**
   * List-level validation. Collected with field `validate` and the legacy
   * callback; one joined error is thrown and later hooks do not run.
   */
  validate?: ValidateHook;

  /**
   * Last list transform after validation passes, after field `beforeOperation`
   * and before `afterValidate`.
   */
  beforeOperation?: DataHook;

  /**
   * Post-persist list hook. Not part of {@link applySchemaHookPipeline} —
   * callers use {@link runAfterOperation} after a successful write.
   */
  afterOperation?: (
    data: Record<string, unknown>,
    context: ValidationContext,
  ) => void | Promise<void>;

  /**
   * Runs before field validation.
   * Use for data normalization/transformation (trim, slugify, defaults).
   * Must return the (possibly modified) data object.
   */
  beforeValidate?: DataHook;

  /**
   * Runs after field validation passes.
   * Use for computed/side-effect-free transforms that depend on valid data.
   * Must return the (possibly modified) data object.
   */
  afterValidate?: DataHook;
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
 * Options for `applySchemaHookPipeline`.
 */
export interface SchemaHookPipelineOptions {
  /**
   * Turns validation error messages into a throwable.
   * Default: `(msgs) => new Error(msgs.join("; "))`.
   * Write paths may supply a factory that throws a typed error
   * (e.g. `AppError(msgs.join("; "), 400, "FIELD_VALIDATION_ERROR")`).
   */
  createError?: (messages: string[]) => Error;
  /** Schema fields whose `hooks` run around the list hooks. */
  fields?: readonly unknown[];
}

function asHookField(field: unknown): HookFieldRef | null {
  if (!field || typeof field !== "object") return null;
  return field as HookFieldRef;
}

function hookFieldKey(field: HookFieldRef): string {
  return String(field.db_fieldName || field.name || field.label || "");
}

function withDocument(
  ctx: ValidationContext,
  current: Record<string, unknown>,
  field?: HookFieldRef,
): ValidationContext {
  const next: ValidationContext = { ...ctx, document: { ...current } };
  if (field) {
    next.field = field;
    next.fieldKey = hookFieldKey(field);
  }
  return next;
}

async function applyDataHook(
  fn: DataHook | undefined,
  data: Record<string, unknown>,
  context: ValidationContext,
): Promise<Record<string, unknown>> {
  if (!fn) return data;
  const next = await fn(data, context);
  return next && typeof next === "object" ? next : data;
}

function pushValidationResult(errors: string[], result: unknown): void {
  if (typeof result === "string") {
    if (result) errors.push(result);
    return;
  }
  if (!Array.isArray(result)) return;
  for (let i = 0; i < result.length; i++) {
    const item = result[i];
    if (typeof item === "string" && item) errors.push(item);
  }
}

/**
 * Run field resolveInput → list resolveInput → beforeValidate →
 * field/list/callback validate → field beforeOperation → list beforeOperation →
 * afterValidate.
 *
 * `validate` should throw or return error strings. Field `validate`, list
 * `validate`, and that callback are collected and thrown once (joined with
 * `"; "`, or via `options.createError`). `beforeOperation` and `afterValidate`
 * do not run when any of those produced an error. `afterOperation` is not
 * called here.
 */
export async function applySchemaHookPipeline(
  hooks: SchemaHooks | undefined | null,
  data: Record<string, unknown>,
  context: Omit<ValidationContext, "document">,
  validate?: (data: Record<string, unknown>) => string[] | void,
  options?: SchemaHookPipelineOptions,
): Promise<Record<string, unknown>> {
  let current = data;
  const ctx: ValidationContext = {
    ...context,
    document: { ...current },
  };
  const fields = options?.fields;

  if (fields && fields.length > 0) {
    for (let i = 0; i < fields.length; i++) {
      const field = asHookField(fields[i]);
      const resolve = field?.hooks?.resolveInput;
      if (!field || !resolve) continue;
      current = await applyDataHook(resolve, current, withDocument(ctx, current, field));
    }
  }

  if (hooks?.resolveInput) {
    current = await applyDataHook(hooks.resolveInput, current, withDocument(ctx, current));
  }

  current = await applyBeforeValidate(hooks, current, withDocument(ctx, current));

  const errors: string[] = [];
  const addValidationError = (message: string) => {
    if (message) errors.push(message);
  };

  if (fields && fields.length > 0) {
    for (let i = 0; i < fields.length; i++) {
      const field = asHookField(fields[i]);
      const validateField = field?.hooks?.validate;
      if (!field || !validateField) continue;
      const result = await validateField(
        current,
        withDocument(ctx, current, field),
        addValidationError,
      );
      pushValidationResult(errors, result);
    }
  }

  if (hooks?.validate) {
    const result = await hooks.validate(current, withDocument(ctx, current), addValidationError);
    pushValidationResult(errors, result);
  }

  if (validate) {
    const callbackErrors = validate(current);
    if (Array.isArray(callbackErrors) && callbackErrors.length > 0) {
      for (let i = 0; i < callbackErrors.length; i++) errors.push(callbackErrors[i]);
    }
  }

  if (errors.length > 0) {
    const createError = options?.createError;
    throw createError ? createError(errors) : new Error(errors.join("; "));
  }

  if (fields && fields.length > 0) {
    for (let i = 0; i < fields.length; i++) {
      const field = asHookField(fields[i]);
      const before = field?.hooks?.beforeOperation;
      if (!field || !before) continue;
      current = await applyDataHook(before, current, withDocument(ctx, current, field));
    }
  }

  if (hooks?.beforeOperation) {
    current = await applyDataHook(hooks.beforeOperation, current, withDocument(ctx, current));
  }

  current = await applyAfterValidate(hooks, current, withDocument(ctx, current));

  return current;
}

/**
 * Field `afterOperation`, then list `afterOperation`. Callers run this after a
 * successful persist — it is intentionally not part of the validate pipeline.
 */
export async function runAfterOperation(
  hooks: SchemaHooks | undefined | null,
  fields: readonly unknown[] | undefined | null,
  data: Record<string, unknown>,
  context: Omit<ValidationContext, "document"> | ValidationContext,
): Promise<void> {
  const source = context as ValidationContext;
  const ctx: ValidationContext = {
    ...source,
    document: source.document ?? { ...data },
  };
  if (fields && fields.length > 0) {
    for (let i = 0; i < fields.length; i++) {
      const field = asHookField(fields[i]);
      const after = field?.hooks?.afterOperation;
      if (!field || !after) continue;
      await after(data, withDocument(ctx, data, field));
    }
  }
  if (hooks?.afterOperation) {
    await hooks.afterOperation(data, withDocument(ctx, data));
  }
}
