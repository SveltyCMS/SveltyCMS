/**
 * @file src/plugins/unified-data-hub/server/native-virtual-stitch.ts
 * @description v2.0 Phase C — native entry → virtual enrichment by foreign key.
 *
 * Two-step execution: accept native entry keys, batch-fetch matching virtual rows
 * via IN filter pushdown. No arbitrary SQL join across native Drizzle + external REST.
 *
 * Features:
 * - Key budget cap (N+1 guard)
 * - Returns keyed map for sidebar / entry preview stitching
 * - Audit integration via virtual query engine
 */

import type { IDBAdapter } from "@databases/db-interface";
import type { FederatedRow, VirtualCollectionReadOptions } from "../types";
import { FederationError } from "../types";
import { executeVirtualRead } from "./virtual-query-engine";
import {
  computeStitchTelemetry,
  MAX_NATIVE_STITCH_KEYS,
  type StitchTelemetry,
} from "./stitch-telemetry";
import { logFederationAccess } from "./audit";

export { MAX_NATIVE_STITCH_KEYS };

export interface NativeVirtualStitchOptions extends VirtualCollectionReadOptions {
  /** Virtual collection field to match (default: id) */
  virtualKeyField?: string;
}

export interface NativeVirtualStitchMeta extends StitchTelemetry {
  connectorId: string;
  keyCount: number;
  matched: number;
  staleness: "real-time" | "cache";
}

export interface NativeVirtualStitchResult {
  data: Record<string, FederatedRow | null>;
  meta: NativeVirtualStitchMeta;
}

export function assertNativeStitchKeyBudget(keyCount: number): void {
  if (keyCount > MAX_NATIVE_STITCH_KEYS) {
    throw new FederationError(
      "FEDERATION_JOIN_BUDGET_EXCEEDED",
      `Native stitch key budget exceeded (${keyCount} > ${MAX_NATIVE_STITCH_KEYS})`,
      400,
    );
  }
}

export function normalizeStitchKeys(keys: (string | number)[]): string[] {
  const normalized = [...new Set(keys.map((k) => String(k).trim()).filter(Boolean))];
  assertNativeStitchKeyBudget(normalized.length);
  return normalized;
}

/**
 * Batch-fetch virtual rows for native entry keys (entry preview / sidebar enrichment).
 */
export async function executeVirtualEnrichByKeys(
  db: IDBAdapter,
  virtualSlug: string,
  nativeKeys: (string | number)[],
  options: NativeVirtualStitchOptions = {},
  roles: unknown[] = [],
): Promise<NativeVirtualStitchResult> {
  const keys = normalizeStitchKeys(nativeKeys);
  if (keys.length === 0) {
    return {
      data: {},
      meta: {
        connectorId: "",
        matched: 0,
        staleness: "real-time",
        ...computeStitchTelemetry(0),
      },
    };
  }

  const virtualKeyField = options.virtualKeyField ?? "id";
  const numericKeys = keys.map((k) => (Number.isFinite(Number(k)) ? Number(k) : k));

  const result = await executeVirtualRead(
    db,
    virtualSlug,
    {
      ...options,
      limit: keys.length,
      offset: 0,
      filter: { [virtualKeyField]: numericKeys },
      bypassCache: options.bypassCache ?? true,
    },
    roles,
  );

  const index = new Map<string, FederatedRow>();
  for (const row of result.data) {
    const key = String(row[virtualKeyField] ?? row._source.sourceKey);
    if (!index.has(key)) index.set(key, row);
  }

  const data: Record<string, FederatedRow | null> = {};
  let matched = 0;
  for (const key of keys) {
    const row = index.get(key) ?? null;
    data[key] = row;
    if (row) matched += 1;
  }

  const telemetry = computeStitchTelemetry(keys.length);

  await logFederationAccess(db, {
    tenantId: String(options.tenantId ?? "default"),
    userId: options.user?._id,
    collectionId: virtualSlug,
    connectorId: result.meta.connectorId,
    action: "read",
    meta: {
      enrich: true,
      matched,
      ...telemetry,
    },
  });

  return {
    data,
    meta: {
      connectorId: result.meta.connectorId,
      matched,
      staleness: result.meta.staleness,
      ...telemetry,
    },
  };
}
