/**
 * @file src/plugins/commerce/store.ts
 * @description Tenant-bound collection adapter over LocalCMS.
 *
 * Every call injects `tenantId` into filters and writes. Guest mutations use
 * `system: true` so they do not require an authenticated CMS user.
 *
 * ### Features:
 * - findOne / findMany / create / update / delete
 * - schema presence check
 */

import type { DatabaseId } from "@src/content/types";
import type { LocalCMS } from "@src/services/sdk";
import { withTenant } from "./tenant";

export interface CommerceRow extends Record<string, unknown> {
  _id?: string;
}

export interface CommerceStore {
  tenantId: DatabaseId;
  findOne(collection: string, filter: Record<string, unknown>): Promise<CommerceRow | null>;
  findMany(
    collection: string,
    filter: Record<string, unknown>,
    opts?: { limit?: number },
  ): Promise<CommerceRow[]>;
  create(collection: string, data: Record<string, unknown>): Promise<CommerceRow>;
  update(collection: string, id: string, data: Record<string, unknown>): Promise<void>;
  delete(collection: string, id: string): Promise<void>;
  hasCollection(name: string): Promise<boolean>;
}

function unwrap(found: { success?: boolean; data?: unknown } | null | undefined): CommerceRow[] {
  if (!found || found.success === false) return [];
  const raw = found.data;
  if (Array.isArray(raw)) return raw as CommerceRow[];
  if (raw && typeof raw === "object" && !Array.isArray(raw) && "_id" in (raw as object)) {
    return [raw as CommerceRow];
  }
  return [];
}

export function createCommerceStore(cms: LocalCMS, tenantId: DatabaseId): CommerceStore {
  const ctx = { tenantId, system: true, publicationFilter: "all" as const };

  return {
    tenantId,

    async hasCollection(name: string): Promise<boolean> {
      try {
        const schema = await cms.collections.getSchema(name, tenantId);
        return Boolean(schema?._id);
      } catch {
        return false;
      }
    },

    async findOne(collection, filter) {
      const found = await cms.collections.find(collection, {
        ...ctx,
        filter: withTenant(tenantId, filter),
        limit: 1,
      });
      return unwrap(found)[0] ?? null;
    },

    async findMany(collection, filter, opts) {
      const found = await cms.collections.find(collection, {
        ...ctx,
        filter: withTenant(tenantId, filter),
        limit: opts?.limit ?? 50,
      });
      return unwrap(found);
    },

    async create(collection, data) {
      const created = await cms.collections.create(collection, withTenant(tenantId, data), ctx);
      const row = (created as { data?: CommerceRow })?.data ?? (created as CommerceRow);
      return row;
    },

    async update(collection, id, data) {
      const existing = await this.findOne(collection, { _id: id });
      if (!existing) return;
      // Content collections store schema fields in a single `data` JSON column
      // and the adapter's UPDATE treats the payload as the complete document —
      // a partial patch would silently drop unmentioned fields (e.g. the cart
      // sessionId, breaking findOne({ sessionId }) on the next request).
      // Merge the existing row so patches behave as read-modify-write.
      const { _collection, data: _data, ...rest } = existing as any;
      await cms.collections.update(collection, id, withTenant(tenantId, { ...rest, ...data }), ctx);
    },

    async delete(collection, id) {
      const existing = await this.findOne(collection, { _id: id });
      if (!existing) return;
      await cms.collections.delete(collection, id, { ...ctx, permanent: true });
    },
  };
}
