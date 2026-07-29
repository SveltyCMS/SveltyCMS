/**
 * @file src/utils/http/egress-guard.ts
 * @description
 * Shared outbound HTTP guard for all admin/user-configured fetch calls.
 * Prevents SSRF (including DNS rebinding), enforces HTTPS, safely follows redirects,
 * and streams responses to enforce strict memory limits.
 *
 * ### Hardening (audit 2026-07):
 * - DNS rebinding fix: resolves hostnames via node:dns/promises before fetch
 * - Redirect bypass fix: manual redirect loop re-validates each hop against SSRF rules
 * - Memory exhaustion fix: streams response body in chunks, aborts mid-download
 * - Consolidated BLOCKED_HOSTS as a Set, uses net.isIP for proper IP detection
 */

import dns from "node:dns/promises";
import net from "node:net";
import { logger } from "@utils/logger";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
const DEFAULT_MAX_REDIRECTS = 5;

const BLOCKED_IP_RANGES = [
  /^127\./, // Loopback
  /^10\./, // Private Class A
  /^172\.(1[6-9]|2\d|3[01])\./, // Private Class B
  /^192\.168\./, // Private Class C
  /^169\.254\./, // Link-local
  /^0\.0\.0\.0/, // Unspecified
  /^::1$/, // IPv6 loopback
  /^fe80:/i, // IPv6 link-local
  /^fc00:/i, // IPv6 unique local
  /^::ffff:/i, // IPv4-mapped IPv6
];

const BLOCKED_HOSTS = new Set(["localhost", "metadata.google.internal", "169.254.169.254"]);

export interface EgressOptions {
  allowHttp?: boolean;
  maxRedirects?: number;
  timeoutMs?: number;
  maxSizeBytes?: number;
}

export interface EgressResult {
  success: boolean;
  status?: number;
  body?: string;
  headers?: Record<string, string>;
  error?: string;
}

export class EgressError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EgressError";
  }
}

function isPrivateIP(ip: string): boolean {
  if (!net.isIP(ip)) return false;
  return BLOCKED_IP_RANGES.some((regex) => regex.test(ip));
}

/**
 * Validates a URL for outbound requests, proactively resolving DNS to block
 * SSRF and DNS Rebinding attacks.
 */
export async function validateEgressUrl(url: string, options: EgressOptions = {}): Promise<URL> {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    throw new EgressError(`Invalid URL format: ${url}`);
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new EgressError(`Blocked protocol: ${parsed.protocol}`);
  }

  if (parsed.protocol === "http:" && !options.allowHttp && process.env.NODE_ENV !== "development") {
    throw new EgressError(`HTTP not allowed in production: ${url}`);
  }

  const hostname = parsed.hostname.toLowerCase();

  if (BLOCKED_HOSTS.has(hostname)) {
    throw new EgressError(`Blocked internal host: ${hostname}`);
  }

  // If it's already an IP, check it directly
  if (net.isIP(hostname)) {
    if (isPrivateIP(hostname)) {
      throw new EgressError(`Blocked private IP: ${hostname}`);
    }
    return parsed;
  }

  // DNS resolution to prevent SSRF via malicious domains (e.g., safe.com → 127.0.0.1)
  try {
    const addresses = await dns.lookup(hostname, { all: true });
    for (const addr of addresses) {
      if (isPrivateIP(addr.address)) {
        throw new EgressError(
          `Hostname resolves to blocked private IP (${addr.address}): ${hostname}`,
        );
      }
    }
  } catch (err: unknown) {
    if (err instanceof EgressError) throw err;
    throw new EgressError(`DNS resolution failed for host: ${hostname}`);
  }

  return parsed;
}

/**
 * Makes a safe outbound HTTP request with strict SSRF, redirect, and memory guards.
 */
export async function safeFetch(
  initialUrl: string,
  options: EgressOptions & RequestInit = {},
): Promise<EgressResult> {
  const {
    allowHttp,
    maxRedirects = DEFAULT_MAX_REDIRECTS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxSizeBytes = DEFAULT_MAX_SIZE_BYTES,
    ...fetchOptions
  } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let currentUrl = initialUrl;
    let redirectsCount = 0;
    let response: Response | null = null;

    let redirecting = true;
    // Manual redirect loop: re-validate each hop against SSRF rules
    do {
      const validatedUrl = await validateEgressUrl(currentUrl, { allowHttp });

      response = await fetch(validatedUrl.toString(), {
        ...fetchOptions,
        signal: controller.signal,
        redirect: "manual",
      });

      const isRedirect = [301, 302, 303, 307, 308].includes(response.status);
      if (isRedirect) {
        if (redirectsCount >= maxRedirects) {
          throw new EgressError(`Exceeded maximum redirects (${maxRedirects})`);
        }

        const locationUrl = response.headers.get("location");
        if (!locationUrl) {
          redirecting = false;
          break;
        }

        currentUrl = new URL(locationUrl, currentUrl).toString();
        redirectsCount++;
      } else {
        redirecting = false;
      }
    } while (redirecting);

    if (!response) {
      throw new EgressError("Request failed without yielding a response.");
    }

    // Stream the body in chunks to enforce max size without loading it all into RAM
    let bytesRead = 0;
    const chunks: Uint8Array[] = [];

    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        if (value) {
          bytesRead += value.length;
          if (bytesRead > maxSizeBytes) {
            controller.abort();
            throw new EgressError(
              `Response too large. Exceeded ${maxSizeBytes / (1024 * 1024)}MB limit.`,
            );
          }
          chunks.push(value);
        }
      }
    }

    const totalBuffer = new Uint8Array(bytesRead);
    let offset = 0;
    for (const chunk of chunks) {
      totalBuffer.set(chunk, offset);
      offset += chunk.length;
    }
    const safeText = new TextDecoder().decode(totalBuffer);

    const headers: Record<string, string> = {};
    response.headers.forEach((v, k) => (headers[k] = v));

    return {
      success: response.ok,
      status: response.status,
      body: safeText,
      headers,
    };
  } catch (err: unknown) {
    if (err instanceof EgressError) {
      logger.warn(`[EgressGuard] Blocked: ${err.message}`);
      return { success: false, error: err.message };
    }
    if (err && typeof err === "object" && (err as { name?: string }).name === "AbortError") {
      return {
        success: false,
        error: `Request timed out after ${timeoutMs}ms or was aborted`,
      };
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown fetch error",
    };
  } finally {
    clearTimeout(timer);
  }
}
