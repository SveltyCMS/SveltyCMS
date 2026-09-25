/**
 * @file index.server.mjs
 * @description The single `node:http` server entry for SveltyCMS — used by
 * `node index.cjs` (Passenger/container), `bun index.cjs` and any launcher that
 * wants the same behaviour. Plain ESM so both runtimes execute this one file
 * instead of a per-runtime copy.
 *
 * Responsibilities:
 * - process environment for the generated handler (body limit, threadpool,
 *   ORIGIN, NODE_ENV, proxy headers, timeouts) — set BEFORE importing it, since
 *   adapter-node reads `BODY_SIZE_LIMIT` at module-evaluation time
 * - the HTTP listener, including the fast-lane dispatch (see
 *   `src/hooks/fast-lane.server.ts`): a lane answers with prebuilt
 *   status/headers/body and the bytes go straight to the socket
 * - the Yjs collaboration WebSocket server on /ws
 * - graceful shutdown on SIGINT / SIGTERM
 *
 * The lane dispatch is one call per GET/HEAD request into a single registry the
 * app publishes on `globalThis`. Adding a lane therefore never touches this file,
 * and every non-lane request, decline, or error falls through to the SvelteKit
 * handler.
 *
 * Native `Bun.serve` deployments (`start:bun` → `build/index.js`, built with
 * `ADAPTER=bun`) run svelte-adapter-bun's own server and do not pass through
 * here; lanes are a `node:http` feature by construction.
 */

import http from "node:http";
import os from "node:os";

/** Registry the app installs (see `src/hooks/fast-lane.server.ts`). */
const FAST_LANE_REGISTRY = "__SVELTY_FAST_LANES__";
/** Request header that forces the bridged path for one request (equivalence checks). */
const FAST_LANE_OPT_OUT_HEADER = "x-fast-lane";

const isBun = typeof Bun !== "undefined";
const runtimeLabel = isBun ? `Bun ${Bun.version}` : `Node ${process.versions.node}`;
const log = (message) => console.log(`[SveltyCMS] ${message}`);
const warn = (message) => console.warn(`[SveltyCMS] ${message}`);

/**
 * Environment the generated handler reads while its module graph evaluates — this
 * part MUST run before the import. adapter-node captures `BODY_SIZE_LIMIT` at
 * module-evaluation time (default 512K), and libuv reads `UV_THREADPOOL_SIZE`
 * when the first async I/O / crypto / zlib work runs.
 */
function configurePreImportEnv() {
  process.env.BODY_SIZE_LIMIT = process.env.BODY_SIZE_LIMIT || "104857600"; // 100MB

  if (!process.env.UV_THREADPOOL_SIZE) {
    try {
      const cpus = os.cpus()?.length || 4;
      process.env.UV_THREADPOOL_SIZE = String(Math.min(32, Math.max(4, cpus)));
    } catch {
      process.env.UV_THREADPOOL_SIZE = "16";
    }
  }
}

/**
 * Environment read per request rather than captured at import.
 *
 * ADDRESS_HEADER / PROTOCOL_HEADER / HOST_HEADER are deliberately NOT set here:
 * adapter-node captures them when the handler module loads, so setting them in
 * this process would make it *enforce* an `x-forwarded-for` that a direct client
 * (or the E2E/benchmark harness) never sends — every login then 500s on
 * `getClientAddress()`. They were dead assignments before this refactor; an
 * operator behind a proxy sets them in the environment, where they are present
 * before the import and therefore honoured.
 */
function configureRuntimeEnv() {
  const host = process.env.HOST || "0.0.0.0";
  const port = process.env.PORT || "4173";
  if (!process.env.ORIGIN) {
    const isLocal =
      host === "127.0.0.1" ||
      host === "localhost" ||
      host === "0.0.0.0" ||
      host === "::" ||
      process.env.TEST_MODE === "true";
    process.env.ORIGIN = isLocal
      ? `http://${host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host}:${port}`
      : "https://demo.sveltycms.com";
  }

  // Preserve harness NODE_ENV so /api/testing + test bypass stay open for
  // E2E/integration. Benchmark runs are production-mode: BENCHMARK must NOT
  // downgrade NODE_ENV — benchmarks measure real production semantics.
  const isHarness =
    process.env.TEST_MODE === "true" ||
    process.env.PLAYWRIGHT_TEST === "true" ||
    process.env.PLAYWRIGHT_TEST === "1";
  if (!isHarness) {
    process.env.NODE_ENV = "production";
  } else if (!process.env.NODE_ENV || process.env.NODE_ENV === "production") {
    process.env.NODE_ENV = "test";
  }
}

/**
 * Load a generated bundle from `build/` at runtime.
 *
 * The build output is intentionally outside the TypeScript program, so the
 * specifier is composed at runtime instead of written as a literal — Node and Bun
 * resolve the very same relative path.
 */
const importBuildBundle = (name) => import("./build/" + name + ".js");

function dispatchFastLane(input) {
  const dispatch = globalThis[FAST_LANE_REGISTRY];
  if (typeof dispatch !== "function") return Promise.resolve(null);
  return dispatch(input);
}

export async function startServer() {
  log(`Initializing application server (${runtimeLabel})...`);
  configurePreImportEnv();

  const { handler } = await importBuildBundle("handler");
  configureRuntimeEnv();

  const server = http.createServer((req, res) => {
    if (process.env.DEBUG_HEADERS) {
      log(`${req.method} ${req.url}`);
    }

    // 🚀 FAST LANE (on by default; the app publishes the registry unless
    // `SVELTY_FAST_LANE=0`): lane-shaped GET/HEAD requests are answered with
    // prebuilt status/headers/body, so the bytes are written straight to the
    // socket instead of going through adapter-node's IncomingMessage → Request
    // and Response → stream bridging. Anything else — not a lane request, the
    // lane declining, or any throw — goes to the generated handler.
    if (
      (req.method === "GET" || req.method === "HEAD") &&
      req.headers[FAST_LANE_OPT_OUT_HEADER] !== "off"
    ) {
      dispatchFastLane({
        method: req.method,
        url: req.url || "/",
        origin: process.env.ORIGIN || "http://127.0.0.1",
        headers: req.headers,
      })
        .then((out) => {
          if (!out) {
            handler(req, res);
            return;
          }
          res.writeHead(out.status, out.headers);
          res.end(out.body);
        })
        .catch(() => handler(req, res));
      return;
    }

    handler(req, res);
  });

  // Small JSON responses should not wait for Nagle coalescing. `http.Server`
  // already defaults this to true, but `noDelay` is only declared on the socket
  // *options* types — setting it per accepted socket is the typed, explicit way.
  server.on("connection", (socket) => socket.setNoDelay(true));

  // Node 18+ defaults headersTimeout to 60s. A keep-alive write burst that lasts
  // >60s (100k HTTP creates) can get 408 without invoking the CMS listener — zero
  // application logs, ~14 dropped in-flight requests. keepAliveTimeout MUST stay
  // below headersTimeout (Node docs).
  const headerMs = Number(process.env.HTTP_HEADERS_TIMEOUT_MS) || 10 * 60_000;
  const requestMs = Number(process.env.HTTP_REQUEST_TIMEOUT_MS) || 10 * 60_000;
  const keepAliveMs = Number(process.env.HTTP_KEEPALIVE_TIMEOUT_MS) || 75_000;
  server.headersTimeout = headerMs;
  server.requestTimeout = requestMs;
  server.keepAliveTimeout = Math.min(keepAliveMs, Math.max(1, headerMs - 1_000));

  let stopYjs;
  try {
    const { startYjsSyncServer } = await importBuildBundle("yjs-sync-server");
    stopYjs = startYjsSyncServer({ server, path: "/ws" });
    log("Yjs WebSocket collaboration server mounted on /ws");
  } catch (err) {
    warn(`Yjs collaboration server skipped: ${err?.message || err}`);
  }

  let supervisor;
  const bgMode = (process.env.SVELTY_BACKGROUND_MODE || "").toLowerCase().trim();
  if (bgMode !== "inprocess" && bgMode !== "disabled" && bgMode !== "off" && bgMode !== "0") {
    try {
      const { startBackgroundSupervisor } = await importBuildBundle("background-supervisor");
      supervisor = startBackgroundSupervisor();
      log("Background worker supervisor started (child mode)");
    } catch (err) {
      warn(`Background worker supervisor skipped: ${err?.message || err}`);
    }
  }

  const host = process.env.HOST || "0.0.0.0";
  const port = Number(process.env.PORT) || 4173;

  const shutdown = () => {
    if (stopYjs) stopYjs();
    if (supervisor) supervisor.stop().catch(() => {});
    server.close(() => process.exit(0));
    // A hung keep-alive connection must not hold the process open.
    setTimeout(() => process.exit(0), 5_000).unref?.();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  await new Promise((resolve) => server.listen(port, host, resolve));
  log(`Server listening on http://${host}:${port} (${runtimeLabel})`);
  return server;
}

// Launcher path: `node index.server.mjs` / `bun index.server.mjs` (the .cjs shim
// imports and calls `startServer` itself, so it must not double-start).
if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("index.server.mjs")) {
  startServer().catch((err) => {
    console.error("[SveltyCMS] CRITICAL: Failed to start server:", err);
    process.exit(1);
  });
}
