/**
 * @file src/utils/idempotency.ts
 * @description 24-hour Idempotency-Key request deduplication and replay cache for POST mutations.
 *
 * Prevents duplicate writes across network retries and double-submits while
 * rejecting conflicting payload reuse on the same key with HTTP 409.
 *
 * ### Features:
 * - Zero-allocation fast path when `Idempotency-Key` header is absent or method != POST
 * - Canonical SHA-256 payload fingerprinting (key-order invariant)
 * - In-flight concurrent duplicate coalescing (singleflight)
 * - 24h (`86400s`) L1/L2 cached replay via `cacheService` with `X-Idempotency-Replayed: true`
 * - Tenant + actor + route path scoping to prevent cross-tenant or cross-user leakage
 */

import type { DatabaseId } from "@src/content/types";
import { cacheService } from "@src/databases/cache/cache-service";
import { CacheCategory } from "@src/databases/cache/types";
import type { RequestEvent } from "@sveltejs/kit";
import { raise } from "@utils/error-handling";
import { logger } from "@utils/logger";
import { hashCredentialSha256HexSync } from "@utils/security/credential-hash";
import { assertSafeJsonObject, JsonGuardError } from "@utils/security/json-guard";

/** Default 24-hour idempotency replay window in seconds. */
export const IDEMPOTENCY_TTL_SECONDS = 86_400;

/** Maximum accepted header length to bound cache key memory. */
export const MAX_IDEMPOTENCY_KEY_LENGTH = 256;

/** Maximum serialized response body size cached per idempotency entry (2 MiB). */
const MAX_CACHED_BODY_BYTES = 2 * 1024 * 1024;

export interface CachedIdempotencyRecord {
  requestHash: string;
  status: number;
  contentType: string;
  body: string;
}

interface InFlightIdempotencyEntry {
  requestHash: string;
  promise: Promise<CachedIdempotencyRecord | null>;
}

const inFlightRequests = new Map<string, InFlightIdempotencyEntry>();

/**
 * Read and validate the `Idempotency-Key` header when present.
 * Returns `null` when absent (or blank whitespace); throws 400 if oversized.
 */
export function readIdempotencyKey(request: Request): string | null {
  const raw = request.headers.get("idempotency-key");
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    raise(
      400,
      `Idempotency-Key exceeds maximum length of ${MAX_IDEMPOTENCY_KEY_LENGTH} characters`,
      "INVALID_IDEMPOTENCY_KEY",
    );
  }
  return trimmed;
}

/** Deterministic canonical JSON serialization for request body fingerprinting. */
function canonicalizeValue(value: unknown, seen: WeakSet<object>): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (seen.has(value)) {
    return '"[Circular]"';
  }
  seen.add(value);

  try {
    if (value instanceof Date) {
      return JSON.stringify(value.toISOString());
    }
    if (Array.isArray(value)) {
      let out = "[";
      for (let i = 0; i < value.length; i++) {
        if (i > 0) out += ",";
        out += value[i] === undefined ? "null" : canonicalizeValue(value[i], seen);
      }
      return `${out}]`;
    }
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    let out = "{";
    let wrote = false;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const v = obj[k];
      if (v === undefined || typeof v === "function" || typeof v === "symbol") continue;
      if (wrote) out += ",";
      out += `${JSON.stringify(k)}:${canonicalizeValue(v, seen)}`;
      wrote = true;
    }
    return `${out}}`;
  } finally {
    seen.delete(value);
  }
}

/** Hash a parsed JSON request payload canonically (key-order invariant). */
export function fingerprintIdempotentPayload(payload: unknown): string {
  const canonical = canonicalizeValue(payload, new WeakSet());
  return hashCredentialSha256HexSync(canonical);
}

function buildCacheKey(rawKey: string, actorId: string, method: string, pathname: string): string {
  const keyDigest = hashCredentialSha256HexSync(rawKey);
  return `idem:v1:${actorId}:${method}:${pathname}:${keyDigest}`;
}

function buildReplayResponse(record: CachedIdempotencyRecord): Response {
  const headers = new Headers();
  headers.set("content-type", record.contentType || "application/json");
  headers.set("x-idempotency-replayed", "true");
  return new Response(record.body, {
    status: record.status,
    headers,
  });
}

/**
 * Parse and safety-guard an incoming JSON POST body once, caching it on `event.locals.__parsedJsonBody`
 * so downstream create handlers do not attempt to re-read a consumed stream.
 */
export async function readAndCacheSafeIdempotentBody(event: RequestEvent): Promise<unknown> {
  const locals = event.locals as unknown as { __parsedJsonBody?: unknown };
  if (locals.__parsedJsonBody !== undefined) {
    return locals.__parsedJsonBody;
  }
  const body = await event.request.json();
  try {
    assertSafeJsonObject(body);
  } catch (err) {
    if (err instanceof JsonGuardError) {
      raise(400, err.message, err.code);
    }
    throw err;
  }
  locals.__parsedJsonBody = body;
  return body;
}

/**
 * Execute a POST mutation with 24h `Idempotency-Key` deduplication.
 * Passes straight through with zero cache/hash overhead when no `Idempotency-Key` header is sent.
 */
export async function runIdempotentPost(
  event: RequestEvent,
  tenantId: DatabaseId | string | null | undefined,
  user: { _id?: DatabaseId | string | null } | null | undefined,
  payload: unknown,
  execute: () => Promise<Response>,
): Promise<Response> {
  if (event.request.method !== "POST") {
    return execute();
  }

  const rawKey = readIdempotencyKey(event.request);
  if (!rawKey) {
    return execute();
  }

  const requestHash = fingerprintIdempotentPayload(payload);
  const actorId = user?._id ? String(user._id) : "anon";
  const cacheKey = buildCacheKey(rawKey, actorId, "POST", event.url.pathname);
  const flightKey = `${tenantId ? String(tenantId) : "global"}|${cacheKey}`;
  const scopedTenant = (tenantId ?? undefined) as DatabaseId | undefined;

  // 1. Synchronous in-flight barrier BEFORE any await so concurrent duplicates coalesce cleanly.
  const active = inFlightRequests.get(flightKey);
  if (active) {
    if (active.requestHash !== requestHash) {
      raise(
        409,
        "Idempotency-Key already used with a different request payload",
        "IDEMPOTENCY_KEY_REUSE",
      );
    }
    const completed = await active.promise;
    if (completed) {
      return buildReplayResponse(completed);
    }
  }

  let resolveFlight!: (record: CachedIdempotencyRecord | null) => void;
  const flightPromise = new Promise<CachedIdempotencyRecord | null>((resolve) => {
    resolveFlight = resolve;
  });
  inFlightRequests.set(flightKey, { requestHash, promise: flightPromise });

  let settledRecord: CachedIdempotencyRecord | null = null;
  try {
    // 2. Check L1/L2 24h idempotency cache inside the singleflight barrier.
    try {
      const cached = await cacheService.get<CachedIdempotencyRecord>(cacheKey, scopedTenant);
      if (cached) {
        if (cached.requestHash !== requestHash) {
          raise(
            409,
            "Idempotency-Key already used with a different request payload",
            "IDEMPOTENCY_KEY_REUSE",
          );
        }
        settledRecord = cached;
        return buildReplayResponse(cached);
      }
    } catch (err) {
      // Re-throw intentional 409 conflicts; degrade cache read failures gracefully.
      if (err && typeof err === "object" && "status" in err) {
        throw err;
      }
      logger.debug("[Idempotency] Cache lookup failed, executing handler", err);
    }

    // 3. Execute mutation once.
    const response = await execute();

    if (response.status >= 200 && response.status < 300) {
      try {
        const body = await response.clone().text();
        if (Buffer.byteLength(body, "utf8") <= MAX_CACHED_BODY_BYTES) {
          const record: CachedIdempotencyRecord = {
            requestHash,
            status: response.status,
            contentType: response.headers.get("content-type") || "application/json",
            body,
          };
          settledRecord = record;
          await cacheService
            .set(cacheKey, record, IDEMPOTENCY_TTL_SECONDS, scopedTenant, CacheCategory.API)
            .catch((err) => logger.debug("[Idempotency] Cache write failed", err));
        }
      } catch (err) {
        logger.debug("[Idempotency] Failed cloning response for cache", err);
      }
    }

    return response;
  } finally {
    inFlightRequests.delete(flightKey);
    resolveFlight(settledRecord);
  }
}
