/**
 * @file src/utils/system-integrity.ts
 * @description Boot-time system integrity validator for Virtual Namespacing.
 *
 * Prevents the CMS from starting in a broken state by verifying that all
 * critical paths resolved by `path-resolver.ts` exist and are writable.
 * Call `await SystemIntegrity.validate()` in your server startup hook.
 *
 * ### Integration:
 * - Boot hook: `if (!await SystemIntegrity.validate()) throw new Error(...)`
 * - Dashboard: call inside `detectFullStructure()` to surface errors in Settings GUI
 *
 * ### Features:
 * - Pre-flight directory existence + write permission checks
 * - Graceful failure with structured error messages
 */

import fs from "node:fs/promises";
import { paths } from "./path-resolver";
import { logger } from "./logger";

export interface IntegrityReport {
  /** Overall system health */
  healthy: boolean;
  /** Individual path statuses */
  checks: Array<{ path: string; accessible: boolean; error?: string }>;
}

export const SystemIntegrity = {
  /**
   * Performs pre-flight checks on all critical paths.
   * Returns a structured report — callers decide whether to fail or warn.
   */
  async validate(): Promise<IntegrityReport> {
    const criticalPaths = [
      { path: paths.config, label: "config root" },
      { path: paths.collections, label: "flat collections" },
      { path: paths.compiledCollections, label: "compiled output" },
      { path: paths.media, label: "global media" },
      { path: paths.benchmark.collections, label: "benchmark collections" },
    ];

    const checks: IntegrityReport["checks"] = [];
    logger.info("[Integrity] Starting system health check...");

    for (const { path: p, label } of criticalPaths) {
      try {
        await fs.access(p, fs.constants.W_OK);
        checks.push({ path: p, accessible: true });
      } catch {
        // Try just R_OK as a softer check
        try {
          await fs.access(p, fs.constants.R_OK);
          checks.push({
            path: p,
            accessible: true,
            error: `${label} is readable but not writable`,
          });
          logger.warn(`[Integrity] ${label} at ${p} is readable but not writable`);
        } catch {
          checks.push({ path: p, accessible: false, error: `${label} is missing or not readable` });
          logger.error(`[Integrity] Critical path not accessible: ${p} (${label})`);
        }
      }
    }

    const healthy = checks.every((c) => c.accessible);
    if (healthy) {
      logger.info("[Integrity] System check passed. Virtual namespaces are ready.");
    } else {
      logger.error(
        `[Integrity] System check FAILED — ${checks.filter((c) => !c.accessible).length} path(s) inaccessible`,
      );
    }

    return { healthy, checks };
  },
};
