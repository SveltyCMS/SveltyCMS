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
    if (response.status !== 200) return false;
    const data = await response.json();
    return data?.overallStatus === "READY";
  } catch {
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
 * Safely performs a fetch, returning null instead of crashing when the server is unreachable.
 * Automatically adds the Origin header to bypass CSRF protection.
 */
export async function safeFetch(url: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers || {});

  // Ensure Origin and Referer headers are present to satisfy CSRF protection in hooks
  // SvelteKit CSRF protection compares Origin with the host
  if (!headers.has("Origin")) {
    headers.set("Origin", BASE_URL);
  }
  if (!headers.has("Referer")) {
    headers.set("Referer", `${BASE_URL}/`);
  }

  // Hardening: Default timeout of 60s for all benchmark/integration requests
  const signal = init?.signal || AbortSignal.timeout(60000);

  try {
    const resp = await fetch(url, { ...init, headers, signal });

    // Error handling for empty response
    if (!resp) {
      throw new Error(
        `Server at ${url} returned an undefined response. Is the preview server running?`,
      );
    }
    // Hardening: Verify that the response has a headers property (Mock detection)
    if (!resp.headers) {
      throw new Error(
        `Server at ${url} returned a response without headers. This usually indicates a global fetch mock has leaked from a unit test (e.g., ai-service.test.ts).`,
      );
    }
    return resp;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const isConnRefused =
      message.includes("ConnectionRefused") ||
      message.includes("failed to fetch") ||
      message.includes("ECONNREFUSED");

    let guidance = "";
    if (isConnRefused) {
      guidance =
        "\n\n💡 FIX: The integration server is NOT running. Please start it using:\n" +
        "   1. 'bun run test:integration' (Starts server + runs all tests)\n" +
        "   2. 'bun run preview' (Starts server in high-performance mode)\n" +
        "   3. 'bun run scripts/run-benchmarks.ts <file>' (Recommended for performance runs)";
    }

    throw new Error(`Failed to reach server at ${url}.${guidance}\n\nTechnical Error: ${message}`);
  }
}
