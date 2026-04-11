/**
 * @file src/hooks/handle-test-isolation.ts
 * @description Secure hook for test-worker context isolation.
 * TRIPLE-LOCK SECURITY:
 * 1. Only runs if TEST_MODE is active.
 * 2. Only allows requests from localhost (127.0.0.1).
 * 3. Requires a cryptographically secure x-test-secret header.
 */

import { testWorkerContext } from "@utils/test-worker-context";
import type { Handle } from "@sveltejs/kit";
import { logger } from "@utils/logger.server";

export const handleTestIsolation: Handle = async ({ event, resolve }) => {
  // LOCK 1: Environment Guard
  if (process.env.TEST_MODE !== "true") {
    return resolve(event);
  }

  const { request, url } = event;
  const workerIndex = request.headers.get("x-test-worker-index");
  const testSecret = request.headers.get("x-test-secret");
  const clientAddress = event.getClientAddress?.() || "";

  if (workerIndex) {
    // LOCK 2: Network Guard (Localhost only)
    const isLocal =
      clientAddress === "127.0.0.1" ||
      clientAddress === "::1" ||
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1";

    // LOCK 3: Cryptographic Guard
    const masterSecret = process.env.TEST_API_SECRET;
    const isSecretValid = masterSecret && testSecret === masterSecret;

    if (!isLocal || !isSecretValid) {
      logger.warn(
        `[SECURITY] Blocked unauthorized attempt to use test-worker context from ${clientAddress}`,
      );
      // Silently ignore the worker index rather than leaking that the feature exists
      return resolve(event);
    }

    // Valid test request - initialize isolation
    try {
      const { dbAdapter } = await import("@src/databases/db");
      if (dbAdapter && (dbAdapter as any).initWorkerConnection) {
        await (dbAdapter as any).initWorkerConnection(workerIndex);
      }
    } catch (err) {
      logger.error(`[TestIsolation] Failed to initialize worker ${workerIndex}:`, err);
    }

    return testWorkerContext.run(workerIndex, () => resolve(event));
  }

  return resolve(event);
};
