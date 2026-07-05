/**
 * @file src/hooks/handle-test-isolation.ts
 * @description Hardened multi-tenant test worker isolation with strict loopback boundaries and thread-safe context.
 */

import { testWorkerContext } from "@utils/test-worker-context";
import type { Handle } from "@sveltejs/kit";
import { logger } from "@utils/logger";
import { getRequestFlags } from "@utils/hook-utils";

export const handleTestIsolation: Handle = async ({ event, resolve }) => {
  if (process.env.TEST_MODE !== "true") return resolve(event);

  const { request, url, locals } = event;
  const pathname = url.pathname;

  // Short-circuit for static assets to speed up Playwright runs
  const flags = getRequestFlags(locals as any);
  if (flags.isStatic || pathname.includes(".")) return resolve(event);

  const workerIndex = request.headers.get("x-test-worker-index");
  const testSecret = request.headers.get("x-test-secret");

  if (workerIndex) {
    let clientAddress = "";
    try {
      clientAddress = event.getClientAddress?.() || "";
    } catch {
      clientAddress = "";
    }

    // Strict physical network address check — never trust Host header
    const isLocal =
      clientAddress === "127.0.0.1" ||
      clientAddress === "::1" ||
      clientAddress === "::ffff:127.0.0.1";

    const masterSecret = process.env.TEST_API_SECRET;
    const isSecretValid = !!(masterSecret && testSecret === masterSecret);

    if (!isLocal || !isSecretValid) {
      logger.warn(
        `[Security] Blocked unauthorized test-worker context attempt from ${clientAddress || "unresolved"}`,
      );
      return resolve(event);
    }

    // Wrap DB orchestration inside AsyncLocalStorage to prevent cross-worker state mutations
    return testWorkerContext.run(workerIndex, async () => {
      try {
        const { dbAdapter } = await import("@src/databases/db");
        if (dbAdapter && (dbAdapter as any).initWorkerConnection) {
          await (dbAdapter as any).initWorkerConnection(workerIndex);
        }
      } catch (err: any) {
        logger.debug(`[TestIsolation] Failed to init worker ${workerIndex}: ${err.message}`);
      }
      return await resolve(event);
    });
  }

  return resolve(event);
};
