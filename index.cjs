// Plesk Passenger Entry Point for SveltyCMS (SvelteKit)
// Responsibility: Start the Node.js server and listen on the port provided by Passenger.

async function loadApp() {
  console.log("[SveltyCMS] Initializing application...");

  // Import the SvelteKit handler
  const { handler } = await import("./build/handler.js");
  const http = await import("node:http");

  // Production configuration
  process.env.BODY_SIZE_LIMIT = "104857600"; // 100MB
  process.env.ORIGIN = process.env.ORIGIN || "https://demo.sveltycms.com";
  process.env.NODE_ENV = "production";

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

  // Conditional WebSocket upgrade handler — works on VPS/dedicated servers,
  // degrades gracefully on shared Plesk hosting where proxies strip Upgrade headers.
  // Enable with: ENABLE_WEBSOCKET=true (or re-add websocket: true in adapter config)
  const enableWebSocket = process.env.ENABLE_WEBSOCKET === "true";

  if (enableWebSocket) {
    console.log("[SveltyCMS] WebSocket upgrades enabled");
    server.on("upgrade", (req, socket, head) => {
      try {
        // Delegate to the adapter's upgrade handler (svelte-adapter-uws)
        handler(req, socket, head);
      } catch (err) {
        console.warn("[SveltyCMS] WebSocket upgrade failed (shared hosting?):", err.message);
        socket.destroy();
      }
    });
  }

  server.listen(port, () => {
    console.log(
      `[SveltyCMS] Server listening on port ${port}${enableWebSocket ? " (WS enabled)" : ""}`,
    );
  });

  // Handle signals for graceful shutdown
  process.on("SIGTERM", () => server.close());
  process.on("SIGINT", () => server.close());
}

loadApp().catch((err) => {
  console.error("[SveltyCMS] CRITICAL: Failed to start server:", err);
  process.exit(1);
});
