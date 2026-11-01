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

interface CompiledFieldHooksPlan {
  hasPrePersistHooks: boolean;
  hasAfterHooks: boolean;
  resolveInput: Array<{ field: HookFieldRef; key: string; fn: DataHook }>;
  validate: Array<{ field: HookFieldRef; key: string; fn: ValidateHook }>;
  beforeOperation: Array<{ field: HookFieldRef; key: string; fn: DataHook }>;
  afterOperation: Array<{
    field: HookFieldRef;
    key: string;
    fn: NonNullable<FieldHooks["afterOperation"]>;
  }>;
}

const EMPTY_FIELD_HOOKS_PLAN: CompiledFieldHooksPlan = Object.freeze({
  hasPrePersistHooks: false,
  hasAfterHooks: false,
  resolveInput: [],
  validate: [],
  beforeOperation: [],
  afterOperation: [],
});

const fieldHooksPlanCache = new WeakMap<readonly unknown[], CompiledFieldHooksPlan>();

function getFieldHooksPlan(fields: readonly unknown[]): CompiledFieldHooksPlan {
  let plan = fieldHooksPlanCache.get(fields);
  if (plan) return plan;

  let resolveInput: CompiledFieldHooksPlan["resolveInput"] | null = null;
  let validate: CompiledFieldHooksPlan["validate"] | null = null;
  let beforeOperation: CompiledFieldHooksPlan["beforeOperation"] | null = null;
  let afterOperation: CompiledFieldHooksPlan["afterOperation"] | null = null;

  for (let i = 0; i < fields.length; i++) {
    const field = asHookField(fields[i]);
    const h = field?.hooks;
    if (!field || !h) continue;
    const key = hookFieldKey(field);
    if (h.resolveInput) (resolveInput ??= []).push({ field, key, fn: h.resolveInput });
    if (h.validate) (validate ??= []).push({ field, key, fn: h.validate });
    if (h.beforeOperation) (beforeOperation ??= []).push({ field, key, fn: h.beforeOperation });
    if (h.afterOperation) (afterOperation ??= []).push({ field, key, fn: h.afterOperation });
  }

  plan =
    resolveInput || validate || beforeOperation || afterOperation
      ? {
          hasPrePersistHooks: Boolean(resolveInput || validate || beforeOperation),
          hasAfterHooks: Boolean(afterOperation),
          resolveInput: resolveInput ?? EMPTY_FIELD_HOOKS_PLAN.resolveInput,
          validate: validate ?? EMPTY_FIELD_HOOKS_PLAN.validate,
          beforeOperation: beforeOperation ?? EMPTY_FIELD_HOOKS_PLAN.beforeOperation,
          afterOperation: afterOperation ?? EMPTY_FIELD_HOOKS_PLAN.afterOperation,
        }
      : EMPTY_FIELD_HOOKS_PLAN;
  try {
    fieldHooksPlanCache.set(fields, plan);
  } catch {
    // Non-extensible array fallback
  }
  return plan;
}

function withDocument(
  ctx: ValidationContext,
  current: Record<string, unknown>,
  field?: HookFieldRef,
  fieldKey?: string,
): ValidationContext {
  const next: ValidationContext = { ...ctx, document: { ...current } };
  if (field) {
    next.field = field;
    next.fieldKey = fieldKey ?? hookFieldKey(field);
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
  const fields = options?.fields;
  const fieldPlan = fields && fields.length > 0 ? getFieldHooksPlan(fields) : null;

  const hasListHooks = Boolean(
    hooks &&
    (hooks.resolveInput ||
      hooks.beforeValidate ||
      hooks.validate ||
      hooks.beforeOperation ||
      hooks.afterValidate),
  );
  const hasFieldHooks = Boolean(fieldPlan?.hasPrePersistHooks);

  // Zero-allocation fast path when neither list nor field hooks exist
  if (!hasListHooks && !hasFieldHooks) {
    if (validate) {
      const callbackErrors = validate(data);
      if (Array.isArray(callbackErrors) && callbackErrors.length > 0) {
        const createError = options?.createError;
        throw createError ? createError(callbackErrors) : new Error(callbackErrors.join("; "));
      }
    }
    return data;
  }

  let current = data;
  const ctx: ValidationContext = {
    ...context,
    document: { ...current },
  };

  if (fieldPlan && fieldPlan.resolveInput.length > 0) {
    for (let i = 0; i < fieldPlan.resolveInput.length; i++) {
      const entry = fieldPlan.resolveInput[i];
      current = await applyDataHook(
        entry.fn,
        current,
        withDocument(ctx, current, entry.field, entry.key),
      );
    }
  }

  if (hooks?.resolveInput) {
    current = await applyDataHook(hooks.resolveInput, current, withDocument(ctx, current));
  }

  if (hooks?.beforeValidate) {
    current = await applyBeforeValidate(hooks, current, withDocument(ctx, current));
  }

  const errors: string[] = [];
  const addValidationError = (message: string) => {
    if (message) errors.push(message);
  };

  if (fieldPlan && fieldPlan.validate.length > 0) {
    for (let i = 0; i < fieldPlan.validate.length; i++) {
      const entry = fieldPlan.validate[i];
      const result = await entry.fn(
        current,
        withDocument(ctx, current, entry.field, entry.key),
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

  if (fieldPlan && fieldPlan.beforeOperation.length > 0) {
    for (let i = 0; i < fieldPlan.beforeOperation.length; i++) {
      const entry = fieldPlan.beforeOperation[i];
      current = await applyDataHook(
        entry.fn,
        current,
        withDocument(ctx, current, entry.field, entry.key),
      );
    }
  }

  if (hooks?.beforeOperation) {
    current = await applyDataHook(hooks.beforeOperation, current, withDocument(ctx, current));
  }

  if (hooks?.afterValidate) {
    current = await applyAfterValidate(hooks, current, withDocument(ctx, current));
  }

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
  const fieldPlan = fields && fields.length > 0 ? getFieldHooksPlan(fields) : null;
  if (!fieldPlan?.hasAfterHooks && !hooks?.afterOperation) {
    return;
  }

  const source = context as ValidationContext;
  const ctx: ValidationContext = {
    ...source,
    document: source.document ?? { ...data },
  };
  if (fieldPlan && fieldPlan.afterOperation.length > 0) {
    for (let i = 0; i < fieldPlan.afterOperation.length; i++) {
      const entry = fieldPlan.afterOperation[i];
      await entry.fn(data, withDocument(ctx, data, entry.field, entry.key));
    }
  }
  if (hooks?.afterOperation) {
    await hooks.afterOperation(data, withDocument(ctx, data));
  }
}
