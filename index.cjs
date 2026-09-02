// Plesk Passenger Entry Point for SveltyCMS (SvelteKit)
// Responsibility: Start the Node.js server and listen on the port provided by Passenger.

async function loadApp() {
  console.log("[SveltyCMS] Initializing application...");

  // 🛡️ Production configuration — MUST run BEFORE importing the handler: the
  // adapter-node reads BODY_SIZE_LIMIT at module-evaluation time (default 512K).
  // Setting it after the import silently left the 512K cap active in every
  // production deployment (uploads/imports >512KB failed with "Bad Request").
  process.env.BODY_SIZE_LIMIT = "104857600"; // 100MB

  // Import the SvelteKit handler
  const { handler } = await import("./build/handler.js");
  const http = await import("node:http");
  // Prefer explicit ORIGIN. For local/CI preview (127.0.0.1 / localhost) default to
  // the listening URL so SvelteKit remote CSRF (completeSetup) is not rejected as
  // cross-site against the demo production host.
  if (!process.env.ORIGIN) {
    const host = process.env.HOST || "127.0.0.1";
    const port = process.env.PORT || "4173";
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

  // PROXY HEADERS: Fix for "Too Many Requests" issue & Header mismatches
  process.env.ADDRESS_HEADER = "x-forwarded-for";
  process.env.PROTOCOL_HEADER = "x-forwarded-proto";
  process.env.HOST_HEADER = "host";

  // Plesk Passenger provides the PORT environment variable
  const port = process.env.PORT || "4173";

  // Create and start the HTTP server
  const server = http.createServer((req, res) => {
    if (process.env.DEBUG_HEADERS) {
      console.log(`[SveltyCMS] Request: ${req.method} ${req.url}`);
      console.log("[SveltyCMS] Headers:", JSON.stringify(req.headers));
    }
    handler(req, res);
  });

  // Node 18+ defaults headersTimeout to 60s. A keep-alive write burst that
  // lasts >60s (100k HTTP creates) can get 408 without invoking the CMS
  // listener — zero application logs, ~14 dropped in-flight requests.
  // keepAliveTimeout MUST stay below headersTimeout (Node docs).
  const headerMs = Number(process.env.HTTP_HEADERS_TIMEOUT_MS) || 10 * 60_000;
  const requestMs = Number(process.env.HTTP_REQUEST_TIMEOUT_MS) || 10 * 60_000;
  const keepAliveMs = Number(process.env.HTTP_KEEPALIVE_TIMEOUT_MS) || 75_000;
  server.headersTimeout = headerMs;
  server.requestTimeout = requestMs;
  server.keepAliveTimeout = Math.min(keepAliveMs, Math.max(1, headerMs - 1_000));

  // Start standard Yjs collaboration WebSocket server
  console.log("[SveltyCMS] Initializing Yjs WebSocket collaboration server on /ws...");
  let stopYjs;
  try {
    const { startYjsSyncServer } = await import("./build/yjs-sync-server.js");
    stopYjs = startYjsSyncServer({ server, path: "/ws" });
  } catch (err) {
    console.warn("[SveltyCMS] Failed to initialize Yjs collaboration server:", err.message);
  }

  server.listen(port, () => {
    console.log(`[SveltyCMS] Server listening on port ${port} (WS enabled)`);
  });

  // Handle signals for graceful shutdown
  process.on("SIGTERM", () => {
    if (stopYjs) stopYjs();
    server.close();
  });
  process.on("SIGINT", () => {
    if (stopYjs) stopYjs();
    server.close();
  });
}

loadApp().catch((err) => {
  console.error("[SveltyCMS] CRITICAL: Failed to start server:", err);
  process.exit(1);
});
