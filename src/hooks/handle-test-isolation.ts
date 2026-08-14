/**
 * @file src/hooks/handle-test-isolation.ts
 * @description
 * Hardened multi-tenant test worker isolation with strict loopback boundaries and thread-safe context.
 *
 * ### Security:
 * - Only accepts `x-test-worker-index` from loopback addresses via getClientAddress
 * - Requires matching `x-test-secret` / TEST_API_SECRET (env or tests/e2e/.auth/test-secret.txt)
 * - Never trusts Host header for isolation decisions
 * - Missing secret fails closed (no file fallback grants access)
 *
 * ### Features:
 * - disk-backed master-secret fallback with single fs read per process
 * - in-flight worker init coalescing (one DB init per worker index)
 */

import { testWorkerContext } from "@utils/test-worker-context";
import type { Handle } from "@sveltejs/kit/hooks";
import { logger } from "@utils/logger";
import { getRequestFlags } from "@utils/hook-utils";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Resolved once per process: env first, then the shared E2E secret file
// (tests/e2e/.auth/test-secret.txt) written by scripts/run-e2e.ts. Env changes
// between tests are not a supported scenario, so the result is cached.
let cachedMasterSecret: string | null | undefined;

function resolveMasterSecret(): string | null {
  if (cachedMasterSecret !== undefined) return cachedMasterSecret;
  if (process.env.TEST_API_SECRET) {
    cachedMasterSecret = process.env.TEST_API_SECRET;
    return cachedMasterSecret;
  }
  try {
    const secretPath = join(process.cwd(), "tests", "e2e", ".auth", "test-secret.txt");
    if (existsSync(secretPath)) {
      const fromFile = readFileSync(secretPath, "utf8").trim();
      if (fromFile) {
        cachedMasterSecret = fromFile;
        return cachedMasterSecret;
      }
    }
  } catch {
    // Unreadable file → fall through; a null secret never validates (fail closed).
  }
  cachedMasterSecret = null;
  return cachedMasterSecret;
}

// Coalesces concurrent init requests for the same fresh worker index so
// parallel first requests do not race initWorkerConnection.
const inflightWorkerInits = new Map<string, Promise<void>>();

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
    // Validate numeric format before use — malformed values must not reach DB init.
    if (!/^\d+$/.test(workerIndex)) {
      logger.warn(`[TestIsolation] Invalid worker index format: ${workerIndex}`);
      return resolve(event); // Proceed without isolation
    }

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

    const masterSecret = resolveMasterSecret();
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
          let initPromise = inflightWorkerInits.get(workerIndex);
          if (!initPromise) {
            // ⏱️ Timeout guard: a hung DB connection must not hang the request.
            initPromise = Promise.race([
              (dbAdapter as any).initWorkerConnection(workerIndex),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error("initWorkerConnection timeout (10s)")), 10_000),
              ),
            ]).finally(() => inflightWorkerInits.delete(workerIndex));
            inflightWorkerInits.set(workerIndex, initPromise);
          }
          await initPromise;
        }
      } catch (err: any) {
        // 🚨 FAIL-CLOSED: without worker isolation, concurrent test workers could
        // mutate shared DB state. Reject the request instead of running bare.
        logger.error(`[TestIsolation] Failed to init worker ${workerIndex}: ${err.message}`);
        return new Response(
          JSON.stringify({ error: "Test worker isolation failed", worker: workerIndex }),
          {
            status: 503,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      return await resolve(event);
    });
  }

  return resolve(event);
};
