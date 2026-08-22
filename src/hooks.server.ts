/**
 * @file src/hooks.server.ts
 * @description Hook middleware pipeline with unified metrics and automated security response
 *
 * This file orchestrates a streamlined sequence of middleware to handle
 * all incoming server requests. The architecture emphasizes security, observability,
 * and performance with unified metrics collection and automated threat detection.
 *
 * Updated 2026-03-15:
 * - Moved addSecurityHeaders to TOP of sequence → ensures headers on ALL responses,
 *   including errors thrown by earlier middlewares (rate-limit 429, firewall blocks, etc.)
 */

import { metricsService } from "@src/services/observability/metrics-service";
import { sequence, type Handle, type HandleServerError } from "@sveltejs/kit/hooks";
import { isRedirect } from "@sveltejs/kit";
import { logger } from "@utils/logger";
// 🔐 ENTERPRISE: chained audit file sink (logs/app.log) — activates once per boot.
import "@utils/logger.server";
import { building } from "$app/env";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import os from "node:os";
import { runWithContext, runWithTrace, getTrace, traceSpan } from "@utils/context";
import { createRequire } from "node:module";

// 🚀 SK3: background services are STATICALLY imported (they start on READY).
// Dynamic import() of these modules left Rolldown's cyclic-chunk initializers
// un-run in the production build (named exports stayed undefined forever —
// automationService.init() crashed the boot). Static imports participate in
// the kit runtime's chunk graph, which initializes them correctly.
import { jobQueue } from "@src/services/background/jobs/job-queue-service";
import { automationService } from "@src/services/background/automation";
import { watchdog } from "@src/services/system/watchdog";
import { telemetryService } from "@src/services/observability/telemetry-service";
import { startScheduler } from "@src/services/scheduler";
import { startBehavioralEngine } from "@src/services/intelligence/behavioral-learner";
import { outboxService } from "@src/services/outbox";
// ESM Shims for legacy CJS compatibility in production build
if (typeof (globalThis as any).require === "undefined") {
  (globalThis as any).require = createRequire(import.meta.url);
}
if (typeof (globalThis as any).__filename === "undefined") {
  (globalThis as any).__filename = fileURLToPath(import.meta.url);
}
if (typeof (globalThis as any).__dirname === "undefined") {
  (globalThis as any).__dirname = dirname((globalThis as any).__filename);
}

import { isSetupComplete } from "./utils/setup-check-fast";
import { classifyRequest, RequestLane } from "./hooks/request-classifier";
import { resetIdCounters } from "@utils/id-generator";
import { handleApiError } from "@utils/error-handling";
import { handleTurboPipeline } from "./hooks/handle-turbo-pipeline.server";
import { handleTurboGet, turboAuthCache } from "./hooks/handle-turbo-get";
import { handleCompression } from "./hooks/handle-compression";
import { applyAllSecurityHeaders } from "./hooks/handle-security-headers";
import { registerWsAuthenticator } from "@src/services/collaboration/ws-auth-registry";
import { routeResourceStateMachine } from "@src/services/core/route-resource-state-machine";

// 🔐 /ws COLLABORATION AUTH: the standalone yjs-sync-server bundle cannot import
// app internals, so it consults this registry (globalThis bridge) at upgrade
// time. Reuses hooks.ws `upgrade()` — the same session pipeline as HTTP
// (LRU→store→Redis→DB, negative cache, test-mode bypass). Fail-closed: a
// missing/failing authenticator rejects the upgrade.
registerWsAuthenticator(async (request) => {
  try {
    const { upgrade } = await import("./hooks.ws");
    const result = await upgrade({
      url: request.url,
      headers: request.headers,
      req: { headers: request.headers },
    });
    if (!result) return null;
    return { userId: String(result.profile._id), tenantId: result.tenantId };
  } catch (err) {
    logger.warn("[WsAuth] Authenticator failed — rejecting upgrade:", err);
    return null;
  }
});

// 🚀 ZERO-RESTART ARCHITECTURE:
// We track the setup state dynamically to allow the system to switch from
// 'SETUP' mode to 'READY' mode without a full process restart.
let setupComplete =
  (typeof (globalThis as any).__SVELTY_SETUP_COMPLETE__ !== "undefined" &&
    (globalThis as any).__SVELTY_SETUP_COMPLETE__ === true) ||
  isSetupComplete();

// 🚀 SETUP-STATE MEMO: isSetupComplete() performs a sync fs probe
// (existsSync + readFileSync) with only a ~2s internal TTL — bursty admin
// traffic pays one disk hit per burst. Memoize for 60s; setup paths always
// bypass the memo so wizard/API transitions are observed immediately.
let setupCheckMemo: { value: boolean; at: number } | null = null;
const SETUP_CHECK_MEMO_TTL_MS = 60_000;

function currentSetupStateWithMemo(pathname: string): boolean {
  // Setup paths AND the testing API bypass the memo: the wizard writes the
  // config and the testing reset/seed flips the DB-backed setup state, so the
  // memoized value would otherwise be stale for up to 60s after those flows
  // (observed: E2E golden journeys ran the setup pipeline — no authorization,
  // no locals.roles — right after a reset while the memo still cached false).
  if (
    pathname.startsWith("/setup") ||
    pathname.startsWith("/api/setup") ||
    pathname.startsWith("/api/testing")
  ) {
    const v = isSetupComplete();
    setupCheckMemo = { value: v, at: Date.now() };
    return v;
  }
  const now = Date.now();
  if (setupCheckMemo && now - setupCheckMemo.at < SETUP_CHECK_MEMO_TTL_MS) {
    return setupCheckMemo.value;
  }
  const v = isSetupComplete();
  setupCheckMemo = { value: v, at: now };
  return v;
}

// ✨ ENTERPRISE: Stable Node ID for Distributed Cache Sync (Phase 8)
if (typeof (globalThis as any).__SVELTY_NODE_ID__ === "undefined") {
  (globalThis as any).__SVELTY_NODE_ID__ = crypto.randomUUID();
}

// Only import full CMS hooks if setup is complete to avoid premature DB load
const passThrough: Handle = ({ event, resolve }) => resolve(event);

let handleSecurity: Handle = passThrough,
  handleRateLimit: Handle = passThrough,
  handleUserPreferences: Handle = passThrough,
  handleAuthentication: Handle = passThrough,
  handleAuthorization: Handle = passThrough,
  handleLocalSdk: Handle = passThrough,
  handleContentInitialization: Handle = passThrough,
  handleApiRequests: Handle = passThrough,
  handleAuditLogging: Handle = passThrough,
  handleTokenResolution: Handle = passThrough,
  handleRedirects: Handle = passThrough,
  handleSystemState: Handle = passThrough,
  handleTestIsolation: Handle = passThrough,
  handleAeoHeaders: Handle = passThrough;

// ✨ ENTERPRISE: Lazy-loaded handle variables for dynamic mode switching
let fullMiddlewareInitialized = false;

async function ensureFullMiddleware() {
  if (fullMiddlewareInitialized) return;

  // 🚀 PARALLEL LOADING: imports are independent — sequential awaits serialized
  // hot-swap latency when setup completes (~80% faster than 15 chained awaits).
  const [
    security,
    rateLimit,
    preferences,
    auth,
    authz,
    sdk,
    content,
    api,
    audit,
    token,
    redirects,
    state,
    isolation,
    aeo,
  ] = await Promise.all([
    import("./hooks/handle-security"),
    import("./hooks/handle-rate-limit"),
    import("./hooks/handle-user-preferences"),
    import("./hooks/handle-authentication"),
    import("./hooks/handle-authorization"),
    import("./hooks/handle-local-sdk"),
    import("./hooks/handle-content-initialization"),
    import("./hooks/handle-api-requests"),
    import("./hooks/handle-audit-logging"),
    import("./hooks/handle-token-resolution"),
    import("./hooks/handle-redirects"),
    import("./hooks/handle-system-state"),
    import("./hooks/handle-test-isolation"),
    import("./hooks/handle-aeo-headers"),
  ]);

  handleSecurity = security.handleSecurity;
  handleRateLimit = rateLimit.handleRateLimit;
  handleUserPreferences = preferences.handleUserPreferences;
  handleAuthentication = auth.handleAuthentication;
  handleAuthorization = authz.handleAuthorization;
  handleLocalSdk = sdk.handleLocalSdk;
  handleContentInitialization = content.handleContentInitialization;
  handleApiRequests = api.handleApiRequests;
  handleAuditLogging = audit.handleAuditLogging;
  handleTokenResolution = token.handleTokenResolution;
  handleRedirects = redirects.handleRedirects;
  handleSystemState = state.handleSystemState;
  handleTestIsolation = isolation.handleTestIsolation;
  handleAeoHeaders = aeo.handleAeoHeaders;

  fullMiddlewareInitialized = true;
  // 🛡️ Invalidate any pipeline cached before the real handlers were loaded:
  // a first request racing the async module load would otherwise be served
  // by passThrough handlers forever (security/authz permanently bypassed).
  cachedPipelineReady = null;
}

if (setupComplete) {
  ensureFullMiddleware().catch((err) => logger.error("Failed to lazy-load full middleware:", err));
}

const IS_QUIET = typeof process !== "undefined" && process.env.QUIET === "true";
const HEALTH_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

// --- Server Startup Logic ---
if (!building) {
  // ✨ NEW: Smart initialization logic that respects the system state machine
  // This ensures setup-wizard stays lean and non-critical services only start when needed.
  import("@src/stores/system/state.svelte.ts").then(({ overallState }) => {
    let isServicesInitialized = false;

    const unsubscribe = overallState.subscribe(async (state) => {
      const readyStates = ["READY", "WARMING", "WARMED", "DEGRADED"];
      if (readyStates.includes(state) && !isServicesInitialized) {
        isServicesInitialized = true;
        // ✨ Hardware Optimization (Enterprise)
        const cores = os.cpus().length;
        process.env.UV_THREADPOOL_SIZE = String(cores);
        import("sharp")
          .then((sharp) => {
            const physicalCores = Math.max(4, Math.floor(cores * 0.33));
            sharp.default.concurrency(physicalCores);
            logger.debug(
              `[System] Hardware optimized: ThreadPool=${cores} | SharpConcurrency=${physicalCores}`,
            );
          })
          .catch(() => {});

        // ✨ Parallel Service Initialization (Optimized for Cold Start)
        // 🧠 PRE-WARM heavy modules used lazily inside request hooks so the first
        // request never pays a dynamic-import stall:
        // - `graphql`            → handle-security's GraphQL complexity shield
        // - settings-service     → turbo-pipeline CORS preflight (getCorsHeadersInline)
        import("graphql")
          .catch(() => {})
          .then(() => import("@src/services/core/settings-service"))
          .catch(() => {});

        // 🚀 GRAPHQL PRE-WARM: build the Yoga schema once at boot
        // (registerCollections + createSchema JIT ≈ 20ms) so the first
        // GraphQL query never pays it. The schema cache is version-keyed
        // and rebuilt on content-structure changes — this only moves the
        // initial build off the request path.
        import("@src/routes/api/graphql/+server")
          .then(async ({ _getYogaApp }) => {
            const { getDb } = await import("@src/databases/db");
            const adapter = getDb();
            if (adapter && typeof adapter.isConnected === "function" && adapter.isConnected()) {
              await _getYogaApp(adapter, "global");
              logger.debug("[GraphQL] Schema pre-warmed at boot");
            }
          })
          .catch(() => {});

        // Background services always start — production parity. Benchmark
        // runs measure the same runtime a real deployment has (pollers,
        // watchdog, scheduler, outbox all contend for the event loop).
        // Background services always start — production parity. Benchmark
        // runs measure the same runtime a real deployment has (pollers,
        // watchdog, scheduler, outbox all contend for the event loop).
        {
          jobQueue.startPolling();
          automationService.init();
          watchdog.start();
          startScheduler();
          startBehavioralEngine();
          // Transactional outbox — deliver pending events (webhooks fan-out)
          outboxService.startPolling(5_000);

          // Telemetry check
          const globalWithTelemetry = globalThis as typeof globalThis & {
            __SVELTY_TELEMETRY_INTERVAL__?: NodeJS.Timeout;
          };

          if (globalWithTelemetry.__SVELTY_TELEMETRY_INTERVAL__) {
            clearInterval(globalWithTelemetry.__SVELTY_TELEMETRY_INTERVAL__);
          }

          setTimeout(() => {
            telemetryService
              .checkUpdateStatus()
              .catch((err) => logger.error("Initial telemetry check failed", err));
          }, 10_000);

          globalWithTelemetry.__SVELTY_TELEMETRY_INTERVAL__ = setInterval(
            () => {
              telemetryService
                .checkUpdateStatus()
                .catch((err) => logger.error("Periodic telemetry check failed", err));
            },
            1000 * 60 * 60 * 12, // 12 hours
          );
        }

        // 🚀 PRE-WARM LAZY WRITE-PATH MODULES (cold-start): the first collection
        // create/update used to pay a dynamic-import stall for workflow,
        // response-cache, pub-sub, outbox, token-engine, history, the session
        // store, tenant-adapter, field-permissions, and modify-request. Import
        // them once at READY so the first write hits warm module singletons.
        {
          const lazy = await import("@src/services/sdk/namespaces/collections/lazy-services");
          await Promise.allSettled([
            lazy.getWorkflowServiceLazy(),
            lazy.getResponseCacheLazy(),
            lazy.getPubSubLazy(),
            lazy.getOutboxLazy(),
            lazy.getTokenEngineLazy(),
            lazy.getHistoryServiceLazy(),
            lazy.getDbModuleLazy(),
            import("@src/services/security/field-permission-service"),
            import("@src/content/index.server"),
            import("@utils/modify-request"),
            import("@src/databases/tenant-adapter"),
            import("@src/databases/auth/session-manager").then((m) => m.getDefaultSessionStore()),
          ]);
          logger.debug("[System] Lazy write-path modules pre-warmed");
        }

        // 🚀 Pre-build both cached middleware pipelines so the first request
        // skips the sequence() assembly (and any remaining ensureFullMiddleware
        // await). Safe: getPipeline guards fullMiddlewareInitialized internally.
        try {
          await getPipeline(RequestLane.API_READ);
          await getPipeline(RequestLane.APP_SSR);
          logger.debug("[System] Middleware pipelines pre-built");
        } catch (err) {
          logger.warn("[System] Pipeline pre-build failed (non-fatal):", err);
        }

        // Cleanup: Unsubscribe once services are initialized
        // ✨ FIXED: Defer unsubscribe to next tick to avoid ReferenceError if subscribe is synchronous
        Promise.resolve().then(() => {
          if (typeof unsubscribe === "function") {
            unsubscribe();
          }
        });
      }
    });
  });

  if (!IS_QUIET) {
    logger.info("✅ DB module loaded. System will initialize background services when READY.");
  }
}

// ✨ ENTERPRISE: Graceful Shutdown Registry
let inFlightRequests = 0;
/** Cheap per-request id sequence for the non-trace path (see handle()). */
let requestSeq = 0;

type ShutdownGlobal = typeof globalThis & {
  __SVELTY_SHUTTING_DOWN__?: boolean;
  __SVELTY_SIGNAL_HANDLERS_INSTALLED__?: boolean;
};

function isViteRunnerClosedError(reason: unknown): boolean {
  const msg =
    reason instanceof Error
      ? reason.message
      : typeof reason === "string"
        ? reason
        : reason && typeof reason === "object" && "message" in reason
          ? String((reason as { message: unknown }).message)
          : String(reason ?? "");
  return /module runner has been closed|vite.*closed|server is closed/i.test(msg);
}

if (!building) {
  const g = globalThis as ShutdownGlobal;

  // HMR re-evaluates hooks.server.ts — only install process listeners once per process
  if (!g.__SVELTY_SIGNAL_HANDLERS_INSTALLED__) {
    g.__SVELTY_SIGNAL_HANDLERS_INSTALLED__ = true;

    const handleSignal = async (signal: string) => {
      // Re-entrancy: double Ctrl+C / stacked HMR listeners must not re-enter
      if (g.__SVELTY_SHUTTING_DOWN__) return;
      g.__SVELTY_SHUTTING_DOWN__ = true;

      logger.info(`Received ${signal}. Starting graceful shutdown...`);
      const shutdownTimeout = setTimeout(() => {
        logger.error(`Graceful shutdown timed out after 10s. Force exiting.`);
        process.exit(1);
      }, 10000);

      try {
        // Drain period (bounded — don't hang forever if counters desync)
        const drainDeadline = Date.now() + 5_000;
        let lastLoggedCount = -1;
        while (inFlightRequests > 0 && Date.now() < drainDeadline) {
          // Log only when the counter changes — not every 250ms tick (log flood
          // under active traffic during shutdown).
          if (inFlightRequests !== lastLoggedCount) {
            logger.info(`Waiting for ${inFlightRequests} in-flight requests to drain...`);
            lastLoggedCount = inFlightRequests;
          }
          await new Promise((r) => setTimeout(r, 250));
        }

        // 🚀 GRACEFUL WS SHUTDOWN: send `1001 Going Away` to every tracked
        // connection so realtime clients can reconnect cleanly instead of
        // hanging until the adapter force-kicks them.
        try {
          const { closeAllConnections } = await import("./hooks.ws");
          const closed = closeAllConnections(1001, "Server shutting down");
          if (closed > 0) logger.info(`Gracefully closed ${closed} WebSocket connection(s)`);
        } catch (err) {
          logger.debug("WS close skipped (hooks.ws not loaded):", err);
        }

        // In Vite dev, process exit often closes the SSR module runner *before* this
        // dynamic import runs → "Vite module runner has been closed". Swallow that;
        // OS process exit still tears down sockets/DB handles.
        try {
          const { shutdownSystem } = await import("@src/databases/db");
          await shutdownSystem();
        } catch (err) {
          if (isViteRunnerClosedError(err)) {
            logger.debug(
              "Graceful DB shutdown skipped — Vite SSR runner already closed (normal on Ctrl+C in dev).",
            );
          } else {
            logger.error("Error during graceful DB shutdown:", err);
          }
        }

        clearTimeout(shutdownTimeout);
        logger.info("✅ All systems finalized. Exit.");
      } catch (err) {
        clearTimeout(shutdownTimeout);
        if (!isViteRunnerClosedError(err)) {
          logger.error("Graceful shutdown failed:", err);
        }
      } finally {
        process.exit(0);
      }
    };

    // Fire-and-forget with .catch so rejections never surface as unhandled
    process.on("SIGTERM", () => {
      void handleSignal("SIGTERM").catch(() => process.exit(0));
    });
    process.on("SIGINT", () => {
      void handleSignal("SIGINT").catch(() => process.exit(0));
    });

    // ✨ ENTERPRISE: Diagnostic Error Catching
    process.on("uncaughtException", (err) => {
      // Expected race while Vite tears down on Ctrl+C — don't FATAL-spam
      if (g.__SVELTY_SHUTTING_DOWN__ && isViteRunnerClosedError(err)) return;
      if (isViteRunnerClosedError(err)) {
        logger.debug("Ignored Vite module-runner exception during process teardown.");
        return;
      }
      logger.error("FATAL: Uncaught Exception:", err);
      process.stderr.write(`FATAL: Uncaught Exception: ${err}\n`);
      process.exit(255);
    });

    process.on("unhandledRejection", (reason) => {
      if (g.__SVELTY_SHUTTING_DOWN__ && isViteRunnerClosedError(reason)) return;
      // Signal order can reject before our flag is set
      if (isViteRunnerClosedError(reason)) {
        logger.debug("Ignored Vite module-runner rejection during process teardown.");
        return;
      }
      logger.error("FATAL: Unhandled Rejection:", reason);
      process.stderr.write(`FATAL: Unhandled Rejection: ${reason}\n`);
    });
  }
}

// Helper to dynamically wrap SvelteKit middleware inside a high-resolution tracing span
// 🚀 Pre-resolves the handle reference once (saves one function call per hook per request)
// 🚀 HOOK TIMING: Accumulates per-hook latency for diagnostics via getHookTimings().
const hookTimings = new Map<string, { count: number; total: number; min: number; max: number }>();

export function getHookTimings(): Record<
  string,
  { avg: number; min: number; max: number; count: number }
> {
  const result: Record<string, any> = {};
  for (const [name, t] of hookTimings) {
    result[name] = {
      avg: t.total / t.count,
      min: t.min,
      max: t.max,
      count: t.count,
    };
  }
  return result;
}

// 🚀 PERF FIX: Hook timing and tracing add measurable overhead (Map ops, performance.now, traceSpan)
// on every request for every hook. This contributes to the "Middleware/Hooks over budget"
// (target <2ms full pipeline in exec matrix). Gate to diagnostics/benchmark only.
// Turbo path remains fast (1.6-2.1ms) because it short-circuits many later hooks.
const HOOK_TIMING_ENABLED = process.env.ENABLE_HOOK_TIMING === "1";

function wrapHandle(name: string, handleFnRef: () => Handle): Handle {
  // Resolve once at wrap time (pipeline build). Saves per-request function call overhead.
  const resolvedHandle = handleFnRef();
  if (!HOOK_TIMING_ENABLED) {
    // Zero-overhead path: pass the resolved handle straight into sequence().
    // An `async (input) => await resolvedHandle(input)` wrapper here adds one
    // extra promise hop per hook per request (15 hooks = 15 microtask layers).
    return resolvedHandle;
  }
  return async (input) => {
    const start = performance.now();
    try {
      return await traceSpan(`hook:${name}`, async () => await resolvedHandle(input));
    } finally {
      const elapsed = performance.now() - start;
      let t = hookTimings.get(name);
      if (!t) {
        t = { count: 0, total: 0, min: Infinity, max: 0 };
        hookTimings.set(name, t);
      }
      t.count++;
      t.total += elapsed;
      if (elapsed < t.min) t.min = elapsed;
      if (elapsed > t.max) t.max = elapsed;
    }
  };
}

// 🚀 DYNAMIC PIPELINE DISPATCHER
// We don't pre-compile the sequence into a single const, instead we build it
// based on the current system state.
let cachedPipelineReady: Handle | null = null;
let cachedPipelineApi: Handle | null = null;
let cachedPipelineSetup: Handle | null = null;

// 🛡️ AWAIT full middleware before building the READY pipeline: at boot,
// ensureFullMiddleware() loads the real hook modules asynchronously. Without
// the await, the first request can snapshot passThrough handlers into the
// cached pipeline — and wrapHandle() binds the resolved fn at wrap time, so
// security/rate-limit/auth would stay bypassed until a setup-state change or
// process restart.
const getPipeline = async (lane?: RequestLane): Promise<Handle> => {
  if (setupComplete) {
    if (!fullMiddlewareInitialized) {
      await ensureFullMiddleware();
    }
    const isApiLane =
      lane === RequestLane.API_READ ||
      lane === RequestLane.API_WRITE ||
      lane === RequestLane.HYPER_TURBO;
    // API lanes skip page-only hooks (redirects / AEO / user-preferences).
    // Auth, WAF, rate-limit, turbo-get, and RBAC stay in place.
    if (isApiLane) {
      if (!cachedPipelineApi) {
        cachedPipelineApi = sequence(
          wrapHandle("turbo-pipeline", () => handleTurboPipeline),
          wrapHandle("test-isolation", () => handleTestIsolation),
          wrapHandle("security", () => handleSecurity),
          wrapHandle("rate-limit", () => handleRateLimit),
          wrapHandle("system-state", () => handleSystemState),
          wrapHandle("turbo-get", () => handleTurboGet),
          wrapHandle("compression", () => handleCompression),
          wrapHandle("authentication", () => handleAuthentication),
          wrapHandle("authorization", () => handleAuthorization),
          wrapHandle("local-sdk", () => handleLocalSdk),
          wrapHandle("content-initialization", () => handleContentInitialization),
          wrapHandle("audit-logging", () => handleAuditLogging),
          wrapHandle("api-requests", () => handleApiRequests),
          wrapHandle("token-resolution", () => handleTokenResolution),
        );
      }
      return cachedPipelineApi;
    }
    if (!cachedPipelineReady) {
      cachedPipelineReady = sequence(
        wrapHandle("turbo-pipeline", () => handleTurboPipeline),
        wrapHandle("test-isolation", () => handleTestIsolation),
        wrapHandle("security", () => handleSecurity),
        wrapHandle("rate-limit", () => handleRateLimit),
        wrapHandle("system-state", () => handleSystemState),
        // 🚀 Turbo GET: Right after security gates but BEFORE auth/authz.
        // Serves pre-encoded cached responses with pre-computed session auth,
        // bypassing handleAuthentication, handleAuthorization, and CSRF.
        wrapHandle("turbo-get", () => handleTurboGet),
        wrapHandle("redirects", () => handleRedirects),
        wrapHandle("compression", () => handleCompression),
        wrapHandle("aeo-headers", () => handleAeoHeaders),
        wrapHandle("user-preferences", () => handleUserPreferences),
        wrapHandle("authentication", () => handleAuthentication),
        wrapHandle("authorization", () => handleAuthorization),
        wrapHandle("local-sdk", () => handleLocalSdk),
        wrapHandle("content-initialization", () => handleContentInitialization),
        wrapHandle("audit-logging", () => handleAuditLogging),
        wrapHandle("api-requests", () => handleApiRequests),
        wrapHandle("token-resolution", () => handleTokenResolution),
      );
    }
    return cachedPipelineReady;
  } else {
    if (!cachedPipelineSetup) {
      cachedPipelineSetup = sequence(
        wrapHandle("turbo-pipeline", () => handleTurboPipeline),
        wrapHandle("compression", () => handleCompression),
      );
    }
    return cachedPipelineSetup;
  }
};

/**
 * 🛡️ GLOBAL SECURITY GUARD
 * Ensures that EVERY response (including 302 redirects, 404s, and 500 errors)
 * carries the full suite of security headers.
 *
 * Request Lane Router: O(1) classification for health/static/turbo fast-paths
 * before the full middleware sequence.
 */
function withLane(res: Response, lane: RequestLane): Response {
  res.headers.set("x-svelty-lane", lane);
  return res;
}

// ─── Operational Request Lane Router ───────────────────────────────────────
export const handle: Handle = async ({ event, resolve }) => {
  const lane = classifyRequest(event.url, event.request.method, event.request.headers);
  (event.locals as any).lane = lane;
  (event.locals as any).routeSpec = routeResourceStateMachine.classifyRouteSpec(event.url.pathname);

  if (lane === RequestLane.FAST_STATIC) {
    if (event.url.pathname === "/favicon.ico")
      return withLane(new Response(null, { status: 204 }), lane);
    const res = await resolve(event);
    res.headers.set("Cache-Control", "public, max-age=31536000, immutable");
    return withLane(res, lane);
  }

  const pathname = event.url.pathname;

  // 🚀 HOT-SWAP CHECK: Dynamically synchronize setup state on every request
  const currentSetupState = currentSetupStateWithMemo(pathname);
  if (setupComplete !== currentSetupState) {
    logger.info(`🔄 System setup state change detected: ${setupComplete} -> ${currentSetupState}`);
    setupComplete = currentSetupState;
    cachedPipelineReady = null;
    cachedPipelineApi = null;
    cachedPipelineSetup = null;
    if (setupComplete) {
      try {
        await ensureFullMiddleware();
      } catch (err) {
        logger.error("Failed to lazy-load full middleware:", err);
      }
    }
  }

  // 🚀 Fast-return for known static/missing paths (avoids ALL middleware + trace overhead)
  if (pathname === "/favicon.ico") {
    return withLane(new Response(null, { status: 204 }), lane);
  }

  // 🚀 Health check fast-return: skip trace setup, context, and full pipeline
  if (lane === RequestLane.HEALTH || pathname === "/api/system/health" || pathname === "/health") {
    inFlightRequests++;
    try {
      const state =
        (globalThis as any).__SYSTEM_OVERALL_STATE__ || (setupComplete ? "READY" : "SETUP");

      if (
        setupComplete &&
        (state === "IDLE" || (globalThis as any).__SYSTEM_OVERALL_STATE__ === undefined)
      ) {
        import("./databases/db")
          .then(({ getDbInitPromise }) => {
            getDbInitPromise(false, "CORE").catch(() => {});
          })
          .catch(() => {});
      }

      const isReady =
        state === "READY" || state === "WARMED" || state === "WARMING" || state === "DEGRADED";
      const isDbConnected = state !== "SETUP" && state !== "IDLE" && state !== "FAILED";

      const includeDiagnostics =
        event.url.searchParams.has("verbose") ||
        event.url.searchParams.has("hooks") ||
        event.url.searchParams.has("gc");
      const health: Record<string, unknown> = {
        status: isReady ? "healthy" : "unhealthy",
        overallStatus: state,
        database: isDbConnected ? "connected" : "disconnected",
        timestamp: Date.now(),
        uptime: process.uptime(),
        dbType: process.env.DB_TYPE || "unknown",
      };

      if (includeDiagnostics) {
        if (event.url.searchParams.has("gc")) {
          if (typeof global !== "undefined" && (global as any).gc) (global as any).gc();
          if (typeof (globalThis as any).Bun !== "undefined" && (globalThis as any).Bun.gc) {
            (globalThis as any).Bun.gc(true);
          }
        }

        const mem = process.memoryUsage();
        const hooks = getHookTimings();
        health.memory = {
          rss: mem.rss,
          heapTotal: mem.heapTotal,
          heapUsed: mem.heapUsed,
          external: mem.external,
        };
        if (Object.keys(hooks).length > 0) health.hooks = hooks;

        // 🎯 CONTENT-STORE READINESS + GRAPHQL CACHE CAUSES: "DB connected but
        // content not READY" windows (slow compile/scan after boot) misattribute
        // latency to cold start; schemaHits≈0 with schemaMisses climbing is the
        // per-request schema-rebuild signature (identity-flip class).
        try {
          const { contentSystem } = await import("@src/content/index.server");
          health.content = contentSystem.getHealthStatus();
        } catch {}
        try {
          health.graphql = metricsService.getReport().graphql;
        } catch {}
      }

      const healthRes = Response.json(health, { headers: HEALTH_HEADERS });
      return withLane(healthRes, lane);
    } finally {
      inFlightRequests--;
    }
  }

  inFlightRequests++;
  // Reset per-request ID counters for deterministic SSR/hydration IDs
  resetIdCounters();
  const traceHeader = event.request.headers.get("x-svelty-trace");
  const traceEnabled = traceHeader === "true";
  // Lazy trace ID: the pipeline overwrites locals.requestId with its own
  // generateRequestId() anyway, so a pre-pipeline UUID is only needed when
  // tracing is enabled (99.9% of traffic gets a cheap sequential id).
  const traceId =
    (event.locals as any).requestId ||
    (traceEnabled ? crypto.randomUUID() : `r${(requestSeq++).toString(36)}`);

  // 🚀 Fast path: skip ALL trace/context overhead when tracing is disabled (99.9% of traffic)
  if (!traceEnabled) {
    (event.locals as any).requestId = traceId;
    try {
      const pipeline = await getPipeline(lane);
      const res = await pipeline({ event, resolve });
      return withLane(res, lane);
    } catch (err: any) {
      if (!isRedirect(err)) {
        logger.error(`[Guard] Unhandled error in middleware chain:`, err);
        const errorResponse = handleApiError(err, event);
        applyAllSecurityHeaders(
          errorResponse.headers,
          event.url.protocol === "https:",
          event.request.headers.get("Origin"),
          event.url.pathname,
        );
        return withLane(errorResponse, lane);
      }
      throw err;
    } finally {
      inFlightRequests--;
    }
  }

  return runWithContext(
    {
      requestId: traceId,
      abortSignal: event.request.signal,
    },
    () => {
      return runWithTrace(traceId, traceEnabled, async () => {
        try {
          const pipeline = await getPipeline(lane);
          const response = await pipeline({ event, resolve });

          if (traceEnabled) {
            const trace = getTrace();
            if (trace) {
              response.headers.set("x-svelty-trace-id", trace.traceId);
              response.headers.set("x-svelty-trace-spans", JSON.stringify(trace.spans));
            }
          }
          return withLane(response, lane);
        } catch (err: any) {
          if (isRedirect(err)) {
            throw err;
          }

          logger.error(`[Guard] Unhandled error in middleware chain:`, err);

          const errorResponse = handleApiError(err, event);

          applyAllSecurityHeaders(
            errorResponse.headers,
            event.url.protocol === "https:",
            event.request.headers.get("Origin"),
            event.url.pathname,
          );

          if (traceEnabled) {
            const trace = getTrace();
            if (trace) {
              errorResponse.headers.set("x-svelty-trace-id", trace.traceId);
              errorResponse.headers.set("x-svelty-trace-spans", JSON.stringify(trace.spans));
            }
          }

          return withLane(errorResponse, lane);
        } finally {
          inFlightRequests--;
        }
      });
    },
  );
};

// --- Global Error Handler (SvelteKit v3 compatible) ---
/**
 * Catches ALL unhandled errors from page loads, API routes, and server functions.
 * Extracts structured codes from raise() calls via `__sveltyCode` in the error body.
 * Single source of truth for production error logging.
 *
 * 🚀 SK3: handleError receives a `CaughtError & { event }` input — the HTTP
 * status lives on the caught error object (app errors always carry status).
 */
export const handleError: HandleServerError = async (input) => {
  const { error, event } = input;
  const status = (error as { status?: number } | null)?.status ?? 500;
  const body = (error as { body?: { __sveltyCode?: string; message?: string } } | null)?.body;
  const code = body?.__sveltyCode || `HTTP_${status}`;
  const message = body?.message || (error instanceof Error ? error.message : String(error ?? ""));

  logger.error(`[GlobalError] ${code} — ${message}`, {
    path: event?.url?.pathname,
    method: event?.request?.method,
    userId: event?.locals?.user?._id,
    tenantId: event?.locals?.tenantId,
    status,
    stack: error instanceof Error ? error.stack : undefined,
  });
};

// --- Utility Functions for External Use ---
export const getHealthMetrics = () => metricsService.getReport();

/**
 * Invalidate all turbo-auth cache entries for a specific user.
 * Called when roles change or the user is blocked/deleted/unblocked
 * so privilege changes take effect immediately without waiting for TTL expiry.
 */
export function invalidateTurboAuthForUser(userId: string) {
  for (const [key, ctx] of turboAuthCache.entries()) {
    if (ctx.user?._id === userId || ctx.user?.id === userId) {
      turboAuthCache.delete(key);
    }
  }
}

import { TokenRegistry } from "@src/services/token/engine";

// 🚀 Register server-side token resolver for site settings without polluting client bundle
TokenRegistry.setSiteResolver(async () => {
  const { getAllSettings } = await import("@src/services/core/settings-service");
  return await getAllSettings();
});
