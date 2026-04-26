/**
 * @file tests/integration/helpers/server.ts
 * @description Helper functions for server interaction in integration tests.
 */

// Base URL constant for tests (alias for getApiBaseUrl for compatibility)
export const BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:4173";

// Returns the API base URL from environment or default.
export function getApiBaseUrl(): string {
  return process.env.API_BASE_URL || "http://127.0.0.1:4173";
}

// Pings the server health endpoint to ensure it's ready.
export async function checkServer(): Promise<boolean> {
  const url = `${getApiBaseUrl()}/api/system/health`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });

    // The server might return 503 if setup is incomplete (MISSING_CONFIG).
    // We still want to read the JSON body to determine the exact state.
    if (response.status !== 200 && response.status !== 503) {
      const text = await response.text().catch(() => "");
      console.log(`[checkServer] Unhandled Status: ${response.status}, Body: ${text}`);
      return false;
    }

    const data = await response.json();

    // Accept READY or SETUP states for integration testing
    const status = data?.overallStatus || data?.status || data?.setupState || "";
    const isHealthy = [
      "READY",
      "SETUP",
      "WARMED",
      "INITIALIZING",
      "MISSING_CONFIG",
      "MISSING_ADMIN",
      "HEALTHY",
    ].includes(status.toUpperCase());

    if (!isHealthy) {
      console.log(`[checkServer] Unhealthy state: ${status} (HTTP ${response.status})`);
    }
    return isHealthy;
  } catch (err: any) {
    console.log(`[checkServer] Fetch failed: ${err.message}`);
    return false;
  }
}

// Waits for the server to become healthy with a timeout.
export async function waitForServer(timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  const baseUrl = getApiBaseUrl();

  console.log(`⏳ Waiting for server at ${baseUrl}...`);

  while (Date.now() - start < timeoutMs) {
    if (await checkServer()) {
      console.log("✅ Server is up and healthy!");
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Server at ${baseUrl} did not start within ${timeoutMs}ms`);
}

/**
 * Safely performs a fetch with retries to handle server re-initialization flickers.
 * Automatically adds the Origin header to bypass CSRF protection.
 */
export async function safeFetch(
  url: string,
  init?: RequestInit,
  maxRetries = 5,
  delay = 2000,
): Promise<Response> {
  const headers = new Headers(init?.headers || {});

  // Ensure Origin and Referer headers are present to satisfy CSRF protection in hooks
  if (!headers.has("Origin")) {
    headers.set("Origin", BASE_URL);
  }
  if (!headers.has("Referer")) {
    headers.set("Referer", `${BASE_URL}/`);
  }



  const signal = init?.signal || AbortSignal.timeout(60000);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const cookieHeader = headers.get("Cookie") || "None";
      const resp = await fetch(url, { ...init, headers, signal });

      if (!resp) {
        throw new Error(`Server at ${url} returned an undefined response.`);
      }

      if (!resp.ok) {
        const bodyText = await resp
          .clone()
          .text()
          .catch(() => "N/A");
        const logMsg =
          `\n[safeFetch] ❌ Request failed: ${url}\n` +
          `[safeFetch]    Status: ${resp.status}\n` +
          `[safeFetch]    Origin: ${headers.get("Origin")}\n` +
          `[safeFetch]    Cookie: ${cookieHeader}\n` +
          `[safeFetch]    Body: ${bodyText}\n`;
        process.stderr.write(logMsg);
      }

      if (!resp.headers) {
        throw new Error(`Server at ${url} returned a response without headers.`);
      }
      return resp;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const isTransient =
        message.includes("ConnectionRefused") ||
        message.includes("failed to fetch") ||
        message.includes("ECONNREFUSED") ||
        message.includes("undici"); // Bun/Node fetch errors

      if (isTransient && attempt < maxRetries) {
        console.log(
          `⏳ Server flicker detected at ${url}. Retrying (${attempt + 1}/${maxRetries})...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      let guidance = "";
      if (isTransient) {
        guidance =
          "\n\n💡 FIX: The integration server is NOT running or crashed. Please start it using:\n" +
          "   1. 'bun run test:integration' (Starts server + runs all tests)\n" +
          "   2. 'bun run preview' (Starts server in high-performance mode)";
      }

      throw new Error(
        `Failed to reach server at ${url}.${guidance}\n\nTechnical Error: ${message}`,
      );
    }
  }
  throw new Error(`Failed to reach server at ${url} after ${maxRetries} retries.`);
}
