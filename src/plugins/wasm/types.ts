/**
 * @file src/plugins/wasm/types.ts
 * @description Strongly-typed contracts for the SveltyCMS WebAssembly Micro-Sandbox tier.
 *
 * Features:
 * - Host ABI function contracts and error codes
 * - Pre-warmed WASM instance pool configuration and state
 * - Telemetry metrics for execution latency, pool saturation, and error rates
 * - Memory bounds and capability descriptors
 */

import type { IDBAdapter } from "@databases/db-interface";
import type { Schema } from "@src/content/types";
import type { User } from "@src/databases/auth/types";

/**
 * Standard ABI error codes returned to WASM guests via host calls.
 */
export const WasmErrorCode = {
  OK: 0,
  ERR_GENERIC: -1,
  ERR_PERMISSION_DENIED: -2,
  ERR_PROTECTED_COLLECTION: -3,
  ERR_QUERY_LIMIT_EXCEEDED: -4,
  ERR_BUFFER_TOO_SMALL: -5,
  ERR_INVALID_JSON: -6,
  ERR_TIMEOUT: -7,
  ERR_SSRF_BLOCKED: -8,
  ERR_NOT_FOUND: -9,
} as const;

export type WasmErrorCode = (typeof WasmErrorCode)[keyof typeof WasmErrorCode];

/**
 * Log levels accepted by `host_log`.
 */
export const WasmLogLevel = {
  TRACE: 0,
  DEBUG: 1,
  INFO: 2,
  WARN: 3,
  ERROR: 4,
} as const;

export type WasmLogLevel = (typeof WasmLogLevel)[keyof typeof WasmLogLevel];

/**
 * Capabilities declared in a 3rd-party plugin manifest.
 */
export type WasmCapability = "db:read" | "db:write:own" | "network:egress" | "crypto:hash";

/**
 * Failure policy when a WASM lifecycle hook traps, faults, or times out.
 * - `fail-open`: log warning and allow the write/pipeline to proceed with original payload (recommended for afterSave/audit).
 * - `fail-closed`: abort the mutation immediately with an error (recommended for beforeSave/validation).
 */
export type WasmHookFailurePolicy = "fail-open" | "fail-closed";

/**
 * Metadata specifically for WASM-packaged plugins.
 */
export interface WasmPluginManifest {
  /** Unique plugin identifier (e.g. 'custom-slug-generator') */
  id: string;
  name: string;
  version: string;
  /** Granted capabilities */
  capabilities: WasmCapability[];
  /** Execution timeout for synchronous lifecycle hooks (ms). Defaults to 50ms. */
  timeoutMs?: number;
  /** Maximum linear memory in WebAssembly pages (64KB per page). Defaults to 16 pages (1MB). */
  maxMemoryPages?: number;
  /** Initial pool size (number of pre-warmed instances). Defaults to 2. */
  poolSize?: number;
  /**
   * Default failure policy when any hook times out or traps.
   * If not specified, `beforeSave` defaults to `fail-closed` while others default to `fail-open`.
   */
  defaultFailurePolicy?: WasmHookFailurePolicy;
  /**
   * Granular per-hook failure policy overrides.
   */
  hookFailurePolicies?: Partial<Record<string, WasmHookFailurePolicy>>;
}

/**
 * Per-call execution context passed to host functions.
 */
export interface WasmHostContext {
  pluginId: string;
  tenantId: string;
  user: User;
  dbAdapter: IDBAdapter;
  collectionSchema?: Schema;
  pluginConfig: Record<string, unknown>;
  capabilities: Set<WasmCapability>;
  stats: {
    queryCount: number;
    bytesWritten: number;
    startTimeMs: number;
  };
}

/**
 * Telemetry and observability metrics collected for an individual WASM pool.
 */
export interface WasmPoolMetrics {
  pluginId: string;
  poolSize: number;
  activeInstances: number;
  idleInstances: number;
  allocatedMemoryBytes: number;
  invocationsTotal: number;
  invocationsFailed: number;
  timeoutsTotal: number;
  saturationQueueLength: number;
  avgExecutionTimeMs: number;
  p95ExecutionTimeMs: number;
  lastExecutionTimeMs: number;
  totalQueriesExecuted: number;
}

/**
 * Global observability metrics aggregated across all active WASM plugin pools.
 */
export interface WasmGlobalMetrics {
  totalPools: number;
  totalInstances: number;
  activeInstances: number;
  idleInstances: number;
  totalAllocatedMemoryBytes: number;
  maxMemoryCeilingBytes: number;
  maxGlobalInstances: number;
}

/**
 * Result of a lifecycle hook execution.
 */
export interface WasmHookExecutionResult<T = unknown> {
  success: boolean;
  data: T;
  durationMs: number;
  queryCount: number;
  error?: string;
  timedOut?: boolean;
}
