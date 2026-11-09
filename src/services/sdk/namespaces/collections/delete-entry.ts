/**
 * @file src/services/sdk/namespaces/collections/delete-entry.ts
 * @description
 * Entry deletion lane for `CollectionsNamespace`: authentication/ownership
 * gate, outbox-aware adapter delete (soft or permanent) and the detached
 * post-write side effects. Extracted verbatim with explicit context deps.
 *
 * ### Features:
 * - fail-closed auth (401) and schema resolution before any write
 * - ownership/access-rule 404 for foreign rows (system callers bypass)
 * - `permanent` forwarding to the adapter (soft-delete into Trash by default)
 * - `persistWithOutbox` with the caller's userId and transaction handle
 * - detached L1/L2 invalidation, pub/sub, workflow and plugin hooks via
 *   `schedulePostWrite`, plus the same best-effort default-list warm-up
 */

import { AppError } from "@utils/error-handling";
import type { DatabaseId, IDBAdapter } from "@src/databases/db-interface";
import type { Schema } from "@src/content/types";
import type { LocalApiOptions } from "../types";
import { persistWithOutbox, schedulePostWrite, shouldSkipWriteSideEffects } from "./post-write";
import { scheduleDefaultListWarm } from "./list-warm";

/** What the delete lane needs from the namespace — no class instance required. */
export interface DeleteEntryContext {
  _dbAdapter: IDBAdapter;
  schemaOf(collectionId: string, tenantId?: DatabaseId | null): Promise<Schema>;
  getCollectionName(schemaId: string): string;
  assertEntryOwnership(
    schema: Schema,
    entryId: string,
    tenantId: DatabaseId | null | undefined,
    user: unknown,
    system?: boolean,
  ): void | Promise<void>;
  find(
    collectionId: string,
    options: { tenantId?: DatabaseId | null; user?: unknown },
  ): Promise<unknown>;
}

/** Delete one entry, cascading to the same post-write side effects as before. */
export async function executeDelete(
  ctx: DeleteEntryContext,
  collectionId: string,
  entryId: string,
  options: LocalApiOptions & { permanent?: boolean } = {},
) {
  const { user, tenantId, system } = options;
  if (!user && !system) throw new AppError("Authentication required", 401, "UNAUTHORIZED");
  const schema = await ctx.schemaOf(collectionId, tenantId);
  if (!system) {
    const ownP = ctx.assertEntryOwnership(schema, entryId, tenantId, user, system);
    if (ownP) await ownP;
  }

  const effectiveUser = system ? { _id: "system", role: "admin" } : user;

  const result = await persistWithOutbox(
    "delete",
    async (txOpts) =>
      ctx._dbAdapter.crud.delete(
        ctx.getCollectionName(schema._id as string),
        entryId as DatabaseId,
        {
          tenantId: tenantId as DatabaseId,
          // false (default) = soft delete into the Trash, true = real DELETE.
          permanent: options.permanent === true,
          userId: effectiveUser?._id as DatabaseId,
          ...txOpts,
        },
      ),
    schema,
    tenantId,
    effectiveUser,
    () => entryId,
    () => null,
    { skipSideEffects: options.skipSideEffects },
  );

  if (result && result.success) {
    // ⚡ Response-path: never await side effects — concurrent delete RPS depends on this
    schedulePostWrite(
      ctx._dbAdapter,
      "delete",
      schema,
      collectionId,
      tenantId,
      entryId,
      null,
      effectiveUser,
      options,
    );
    if (!shouldSkipWriteSideEffects(options)) {
      scheduleDefaultListWarm(schema._id as string, tenantId, effectiveUser, (warmOpts) =>
        ctx.find(collectionId, {
          tenantId: warmOpts.tenantId as DatabaseId | null | undefined,
          user: warmOpts.user,
        }),
      );
    }
  }

  return result;
}
