/**
 * @file src/services/sdk/namespaces/collections/actions.ts
 * @description Schema action dispatcher for CollectionsNamespace.
 *
 * Features:
 * - Declared schema action execution (`schema.actions[name]`)
 * - RBAC permission check based on action-level permission
 * - Combined support for `patch`, functional `run`, and atomic `increment`
 */

import { AppError } from "@utils/error-handling";
import { isAdmin } from "@src/databases/auth/constants";
import { hasPermissionWithRoles } from "@src/databases/auth/permissions";
import type { DatabaseId, IDBAdapter } from "@src/databases/db-interface";
import type { CollectionAction, Schema } from "@src/content/types";

export interface ActionsContext {
  _dbAdapter: IDBAdapter;
  schemaOf(collectionId: string, tenantId?: DatabaseId | null): Promise<Schema>;
  getCollectionName(schemaId: string): string;
  findById(
    collectionId: string,
    entryId: string,
    options?: { tenantId?: DatabaseId | null },
  ): Promise<{ success: boolean; data?: unknown }>;
  update(
    collectionId: string,
    entryId: string,
    data: unknown,
    options?: { user?: unknown; tenantId?: DatabaseId | null },
  ): Promise<{ success: boolean; data?: unknown }>;
}

/**
 * Run a declared schema action (`schema.actions[name]`) on one entry.
 *
 * The action's own `permission` is the authorization check (admins bypass via
 * `isAdmin`) — the dispatcher deliberately does not also require
 * `collections:write`. `patch` and the object returned by `run` merge into one
 * update; `increment` goes through the adapter's atomic increment. An action
 * without a `permission` is admin-only (fail closed).
 */
export async function runCollectionAction(
  ctx: ActionsContext,
  collectionId: string,
  action: string,
  entryId: string,
  input: unknown,
  options: { user?: unknown; tenantId?: DatabaseId | null; roles?: unknown } = {},
): Promise<{ success: boolean; data?: unknown }> {
  const { user, tenantId, roles } = options;
  if (!user) throw new AppError("Authentication required", 401, "UNAUTHORIZED");
  if (typeof action !== "string" || !action) {
    throw new AppError("Action name is required", 400, "ACTION_REQUIRED");
  }
  if (typeof entryId !== "string" || !entryId) {
    throw new AppError("Action entry id is required", 400, "ACTION_ENTRY_REQUIRED");
  }

  const schema = await ctx.schemaOf(collectionId, tenantId);
  const actions = (schema as { actions?: Record<string, CollectionAction> }).actions;
  const definition: CollectionAction | undefined =
    actions && typeof actions === "object" ? actions[action] : undefined;
  if (!definition || typeof definition !== "object") {
    throw new AppError(
      `Action '${action}' is not defined on '${collectionId}'`,
      404,
      "ACTION_NOT_FOUND",
    );
  }

  if (!isAdmin(user)) {
    if (!user) {
      throw new AppError("Authentication required", 401, "UNAUTHORIZED");
    }
    const allowed = Boolean(
      definition.permission &&
      hasPermissionWithRoles(
        user as Parameters<typeof hasPermissionWithRoles>[0],
        definition.permission,
        Array.isArray(roles) ? (roles as Parameters<typeof hasPermissionWithRoles>[2]) : [],
      ),
    );
    if (!allowed) {
      throw new AppError(
        `Forbidden: missing permission for action '${action}'`,
        403,
        "ACTION_FORBIDDEN",
      );
    }
  }

  let patch: Record<string, unknown> =
    definition.patch && typeof definition.patch === "object" && !Array.isArray(definition.patch)
      ? { ...definition.patch }
      : {};

  if (typeof definition.run === "function") {
    const produced = await definition.run({
      collectionId,
      entryId,
      input,
      user,
      tenantId: tenantId ?? null,
      schema,
    });
    if (produced && typeof produced === "object" && !Array.isArray(produced)) {
      patch = { ...patch, ...(produced as Record<string, unknown>) };
    }
  }

  const result: { success: boolean; data?: unknown } =
    Object.keys(patch).length > 0
      ? await ctx.update(collectionId, entryId, patch, { user, tenantId })
      : await ctx.findById(collectionId, entryId, { tenantId });

  if (definition.increment && typeof definition.increment === "object") {
    const field = definition.increment.field;
    if (typeof field === "string" && field) {
      const incrementResult = await ctx._dbAdapter.crud.atomicIncrement?.(
        ctx.getCollectionName(schema._id as string),
        entryId as DatabaseId,
        field,
        typeof definition.increment.amount === "number" ? definition.increment.amount : 1,
        { tenantId: tenantId as DatabaseId },
      );
      if (incrementResult) return incrementResult;
    }
  }

  return result;
}
