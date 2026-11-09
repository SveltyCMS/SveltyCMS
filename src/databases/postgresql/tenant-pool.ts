/**
 * @file src/databases/postgresql/tenant-pool.ts
 * @description Dedicated PostgreSQL per-tenant connection pool manager.
 *
 * Features:
 * - Dynamic pool slice provisioning for multi-tenant isolation
 * - Activity-tracked idle pool eviction with query in-flight protection
 * - Application name tagging for pg_stat_activity observability
 * - Dedicated URL configuration per tenant
 */

import postgres from "postgres";
import { logger } from "@utils/logger";
import type { TenantPoolManager } from "../core/tenant-pool-manager";
import { PG_TEXT_DATE_TYPES, pgConnectionParameters, pgIdleTimeout } from "./postgres-utils";

export interface PostgresTenantPoolContext {
  tenantPools: TenantPoolManager<ReturnType<typeof postgres>>;
}

/**
 * Retrieves or lazily creates a dedicated postgres.js connection pool for a tenant.
 */
export function getPostgresTenantPool(
  ctx: PostgresTenantPoolContext,
  tenantId: string,
): ReturnType<typeof postgres> {
  const existing = ctx.tenantPools.acquire(tenantId);
  if (existing) {
    return existing;
  }

  const maxTenantPools = parseInt(process.env.MAX_TENANT_POOLS || "16", 10);
  ctx.tenantPools.evictOldestIdle(maxTenantPools);

  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) {
    throw new Error(
      "[PostgreSQLAdapter] DATABASE_URL is not configured — cannot create tenant pool",
    );
  }

  const poolSize = parseInt(process.env.TENANT_DB_POOL_SIZE || "10", 10);
  const pool = postgres(baseUrl, {
    max: poolSize,
    transform: { undefined: null },
    types: PG_TEXT_DATE_TYPES,
    idle_timeout: pgIdleTimeout(),
    keep_alive: 10,
    max_lifetime: 3600,
    connection: pgConnectionParameters({
      application_name: `tenant_${tenantId}`,
    }),
  });

  ctx.tenantPools.set(tenantId, pool);
  logger.debug(`Created dedicated connection pool for tenant "${tenantId}" (max: ${poolSize})`);
  return pool;
}

/**
 * Registers a dedicated database URL for a specific tenant.
 */
export function setPostgresTenantPool(
  ctx: PostgresTenantPoolContext,
  tenantId: string,
  connectionUrl: string,
): void {
  const existing = ctx.tenantPools.get(tenantId);
  if (existing) {
    ctx.tenantPools.releaseExisting(tenantId);
  } else {
    const maxTenantPools = parseInt(process.env.MAX_TENANT_POOLS || "16", 10);
    ctx.tenantPools.evictOldestIdle(maxTenantPools);
  }

  const poolSize = parseInt(process.env.TENANT_DB_POOL_SIZE || "10", 10);
  const pool = postgres(connectionUrl, {
    max: poolSize,
    transform: { undefined: null },
    types: PG_TEXT_DATE_TYPES,
    idle_timeout: pgIdleTimeout(),
    keep_alive: 10,
    max_lifetime: 3600,
    connection: pgConnectionParameters({
      application_name: `tenant_${tenantId}`,
    }),
  });

  ctx.tenantPools.set(tenantId, pool);
  ctx.tenantPools.markDedicated(tenantId);
  logger.info(`Configured dedicated connection pool for tenant "${tenantId}" (max: ${poolSize})`);
}
