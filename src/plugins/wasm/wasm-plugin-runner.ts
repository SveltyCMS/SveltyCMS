/**
 * @file src/plugins/wasm/wasm-plugin-runner.ts
 * @description Central manager and hook dispatcher for active WebAssembly plugin pools.
 *
 * Features:
 * - Registration and lifecycle orchestration of 3rd-party WASM pools
 * - Direct routing of collection lifecycle hooks (beforeSave, afterSave, etc.)
 * - Aggregated metrics across all pools for health checks and performance monitoring
 * - Zero-allocation fast bail when no WASM plugins are registered
 */

import { logger } from "@utils/logger";
import { WasmPluginPool } from "./wasm-plugin-pool";
import type {
  WasmCapability,
  WasmGlobalMetrics,
  WasmHookExecutionResult,
  WasmHostContext,
  WasmPluginManifest,
  WasmPoolMetrics,
} from "./types";

/** Maximum total linear memory in bytes across all pooled instances (128 MB) */
export const MAX_GLOBAL_WASM_MEMORY_BYTES = 128 * 1024 * 1024;

/** Maximum total instances allowed to exist across all WASM pools */
export const MAX_GLOBAL_WASM_INSTANCES = 64;

const VALID_CAPABILITIES: ReadonlySet<WasmCapability> = new Set([
  "db:read",
  "db:write:own",
  "network:egress",
  "crypto:hash",
]);

export class WasmPluginRunner {
  private readonly pools: Map<string, WasmPluginPool> = new Map();

  /**
   * Returns total allocated memory across all active WASM pools (bytes).
   */
  getTotalMemoryBytes(): number {
    let total = 0;
    for (const pool of this.pools.values()) {
      total += pool.getAllocatedMemoryBytes();
    }
    return total;
  }

  /**
   * Returns total instance count across all active pools.
   */
  getTotalInstanceCount(): number {
    let count = 0;
    for (const pool of this.pools.values()) {
      count += pool.getMetrics().poolSize;
    }
    return count;
  }

  /**
   * Registers a 3rd-party plugin into the WASM tier and pre-warms its instance pool.
   * Validates capabilities and enforces global instance and memory ceilings.
   */
  async registerWasmPlugin(
    manifest: WasmPluginManifest,
    wasmBytes: Buffer | Uint8Array,
  ): Promise<void> {
    // 1. Validate capability declarations
    if (Array.isArray(manifest.capabilities)) {
      for (const cap of manifest.capabilities) {
        if (!VALID_CAPABILITIES.has(cap)) {
          throw new Error(
            `[WasmRunner:${manifest.id}] Undeclared or invalid capability "${cap}". Valid capabilities: ${Array.from(VALID_CAPABILITIES).join(", ")}`,
          );
        }
      }
    }

    // 2. Enforce global capacity ceilings
    const requestedPoolSize = manifest.poolSize || 2;
    const requestedMaxPages = manifest.maxMemoryPages || 16;
    const projectedBytes = requestedPoolSize * requestedMaxPages * 64 * 1024;

    if (this.getTotalInstanceCount() + requestedPoolSize > MAX_GLOBAL_WASM_INSTANCES) {
      throw new Error(
        `[WasmRunner:${manifest.id}] Cannot register plugin: global WASM instance ceiling (${MAX_GLOBAL_WASM_INSTANCES}) exceeded`,
      );
    }

    if (this.getTotalMemoryBytes() + projectedBytes > MAX_GLOBAL_WASM_MEMORY_BYTES) {
      throw new Error(
        `[WasmRunner:${manifest.id}] Cannot register plugin: global WASM memory ceiling (${MAX_GLOBAL_WASM_MEMORY_BYTES / 1024 / 1024}MB) exceeded`,
      );
    }

    if (this.pools.has(manifest.id)) {
      logger.warn(`[WasmRunner] Overwriting existing pool for plugin "${manifest.id}"`);
      this.unregisterWasmPlugin(manifest.id);
    }

    const pool = new WasmPluginPool(manifest, wasmBytes);
    await pool.initialize();
    this.pools.set(manifest.id, pool);
  }

  /**
   * Unregisters and destroys a WASM plugin pool.
   */
  unregisterWasmPlugin(pluginId: string): boolean {
    const pool = this.pools.get(pluginId);
    if (!pool) return false;
    pool.destroy();
    this.pools.delete(pluginId);
    logger.info(`[WasmRunner] Unregistered WASM pool for plugin "${pluginId}"`);
    return true;
  }

  /**
   * Fast check if a plugin executes in the WASM tier.
   */
  isWasmPlugin(pluginId: string): boolean {
    return this.pools.has(pluginId);
  }

  /**
   * Executes a lifecycle hook on a WASM plugin.
   */
  async executeHook<TIn = unknown, TOut = unknown>(
    pluginId: string,
    hookName: string,
    payload: TIn,
    context: WasmHostContext,
  ): Promise<WasmHookExecutionResult<TOut>> {
    const pool = this.pools.get(pluginId);
    if (!pool) {
      return {
        success: true,
        data: payload as unknown as TOut,
        durationMs: 0,
        queryCount: 0,
      };
    }

    return pool.executeHook<TIn, TOut>(hookName, payload, context);
  }

  /**
   * Returns telemetry metrics across all active WASM pools.
   */
  getAllMetrics(): WasmPoolMetrics[] {
    const metrics: WasmPoolMetrics[] = [];
    for (const pool of this.pools.values()) {
      metrics.push(pool.getMetrics());
    }
    return metrics;
  }

  /**
   * Returns high-level global metrics for all WASM execution across the system.
   */
  getGlobalMetrics(): WasmGlobalMetrics {
    const poolMetrics = this.getAllMetrics();
    const totalInstances = poolMetrics.reduce((sum, m) => sum + m.poolSize, 0);
    const activeInstances = poolMetrics.reduce((sum, m) => sum + m.activeInstances, 0);
    const idleInstances = poolMetrics.reduce((sum, m) => sum + m.idleInstances, 0);
    const totalAllocated = poolMetrics.reduce((sum, m) => sum + m.allocatedMemoryBytes, 0);

    return {
      totalPools: this.pools.size,
      totalInstances,
      activeInstances,
      idleInstances,
      totalAllocatedMemoryBytes: totalAllocated,
      maxMemoryCeilingBytes: MAX_GLOBAL_WASM_MEMORY_BYTES,
      maxGlobalInstances: MAX_GLOBAL_WASM_INSTANCES,
    };
  }

  /**
   * Cleanly destroys all active pools (used during shutdown or test reset).
   */
  destroyAll(): void {
    for (const pool of this.pools.values()) {
      pool.destroy();
    }
    this.pools.clear();
  }
}

export const wasmPluginRunner = new WasmPluginRunner();
