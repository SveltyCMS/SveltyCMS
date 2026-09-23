/**
 * @file index.bun.ts
 * @description Native Bun Entry Point for SveltyCMS.
 *
 * Responsibilities:
 * - Node-compatible `node:http` launcher on the Bun runtime — the same server
 *   shape as index.cjs, plus the Yjs socket below. This is NOT `Bun.serve`;
 *   the native path is `bun run start:bun` → `build/index.js` (svelte-adapter-bun).
 * - Native Yjs WebSocket collaboration server on /ws
 * - Environment and proxy header configuration
 * - Graceful shutdown handling (SIGINT / SIGTERM)
 *
 * Deliberately NOT in tsconfig `include`: this entry point dynamically imports
 * the generated `build/` bundles, so including it would pull every minified
 * server chunk into the program (measured: 61k+ errors from generated code).
 * `bun` is already in the tsconfig `types` list, so Bun globals resolve without
 * a `/// <reference types="bun" />` here — that reference is what pulled a second
 * `node:http` declaration copy into editors and produced a phantom
 * `IncomingMessage.signal` mismatch on the handler call.
 */

/**
 * Load a generated bundle from `build/` at runtime.
 *
 * The build output is intentionally outside the TypeScript program (following it
 * would pull every minified server chunk in — measured: 61k+ errors from
 * generated code), so the specifier is composed at runtime instead of written as
 * a literal. That keeps `tsc`/editors from resolving into `build/`, while Bun and
 * Node resolve the very same relative path.
 */
const importBuildBundle = <T>(name: string): Promise<T> =>
  import("./build/" + name + ".js") as Promise<T>;

/**
 * Shape of the raw-read-lane bridge the app publishes when
 * `SVELTY_RAW_READ_LANE=1` (see `src/hooks/raw-read-lane.server.ts`).
 *
 * Declared structurally here on purpose: this entry point deliberately stays out
 * of the TypeScript program (importing app types pulls the generated `build/`
 * chunks in), and `globalThis` has no index signature — reading the bridge
 * without a declared type is an implicit-`any` error.
 */
type RawLaneResult = { status: number; headers: Record<string, string>; body: string };
type RawLaneBridge = (input: {
  method: string;
  url: string;
  origin: string;
  headers: Record<string, string | string[] | undefined>;
}) => Promise<RawLaneResult | null>;

const rawLaneBridge = (): RawLaneBridge | undefined =>
  (globalThis as typeof globalThis & { __SVELTY_RAW_LANE__?: RawLaneBridge }).__SVELTY_RAW_LANE__;

async function startBunServer() {
  console.log("[SveltyCMS:Bun] Initializing high-performance Bun runtime...");

  // 🛡️ Set body size limit before loading SvelteKit handler
  process.env.BODY_SIZE_LIMIT = process.env.BODY_SIZE_LIMIT || "104857600"; // 100MB

  // ⚡ HARDWARE-CONCURRENT LIBUV THREADPOOL:
  if (!process.env.UV_THREADPOOL_SIZE) {
    try {
      const os = await import("node:os");
      const cpus = os.cpus()?.length || 4;
      process.env.UV_THREADPOOL_SIZE = String(Math.min(32, Math.max(4, cpus)));
    } catch {
      process.env.UV_THREADPOOL_SIZE = "16";
    }
  }

  const host = process.env.HOST || "0.0.0.0";
  const port = Number(process.env.PORT) || 4173;

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

  const isHarness =
    process.env.TEST_MODE === "true" ||
    process.env.PLAYWRIGHT_TEST === "true" ||
    process.env.PLAYWRIGHT_TEST === "1";
  if (!isHarness) {
    process.env.NODE_ENV = "production";
  } else if (!process.env.NODE_ENV || process.env.NODE_ENV === "production") {
    process.env.NODE_ENV = "test";
  }

  process.env.ADDRESS_HEADER = "x-forwarded-for";
  process.env.PROTOCOL_HEADER = "x-forwarded-proto";
  process.env.HOST_HEADER = "host";

  const http = await import("node:http");
  // The listener arguments are opaque here: this entry point only forwards what
  // Node passes to adapter-node's handler. Typed `unknown` on purpose — naming
  // the `node:http` classes again compares two declaration copies (this file opts
  // into `bun` types, and @types/node 26 added `IncomingMessage.signal`), which
  // surfaces as a phantom "signal is missing" mismatch on the call below.
  type RequestListener = (req: unknown, res: unknown, next?: (err?: unknown) => void) => void;
  // adapter-node's JSDoc types `next` as required, but its polka chain tolerates
  // its absence (`next ? next() : isNotFound(req, res)`), which is why index.cjs
  // also calls it with two arguments. Passing a stub `next` would be worse than
  // omitting it: nothing would route and nothing would 404, so the request would
  // hang until the headers timeout.
  const { handler: svelteKitHandler } = await importBuildBundle<{ handler: RequestListener }>(
    "handler",
  );
  const handler: RequestListener = svelteKitHandler;

  // Create HTTP server (compatible with SvelteKit handler and ws upgrade)
  const server = http.createServer((req, res) => {
    if (process.env.DEBUG_HEADERS) {
      console.log(`[SveltyCMS:Bun] ${req.method} ${req.url}`);
    }
    // 🧪 PROTOTYPE fast path (SVELTY_RAW_READ_LANE=1) — kept in parity with
    // index.cjs: lane-served bytes are written straight to the socket, and every
    // other request (or any error) goes to the SvelteKit handler.
    // The `x-raw-lane: off` request header forces the bridged path for one
    // request (parity with index.cjs) — the equivalence check uses it to compare
    // both transports inside one server run.
    const rawLane = rawLaneBridge();
    if (
      rawLane &&
      (req.method === "GET" || req.method === "HEAD") &&
      req.headers["x-raw-lane"] !== "off"
    ) {
      rawLane({
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

  // Match index.cjs: 60s Node headersTimeout 408s a 100k keep-alive seed
  // without hitting CMS logs. keepAliveTimeout must stay below headersTimeout.
  const headerMs = Number(process.env.HTTP_HEADERS_TIMEOUT_MS) || 10 * 60_000;
  const requestMs = Number(process.env.HTTP_REQUEST_TIMEOUT_MS) || 10 * 60_000;
  const keepAliveMs = Number(process.env.HTTP_KEEPALIVE_TIMEOUT_MS) || 75_000;
  server.headersTimeout = headerMs;
  server.requestTimeout = requestMs;
  server.keepAliveTimeout = Math.min(keepAliveMs, Math.max(1, headerMs - 1_000));

  // Start Yjs collaboration WebSocket server
  let stopYjs: (() => void) | undefined;
  try {
    const { startYjsSyncServer } = await importBuildBundle<{
      startYjsSyncServer: (options: { server: unknown; path: string }) => () => void;
    }>("yjs-sync-server");
    stopYjs = startYjsSyncServer({ server, path: "/ws" });
    console.log("[SveltyCMS:Bun] Yjs WebSocket collaboration server mounted on /ws");
  } catch (err: any) {
    console.warn("[SveltyCMS:Bun] Yjs collaboration server skipped:", err?.message || err);
  }

  server.listen(port, host, () => {
    console.log(`[SveltyCMS:Bun] Server running at http://${host}:${port} (Bun ${Bun.version})`);
  });

  const shutdown = () => {
    console.log("[SveltyCMS:Bun] Gracefully shutting down...");
    if (stopYjs) stopYjs();
    server.close(() => {
      console.log("[SveltyCMS:Bun] Server closed.");
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

startBunServer().catch((err) => {
  console.error("[SveltyCMS:Bun] CRITICAL: Failed to start server:", err);
  process.exit(1);
});
