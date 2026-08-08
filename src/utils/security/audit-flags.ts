/**
 * @file src/utils/security/audit-flags.ts
 * @description
 * Memoized runtime resolution of audit pipeline flags (DISABLE_AUDIT_LOGS,
 * AUDIT_CHAIN_SYNC) with a short TTL.
 *
 * The settings are stored in the database (System Settings UI) but the audit
 * pipeline previously read only boot-time `process.env` values, making the UI
 * toggles no-ops. This module resolves env-first (fast benchmark/test path),
 * then falls back to the DB-driven setting via the settings cache, memoized
 * for AUDIT_FLAGS_TTL_MS so the hot request path stays allocation-free.
 *
 * ### Features:
 * - env var fast path (zero async, zero DB)
 * - DB-driven fallback for enterprise UI toggles
 * - short-TTL memoization to keep per-request cost at a Map lookup
 */

import { logger } from "@utils/logger";

const AUDIT_FLAGS_TTL_MS = 5_000;

interface AuditFlags {
  disabled: boolean;
  chainSync: boolean;
}

let cached: AuditFlags | null = null;
let cachedAt = 0;
let inflight: Promise<AuditFlags> | null = null;

function envFlags(): AuditFlags | null {
  const envDisable = process.env.DISABLE_AUDIT_LOGS;
  const envSync = process.env.AUDIT_CHAIN_SYNC;
  if (envDisable === undefined && envSync === undefined) return null;
  return {
    disabled: envDisable === "true",
    chainSync: envSync === "true",
  };
}

async function loadDbFlags(): Promise<AuditFlags> {
  try {
    const { getPublicSetting } = await import("@src/services/core/settings-service");
    const [disableLogs, chainSync] = await Promise.all([
      getPublicSetting("DISABLE_AUDIT_LOGS", "global").catch(() => null),
      getPublicSetting("AUDIT_CHAIN_SYNC", "global").catch(() => null),
    ]);
    return {
      disabled: disableLogs === true,
      chainSync: chainSync === true,
    };
  } catch (err) {
    logger.debug("[AuditFlags] DB settings unavailable, defaulting to env", err);
    return { disabled: false, chainSync: false };
  }
}

/**
 * Resolve the effective audit flags. Env vars win (benchmark/test fast path);
 * otherwise the DB-driven settings are used, memoized for AUDIT_FLAGS_TTL_MS.
 */
export async function getAuditFlags(): Promise<AuditFlags> {
  const env = envFlags();
  if (env) return env;

  const now = Date.now();
  if (cached && now - cachedAt < AUDIT_FLAGS_TTL_MS) return cached;
  if (inflight) return inflight;

  inflight = loadDbFlags()
    .then((flags) => {
      cached = flags;
      cachedAt = Date.now();
      return flags;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/**
 * Synchronous fast path for hot request loops: returns the memoized DB flags
 * when fresh, or the env fast-path result, or null when a DB load is needed.
 */
export function getAuditFlagsSync(): AuditFlags | null {
  const env = envFlags();
  if (env) return env;
  if (cached && Date.now() - cachedAt < AUDIT_FLAGS_TTL_MS) return cached;
  return null;
}

/** Synchronous fast check — true only when env flags are present and disabling. */
export function isAuditDisabledByEnv(): boolean {
  return process.env.DISABLE_AUDIT_LOGS === "true";
}

/** Test helper — reset the memoized cache. */
export function resetAuditFlagsCache(): void {
  cached = null;
  cachedAt = 0;
  inflight = null;
}
