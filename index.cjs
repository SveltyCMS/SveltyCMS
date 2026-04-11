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

  // PROXY HEADERS: Fix for "Too Many Requests" issue
  process.env.ADDRESS_HEADER = "x-real-ip";
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

  server.listen(port, () => {
    console.log(`[SveltyCMS] Server listening on port ${port}`);
  });

  // Handle signals for graceful shutdown
  process.on("SIGTERM", () => server.close());
  process.on("SIGINT", () => server.close());
}

loadApp().catch((err) => {
  console.error("[SveltyCMS] CRITICAL: Failed to start server:", err);
  process.exit(1);
});
