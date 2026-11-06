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
import { lookup as dnsCallbackLookup } from "node:dns";
import net from "node:net";
import { logger } from "@utils/logger";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
const DEFAULT_MAX_REDIRECTS = 5;
const PINNED_DNS_TTL_MS = 15_000;

interface DnsPinEntry {
  address: string;
  family: number;
  expiresAt: number;
}

const dnsPinCache = new Map<string, DnsPinEntry>();

/**
 * Pins a pre-resolved safe IP for a hostname to prevent DNS rebinding TOCTOU attacks
 * and eliminate secondary DNS lookup latency during outbound HTTP connections.
 */
export function pinDnsResolution(hostname: string, address: string, family = 4): void {
  const now = Date.now();
  dnsPinCache.set(hostname.toLowerCase(), {
    address,
    family,
    expiresAt: now + PINNED_DNS_TTL_MS,
  });
  if (dnsPinCache.size > 1000) {
    for (const [key, entry] of dnsPinCache) {
      if (entry.expiresAt <= now) dnsPinCache.delete(key);
    }
    if (dnsPinCache.size > 1000) {
      const oldest = dnsPinCache.keys().next().value;
      if (oldest) dnsPinCache.delete(oldest);
    }
  }
}

export function getPinnedDnsResolution(hostname: string): DnsPinEntry | null {
  const hit = dnsPinCache.get(hostname.toLowerCase());
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    dnsPinCache.delete(hostname.toLowerCase());
    return null;
  }
  return hit;
}

let pinnedFetchPromise: Promise<PinnedFetch | undefined> | null = null;

interface PinnedFetch {
  dispatcher: unknown;
  fetch: typeof globalThis.fetch;
}

/**
 * Node's built-in `fetch` uses its own bundled undici instance, which rejects a
 * dispatcher created by the npm `undici` package (`invalid onRequestStart method`).
 * Pair the pinned Agent with the matching undici `fetch`; on Bun (or when the
 * optional dependency is absent) fall back to the global fetch without pinning.
 */
async function getPinnedFetch(): Promise<PinnedFetch | undefined> {
  if (
    typeof process === "undefined" ||
    (process as { versions?: { bun?: string } }).versions?.bun
  ) {
    return undefined;
  }
  if (!pinnedFetchPromise) {
    pinnedFetchPromise = (async () => {
      try {
        const { Agent, fetch: undiciFetch } = await import("undici");
        const dispatcher = new Agent({
          connect: {
            lookup: ((
              hostname: string,
              opts: { all?: boolean } | undefined,
              cb: (
                err: Error | null,
                address: string | Array<{ address: string; family: number }>,
                family?: number,
              ) => void,
            ) => {
              const pinned = getPinnedDnsResolution(hostname);
              if (pinned) {
                if (opts?.all) {
                  cb(null, [{ address: pinned.address, family: pinned.family }], 0);
                } else {
                  cb(null, pinned.address, pinned.family);
                }
                return;
              }
              dnsCallbackLookup(
                hostname,
                opts as never,
                (
                  err: NodeJS.ErrnoException | null,
                  address: string | Array<{ address: string; family: number }>,
                  family?: number,
                ) => {
                  if (err) {
                    cb(err, "", 4);
                    return;
                  }
                  cb(null, address, family);
                },
              );
            }) as never,
          },
        });
        return {
          dispatcher,
          fetch: undiciFetch as unknown as typeof globalThis.fetch,
        };
      } catch (err) {
        logger.warn(
          "[EgressGuard] DNS pinning disabled: the optional `undici` package is unavailable or incompatible.",
          err,
        );
        return undefined;
      }
    })();
  }
  return pinnedFetchPromise;
}

const BLOCKED_IP_RANGES = [
  /^127\./, // Loopback
  /^10\./, // Private Class A
  /^172\.(1[6-9]|2\d|3[01])\./, // Private Class B
  /^192\.168\./, // Private Class C
  /^169\.254\./, // Link-local
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // CGNAT / shared address space (100.64.0.0/10)
  /^0\.0\.0\.0/, // Unspecified
  /^::1$/, // IPv6 loopback
  /^fe80:/i, // IPv6 link-local
  /^f[cd][0-9a-f]{2}:/i, // IPv6 unique local (fc00::/7 — covers fc00: … fdff:)
  /^fec0:/i, // IPv6 site-local (deprecated)
  /^::ffff:/i, // IPv4-mapped IPv6
];

const BLOCKED_HOSTS = new Set(["localhost", "metadata.google.internal", "169.254.169.254"]);

/**
 * Endpoints that stay blocked even when `allowPrivate` is set. Cloud metadata
 * and link-local/special-purpose addresses are never legitimate model hosts, so
 * the local-service opt-in must not re-open that SSRF path.
 */
const ALWAYS_BLOCKED_HOSTS = new Set(["metadata.google.internal", "169.254.169.254"]);
const ALWAYS_BLOCKED_IP_RANGES = [
  /^169\.254\./, // Link-local (includes the 169.254.169.254 metadata endpoint)
  /^fe80:/i, // IPv6 link-local
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // CGNAT / shared address space
  /^0\.0\.0\.0/, // Unspecified
];

// ─── Test-only egress allowlist ───────────────────────────────────────────────
// Zero-mock integration tests need a real local peer (the in-process OIDC
// server). Loopback is blocked by design, so a test can opt in to the *exact*
// origin it started. Registration is refused outside TEST_MODE /
// PLAYWRIGHT_TEST, so a production runtime can never widen the guard.
const TEST_ALLOWED_ORIGINS = new Set<string>();

/**
 * Allows the exact `origin` (scheme + host + port) until the returned disposer
 * runs. Test-only: throws unless TEST_MODE / PLAYWRIGHT_TEST is enabled.
 */
export function allowTestEgressOrigin(origin: string): () => void {
  if (process.env.TEST_MODE !== "true" && process.env.PLAYWRIGHT_TEST !== "true") {
    throw new Error(
      "allowTestEgressOrigin() is test-only (requires TEST_MODE=true or PLAYWRIGHT_TEST=true)",
    );
  }

  const key = new URL(origin).origin;
  TEST_ALLOWED_ORIGINS.add(key);

  return () => {
    TEST_ALLOWED_ORIGINS.delete(key);
  };
}

export interface EgressOptions {
  allowHttp?: boolean;
  /**
   * Opt-in SSRF relaxation for admin-configured local services (Ollama and
   * similar on-box/LAN model endpoints).
   *
   * When true, loopback and RFC1918/ULA addresses are accepted so a deployment
   * can reach a model server on localhost or the local network. Cloud metadata
   * and link-local/CGNAT ranges remain blocked unconditionally.
   *
   * Trust boundary: only pass this for URLs the deployment operator controls
   * through private settings or trusted connector config. Never pass it for
   * user-supplied or remote-import URLs — that would re-open the SSRF hole this
   * guard exists to close. It is deliberately NOT the default.
   */
  allowPrivate?: boolean;
  maxRedirects?: number;
  timeoutMs?: number;
  maxSizeBytes?: number;
  /** Allowed hostnames (exact string or RegExp) or a Set of allowed hostnames */
  allowedHosts?: (string | RegExp)[] | Set<string>;
  /** Allowed origin strings (e.g. 'https://api.example.com') or a Set of allowed origins */
  allowedOrigins?: string[] | Set<string>;
  /** Custom scope filter predicate receiving the parsed URL */
  urlScope?: (url: URL) => boolean;
  /**
   * Whether to forbid protocol downgrade (e.g. https: -> http:) on redirects.
   * Defaults to true.
   */
  disallowProtocolDowngrade?: boolean;
  /**
   * Test seam: replace the network implementation. When set, the pinned DNS
   * dispatcher is bypassed (unit tests stub this instead of opening sockets).
   * @internal
   */
  fetchImpl?: typeof fetch;
}

export interface EgressResult {
  success: boolean;
  status?: number;
  /** UTF-8 decoded body (legacy / text consumers). Prefer bodyBytes for binary. */
  body?: string;
  /** Raw response bytes — binary-safe for media downloads. */
  bodyBytes?: Uint8Array;
  headers?: Record<string, string>;
  error?: string;
}

export class EgressError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EgressError";
  }
}

/**
 * Collapse IPv4-mapped (`::ffff:a.b.c.d`) and deprecated IPv4-compatible
 * (`::a.b.c.d`) IPv6 literals to dotted IPv4 so the same range rules apply to
 * the embedded address. Without this, `::ffff:169.254.169.254` would bypass the
 * metadata checks (the URL parser normalises it to `::ffff:a9fe:a9fe`).
 */
function normalizeEmbeddedIPv4(ip: string): string {
  const lower = ip.toLowerCase();
  let rest: string;
  if (lower.startsWith("::ffff:")) rest = lower.slice("::ffff:".length);
  else if (lower.startsWith("::")) rest = lower.slice(2);
  else return ip;

  if (!rest) return ip;
  if (rest.includes(".")) return rest;

  const parts = rest.split(":");
  if (parts.length !== 2) return ip;

  const hi = Number.parseInt(parts[0], 16);
  const lo = Number.parseInt(parts[1], 16);
  if (Number.isNaN(hi) || Number.isNaN(lo)) return ip;

  return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
}

function isBlockedIP(ip: string, allowPrivate: boolean): boolean {
  if (!net.isIP(ip)) return false;
  const address = normalizeEmbeddedIPv4(ip);
  if (ALWAYS_BLOCKED_IP_RANGES.some((regex) => regex.test(address))) return true;
  if (allowPrivate) return false;
  return BLOCKED_IP_RANGES.some((regex) => regex.test(address));
}

/**
 * Validates a URL for outbound requests, proactively resolving DNS to block
 * SSRF and DNS Rebinding attacks.
 */
export async function validateEgressUrl(url: string, options: EgressOptions = {}): Promise<URL> {
  if (typeof url === "string" && (url.trim().startsWith("//") || url.trim().startsWith("/\\"))) {
    throw new EgressError(`Protocol-relative URL forbidden: ${url}`);
  }

  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    throw new EgressError(`Invalid URL format: ${url}`);
  }

  // Test-only exact-origin allowance for in-process peers (see
  // allowTestEgressOrigin). Checked before the protocol/host rules so a local
  // http test server can be reached without widening them for anything else.
  if (TEST_ALLOWED_ORIGINS.has(parsed.origin)) return parsed;

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new EgressError(`Blocked protocol: ${parsed.protocol}`);
  }

  if (parsed.protocol === "http:" && !options.allowHttp && process.env.NODE_ENV !== "development") {
    throw new EgressError(`HTTP not allowed in production: ${url}`);
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const allowPrivate = options.allowPrivate === true;

  if (ALWAYS_BLOCKED_HOSTS.has(hostname)) {
    throw new EgressError(`Blocked internal host: ${hostname}`);
  }
  if (allowPrivate && BLOCKED_HOSTS.has(hostname)) {
    // Only `localhost` remains here (metadata hosts are always blocked above).
    // It is a loopback alias, so skip DNS — minimal containers may not resolve it.
    return parsed;
  }
  if (BLOCKED_HOSTS.has(hostname)) {
    throw new EgressError(`Blocked internal host: ${hostname}`);
  }

  // Scope constraints: allowedOrigins, allowedHosts, urlScope
  if (options.allowedOrigins) {
    const originMatched =
      options.allowedOrigins instanceof Set
        ? options.allowedOrigins.has(parsed.origin)
        : options.allowedOrigins.includes(parsed.origin);
    if (!originMatched) {
      throw new EgressError(`Origin not in allowedOrigins list: ${parsed.origin}`);
    }
  }

  if (options.allowedHosts) {
    let hostMatched = false;
    if (options.allowedHosts instanceof Set) {
      hostMatched = options.allowedHosts.has(hostname);
    } else {
      hostMatched = options.allowedHosts.some((pattern) => {
        if (typeof pattern === "string") return pattern.toLowerCase() === hostname;
        return pattern.test(hostname);
      });
    }
    if (!hostMatched) {
      throw new EgressError(`Hostname not in allowedHosts list: ${hostname}`);
    }
  }

  if (options.urlScope && !options.urlScope(parsed)) {
    throw new EgressError(`URL does not satisfy urlScope predicate: ${parsed.href}`);
  }

  // If it's already an IP, check it directly and pin the literal so the
  // connector cannot re-resolve anything else for this request.
  if (net.isIP(hostname)) {
    if (isBlockedIP(hostname, allowPrivate)) {
      throw new EgressError(`Blocked private IP: ${hostname}`);
    }
    pinDnsResolution(hostname, hostname, net.isIPv6(hostname) ? 6 : 4);
    return parsed;
  }

  // DNS resolution to prevent SSRF via malicious domains (e.g., safe.com → 127.0.0.1)
  let safeAddress: string | null = null;
  let safeFamily = 4;
  try {
    const addresses = await dns.lookup(hostname, { all: true });
    for (const addr of addresses) {
      if (isBlockedIP(addr.address, allowPrivate)) {
        throw new EgressError(
          `Hostname resolves to blocked private IP (${addr.address}): ${hostname}`,
        );
      }
      if (!safeAddress) {
        safeAddress = addr.address;
        safeFamily = addr.family || 4;
      }
    }
  } catch (err: unknown) {
    if (err instanceof EgressError) throw err;
    throw new EgressError(`DNS resolution failed for host: ${hostname}`);
  }

  if (safeAddress) {
    pinDnsResolution(hostname, safeAddress, safeFamily);
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
    allowPrivate,
    maxRedirects = DEFAULT_MAX_REDIRECTS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxSizeBytes = DEFAULT_MAX_SIZE_BYTES,
    allowedHosts,
    allowedOrigins,
    urlScope,
    disallowProtocolDowngrade = true,
    fetchImpl,
    ...fetchOptions
  } = options;

  const egressOpts: EgressOptions = {
    allowHttp,
    allowPrivate,
    maxRedirects,
    timeoutMs,
    maxSizeBytes,
    allowedHosts,
    allowedOrigins,
    urlScope,
    disallowProtocolDowngrade,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let currentUrl = initialUrl;
    let redirectsCount = 0;
    let response: Response | null = null;
    let initialProtocol: string | null = null;

    let redirecting = true;
    // Manual redirect loop: re-validate each hop against SSRF rules & scopes
    do {
      const validatedUrl = await validateEgressUrl(currentUrl, egressOpts);

      if (!initialProtocol) {
        initialProtocol = validatedUrl.protocol;
      } else if (
        disallowProtocolDowngrade &&
        initialProtocol === "https:" &&
        validatedUrl.protocol === "http:"
      ) {
        throw new EgressError("Redirect protocol downgrade forbidden: https: -> http:");
      }

      const pinned = fetchImpl ? undefined : await getPinnedFetch();
      const fetchToUse = fetchImpl ?? pinned?.fetch ?? fetch;
      const fetchInit: RequestInit & { dispatcher?: unknown } = {
        ...fetchOptions,
        signal: controller.signal,
        redirect: "manual",
      };
      if (pinned) {
        fetchInit.dispatcher = pinned.dispatcher;
      }

      response = await fetchToUse(validatedUrl.toString(), fetchInit as RequestInit);

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
    // Text decode for string consumers; bodyBytes remains authoritative for binary media
    const safeText = new TextDecoder("utf-8", { fatal: false }).decode(totalBuffer);

    const headers: Record<string, string> = {};
    response.headers.forEach((v, k) => (headers[k] = v));

    return {
      success: response.ok,
      status: response.status,
      body: safeText,
      bodyBytes: totalBuffer,
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
