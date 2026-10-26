/**
 * @file src/routes/api/[...path]/handlers/testing.ts
 * @description State-management dispatcher for integration testing (Reset, Seed, Reinitialize).
 * Routes actions to the split handler modules in `./testing/`.
 */

import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger";
import type { RequestEvent } from "@sveltejs/kit";
import type { DatabaseId } from "@src/databases/db-interface";
import { loadDbModule, rawResponse, type TestingContext } from "./testing/testing-shared";
import { handleTestingResetRoutes } from "./testing/testing-reset";
import { handleTestingSeedRoutes } from "./testing/testing-seed";
import { handleTestingAuthSessionRoutes } from "./testing/testing-auth-session";
import { handleTestingUserGdprRoutes } from "./testing/testing-users-gdpr";
import { handleTestingConfigSeedRoutes } from "./testing/testing-config-seeds";
import { handleTestingTrashInviteMediaRoutes } from "./testing/testing-trash-invite-media";
import { handleTestingPluginOutboxRoutes } from "./testing/testing-plugin-outbox";
import { handleTestingEgressRoutes } from "./testing/testing-egress";

/**
 * MASTER TESTING HANDLER
 * Provides seed/reset helpers for E2E and integration runners.
 *
 * 🛡️ SECURITY (fail-closed — same bar as test-bypass.server):
 * - Disabled when NODE_ENV=production (hard 403)
 * - Requires explicit TEST_MODE / PLAYWRIGHT / BENCHMARK flag (not bare NODE_ENV=test)
 * - Requires matching x-test-secret (timing-safe)
 * - Production builds strip this module via testBackdoorStripperPlugin + verify-prod-build-backdoor
 *
 * Seed actions (seed-webhook, seed-automation, enable-plugin, etc.) inherit this gate —
 * they are NOT available as unauthenticated or production backdoors.
 */
export async function handleTestingRoutes(
  event: RequestEvent,
  cms: any,
  tenantId: DatabaseId,
  _segments: string[],
) {
  const { assertTestingApiAllowed } = await import("@utils/test-bypass.server");
  const gate = assertTestingApiAllowed(event.request);
  if (!gate.allowed) {
    throw new AppError(gate.message, gate.status, gate.code);
  }

  const runtimeEnv = (globalThis as typeof globalThis & { process?: NodeJS.Process }).process?.env;

  if (runtimeEnv?.BENCHMARK_DEBUG === "true") {
    process.stderr.write(
      `🚀 handleTestingRoutes ENTERED: ${event.url.searchParams.get("action")}\n`,
    );
  }
  const { request } = event;
  try {
    const params = await request.json().catch(() => ({}));
    const action = params.action || event.url.searchParams.get("action");

    // Suppress action logging in benchmark mode unless BENCHMARK_DEBUG is set
    const isBenchSuite =
      runtimeEnv?.SVELTY_BENCHMARK_SUITE === "true" || runtimeEnv?.BENCHMARK === "true";
    if (
      (runtimeEnv?.TEST_MODE === "true" || runtimeEnv?.BENCHMARK_DEBUG === "true") &&
      !isBenchSuite
    ) {
      process.stderr.write(
        `[TestingHandler] action: ${action}, collectionId: ${params.collectionId || "N/A"}, tenant: ${tenantId}\n`,
      );
    }
    if (process.env.BENCHMARK_DEBUG === "true") {
      process.stderr.write(`[TestingHandler] Params: ${JSON.stringify(params)}\n`);
    }

    // 🚀 HARDENING: Wait for database to be ready
    const { isDbConnected, getDbInitPromise, getDb } = await loadDbModule();
    if (!isDbConnected()) {
      logger.debug("[testing] DB not connected, waiting for initialization...");
      await getDbInitPromise().catch((err) => {
        logger.error("[testing] getDbInitPromise failed:", err);
      });

      // Secondary poll for safety
      let retries = 15; // Increased for Windows/Slow DBs
      while (!isDbConnected() && retries-- > 0) {
        logger.debug(`[testing] Polling for DB connection... (${15 - retries}/15)`);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    const initializedAdapter = getDb();
    if (!initializedAdapter || !isDbConnected()) {
      const adapterStatus = initializedAdapter ? "exists" : "null";
      const connectedStatus = isDbConnected() ? "true" : "false";
      logger.error(`[testing] 503 ERROR: adapter=${adapterStatus}, isConnected=${connectedStatus}`);
      throw new AppError(
        `Database connection not established. adapter=${adapterStatus}, isConnected=${connectedStatus}`,
        503,
      );
    }

    const ctx: TestingContext = {
      event,
      cms,
      tenantId,
      params,
      initializedAdapter,
      action,
    };

    const handlers = [
      handleTestingResetRoutes,
      handleTestingSeedRoutes,
      handleTestingAuthSessionRoutes,
      handleTestingUserGdprRoutes,
      handleTestingConfigSeedRoutes,
      handleTestingTrashInviteMediaRoutes,
      handleTestingPluginOutboxRoutes,
      handleTestingEgressRoutes,
    ];

    for (const handler of handlers) {
      const response = await handler(ctx);
      if (response) return response;
    }

    throw new AppError(`Unknown action: ${action}`, 400);
  } catch (err: any) {
    if (err instanceof AppError) {
      return rawResponse({ success: false, message: err.message, code: err.code }, err.status);
    }

    logger.error("[TestingHandler] Error:", err);
    return rawResponse(
      {
        success: false,
        message: err.message || "Internal error in testing handler",
      },
      500,
    );
  }
}
