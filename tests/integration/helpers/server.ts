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

    // The health endpoint uses 533 while warming up and may return 503/202
    // during setup or degraded test scenarios. We still need the JSON body.
    if (![200, 202, 503, 533].includes(response.status)) {
      const text = await response.text().catch(() => "");
      console.log(`[checkServer] Unhandled Status: ${response.status}, Body: ${text}`);
      return false;
    }

    const data = await response.json();
    const payload = data?.data && typeof data.data === "object" ? data.data : data;

    const status = payload?.overallStatus || payload?.status || "";
    // INITIALIZING is a transitional boot state after process restart — the server
    // is listening and will reach READY/SETUP once migrations finish. Treating it
    // as dead caused Phase-2 isolated setup tests to fail after 60s of healthy boots.
    const isHealthy = [
      "READY",
      "SETUP",
      "WARMED",
      "WARMING",
      "DEGRADED",
      "HEALTHY",
      "IDLE",
      "INITIALIZING",
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
 * Automatically adds the Origin header and x-test-secret to bypass security/CSRF in tests.
 *
 * ### Contract
 * - Non-stream bodies are buffered so callers can `.json()`/`.text()` after retries.
 * - SSE (`text/event-stream`) is returned live (never arrayBuffer — hangs forever).
 * - Prefer `Connection: close` to avoid keep-alive races after preview restarts.
 */
export async function safeFetch(
  url: string,
  init?: RequestInit & { skipTestSecret?: boolean },
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
  // Avoid keep-alive races when the preview process restarts mid-suite.
  if (!headers.has("Connection")) {
    headers.set("Connection", "close");
  }
  // Use the testing secret for bootstrap/setup calls, but keep cookie-authenticated
  // requests black-box once we have a real session.
  if (!init?.skipTestSecret && !headers.has("Cookie") && !headers.has("cookie")) {
    const testSecret = process.env.TEST_API_SECRET || "SVELTYCMS_TEST_SECRET_2026";
    headers.set("x-test-secret", testSecret);
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Fresh signal per attempt — reusing an aborted signal fails immediately.
    const signal = init?.signal || AbortSignal.timeout(attempt === 0 ? 60_000 : 30_000);

    try {
      const cookieHeader = headers.get("Cookie") || "None";
      const resp = await fetch(url, { ...init, headers, signal });

      if (!resp) {
        throw new Error(`Server at ${url} returned an undefined response.`);
      }

      if (!resp.headers) {
        throw new Error(`Server at ${url} returned a response without headers.`);
      }

      // SSE / long-lived streams never end — buffering arrayBuffer() hangs until abort.
      const contentType = resp.headers.get("Content-Type") || "";
      const isStreaming =
        contentType.includes("text/event-stream") || contentType.includes("application/x-ndjson");

      if (isStreaming) {
        return resp;
      }

      // Capture Set-Cookie before body read (some runtimes drop them after consume)
      const setCookies =
        typeof resp.headers.getSetCookie === "function" ? resp.headers.getSetCookie() : [];

      const bodyBuf = await resp.arrayBuffer();
      const bodyText = new TextDecoder().decode(bodyBuf);

      if (!resp.ok) {
        const logMsg =
          `\n[safeFetch] ❌ Request failed: ${url}\n` +
          `[safeFetch]    Status: ${resp.status}\n` +
          `[safeFetch]    Origin: ${headers.get("Origin")}\n` +
          `[safeFetch]    Cookie: ${cookieHeader}\n` +
          `[safeFetch]    Body: ${bodyText.slice(0, 500)}\n`;
        process.stderr.write(logMsg);
      }

      // Rebuild Response so callers can re-read the body; re-attach Set-Cookie
      const outHeaders = new Headers(resp.headers);
      for (const c of setCookies) {
        try {
          outHeaders.append("set-cookie", c);
        } catch {
          /* Headers may forbid set-cookie in some runtimes */
        }
      }
      // Fallback: single set-cookie header string for login cookie parsing
      if (setCookies.length === 0) {
        const sc = resp.headers.get("set-cookie");
        if (sc) outHeaders.set("set-cookie", sc);
      }

      return new Response(bodyBuf, {
        status: resp.status,
        statusText: resp.statusText,
        headers: outHeaders,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const isTransient =
        message.includes("ConnectionRefused") ||
        message.includes("failed to fetch") ||
        message.includes("ECONNREFUSED") ||
        message.includes("ECONNRESET") ||
        message.includes("socket connection closed") ||
        message.includes("socket connection was closed") ||
        message.includes("Unable to connect") ||
        message.includes("other side closed") ||
        message.includes("undici");

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
          "\n\n💡 FIX: Preview may be down or build is corrupt (missing chunks).\n" +
          "   1. COMPILE_ALL_ADAPTERS=true bun run build\n" +
          "   2. bun run test:integration (starts server + suite)\n" +
          "   3. Remove leftover build-saved/ / .svelte-kit/output-saved if present";
      }

      throw new Error(
        `Failed to reach server at ${url}.${guidance}\n\nTechnical Error: ${message}`,
      );
    }
  }
  throw new Error(`Failed to reach server at ${url} after ${maxRetries} retries.`);
}
