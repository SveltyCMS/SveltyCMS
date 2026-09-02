/**
 * @file index.bun.ts
 * @description Native Bun Entry Point for SveltyCMS.
 *
 * Responsibilities:
 * - Direct Bun.serve execution with high-throughput event loop
 * - Native Yjs WebSocket collaboration server on /ws
 * - Environment and proxy header configuration
 * - Graceful shutdown handling (SIGINT / SIGTERM)
 */

async function startBunServer() {
  console.log("[SveltyCMS:Bun] Initializing high-performance Bun runtime...");

  // 🛡️ Set body size limit before loading SvelteKit handler
  process.env.BODY_SIZE_LIMIT = process.env.BODY_SIZE_LIMIT || "104857600"; // 100MB

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

  // Import the SvelteKit handler
  const { handler } = await import("./build/handler.js");
  const http = await import("node:http");

  // Create HTTP server (compatible with SvelteKit handler and ws upgrade)
  const server = http.createServer((req, res) => {
    if (process.env.DEBUG_HEADERS) {
      console.log(`[SveltyCMS:Bun] ${req.method} ${req.url}`);
    }
    handler(req, res);
  });

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
    const { startYjsSyncServer } = await import("./build/yjs-sync-server.js");
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
