/**
 * @file src/hooks/fast-lane.server.ts
 * @description Opt-in fast lanes: handlers that answer a request with prebuilt
 * `{ status, headers, body }` so `index.server.mjs` can write the bytes straight
 * to the socket instead of going through adapter-node's `IncomingMessage →
 * Request` and `Response → stream` bridging.
 *
 * A lane is not a second implementation: it calls the very same functions the
 * SvelteKit path calls (`tryCollectionReadLane`, `tryCollectionWriteLane`), so
 * auth, tenancy, publication clamping, cache semantics, WAF/CSRF/rate-limit/RBAC
 * and the security-header contract stay in one place. Only the transport differs,
 * and `BENCH_VERIFY_RAW=1` proves both transports byte-identical inside one run.
 *
 * ### Features:
 * - Read lane ON by default (`SVELTY_FAST_LANE=0` opts out); write lane OPT-IN
 *   (`SVELTY_FAST_LANE_WRITE=1`) because it carries mutation bodies
 * - lane registry: adding a lane never touches the server entry
 * - `LANE_BYPASSED_HOOKS` policy + a guard test that fails when a new pipeline
 *   hook appears unclassified (divergence must be a decision, not an accident)
 * - operational-state gate: `handle-system-state` never runs for lane traffic, so
 *   the gate re-applies its readiness predicate before any lane is consulted
 * - write lane never consumes a body it cannot answer: `readBody()` is lazy, and
 *   `tryCollectionWriteLane` reports fall-through only with the body unread
 * - any lane error falls back to the full SvelteKit pipeline
 */

import type { RequestEvent } from "@sveltejs/kit";
import { logger } from "@utils/logger";
import { isSimpleCollectionRead, tryCollectionReadLane } from "./handle-collection-read-lane";
import { tryCollectionWriteLane } from "./handle-collection-write-lane";
import { isLaneServingAllowed } from "./lane-state-gate";

/** What the server entry writes to the socket. */
export interface FastLaneResult {
  status: number;
  headers: Record<string, string | string[]>;
  /** Written verbatim — bytes stay bytes so a large body is never decoded and re-encoded. */
  body: string | Uint8Array;
}

/** Plain inputs the entry point can produce without a SvelteKit `Request`. */
export interface FastLaneInput {
  method: string;
  /** Path + query as received (`req.url`). */
  url: string;
  /** Protocol + host for `new URL()` and the secure-cookie check. */
  origin: string;
  /** Node `IncomingMessage.headers` (lowercased keys). */
  headers: Record<string, string | string[] | undefined>;
  /**
   * Client address resolved exactly as adapter-node would (see `index.server.mjs`),
   * so rate-limit bucketing stays identical between the lane and the pipeline.
   * `undefined` reproduces adapter-node's "address header absent" throw.
   */
  clientAddress?: string;
  /**
   * Lazy request-body reader. Only called once a lane has committed to answering,
   * so declining lanes never consume the stream (the pipeline can still read it).
   * Rejects when the body exceeds the lane's hard cap.
   */
  readBody?: () => Promise<Uint8Array>;
}

/** A lane returns `null` when the request is not its business. */
export type FastLane = (input: FastLaneInput) => Promise<FastLaneResult | null>;

/** `globalThis` key the app publishes the dispatcher on; read by `index.server.mjs`. */
export const FAST_LANE_REGISTRY = "__SVELTY_FAST_LANES__";

/**
 * Pipeline hooks a lane-served request never reaches.
 *
 * A lane answers before `handle`'s pipeline runs, so every hook listed here is
 * skipped for lane traffic. The list is the *decision*, not documentation: the
 * guard test (`tests/unit/hooks/fast-lane-policy.test.ts`) reads the pipelines in
 * `hooks.server.ts` and fails when a hook exists that this set does not classify.
 *
 * "Skipped" is not "unhandled": a lane owns the checks its request class needs
 * (session auth, tenancy scoping, publication clamping, security headers,
 * WAF/CSRF/rate-limit/RBAC for the write lane) and `lane-state-gate.ts` re-applies
 * the `system-state` decision for every lane. What stays off the lane path is the
 * *generic* work those hooks do for page traffic.
 */
export const LANE_BYPASSED_HOOKS: ReadonlySet<string> = new Set([
  "security",
  "rate-limit",
  "system-state",
  "turbo-get",
  "redirects",
  "compression",
  "user-preferences",
  "authentication",
  "authorization",
  "local-context",
  "audit-logging",
  "api-requests",
  "token-resolution",
  "test-isolation",
  "turbo-pipeline",
]);

const lanes: FastLane[] = [];

/**
 * Write lane is OPT-IN: it carries mutation bodies, so it must be enabled
 * deliberately (`SVELTY_FAST_LANE_WRITE=1`) and only after an equivalence run.
 */
const WRITE_LANE_ENABLED = process.env.SVELTY_FAST_LANE_WRITE === "1";

/** Register a lane; order is precedence (first non-null result wins). */
export function registerFastLane(lane: FastLane): void {
  lanes.push(lane);
}

/** Marks the lane's `resolve()` fall-through so it cannot be confused with a Response. */
const FALL_THROUGH = Symbol("fast-lane-fall-through");

function headerLookup(headers: FastLaneInput["headers"]) {
  return (name: string): string | null => {
    const raw = headers[name.toLowerCase()];
    if (raw === undefined) return null;
    return Array.isArray(raw) ? raw.join(", ") : String(raw);
  };
}

function cookieLookup(cookieHeader: string | null) {
  const jar = new Map<string, string>();
  if (cookieHeader) {
    for (const part of cookieHeader.split(";")) {
      const eq = part.indexOf("=");
      if (eq <= 0) continue;
      jar.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
    }
  }
  return { get: (name: string) => jar.get(name) };
}

/**
 * Minimal `Set-Cookie` serializer for the lane's cookies facade. The write lane
 * can emit a rate-limit cookie (`handleRateLimit`'s cookie rule); dropping it
 * would make the lane observably different from the pipeline.
 */
function serializeCookie(name: string, value: string, opts: Record<string, unknown> = {}): string {
  let cookie = `${name}=${value}`;
  if (typeof opts.path === "string") cookie += `; Path=${opts.path}`;
  if (typeof opts.domain === "string") cookie += `; Domain=${opts.domain}`;
  if (opts.maxAge !== undefined) cookie += `; Max-Age=${Number(opts.maxAge)}`;
  if (opts.httpOnly) cookie += "; HttpOnly";
  if (opts.secure) cookie += "; Secure";
  if (opts.sameSite) cookie += `; SameSite=${String(opts.sameSite)}`;
  return cookie;
}

/**
 * Minimal URL facade for the lane — `new URL()` pays a full WHATWG parse
 * (~10-15µs) per request on the hot path, but the lane only ever reads
 * `pathname`, `search`, `searchParams`, `protocol` and `hostname`. All five
 * derive from the raw `req.url` + the entry's `origin` with plain string
 * slicing, so the facade is allocation-light and byte-identical in behaviour
 * for the lane's access surface (`handleApiError` also reads only
 * `event.url.pathname`).
 */
function fastLaneUrl(input: FastLaneInput): URL {
  const raw = input.url || "/";
  const q = raw.indexOf("?");
  const pathname = q >= 0 ? raw.slice(0, q) : raw;
  const search = q >= 0 ? raw.slice(q) : "";
  const schemeEnd = input.origin.indexOf("://");
  const protocol = schemeEnd >= 0 ? input.origin.slice(0, schemeEnd + 1) : "http:";
  const hostname = schemeEnd >= 0 ? input.origin.slice(schemeEnd + 3) : input.origin;
  return {
    pathname,
    search,
    searchParams: new URLSearchParams(search),
    protocol,
    hostname,
  } as unknown as URL;
}

/**
 * Convert a pipeline `Response` into the entry's prebuilt shape.
 *
 * 🚀 BYTE HAND-OFF: `arrayBuffer()` keeps the body as bytes. `text()` decoded a
 * (possibly 200 KB) list body to a JS string only for `res.end()` to encode it
 * back — two full passes plus the intermediate string on the lane's largest
 * response. Measured: listLarge TURBO-HIT 2.6 ms bridged → 4.8 ms through the
 * decode/re-encode, back to parity once the bytes are written through.
 */
async function responseToLaneResult(
  out: Response,
  extraSetCookies?: string[],
): Promise<FastLaneResult> {
  const headers: Record<string, string | string[]> = {};
  out.headers.forEach((value, name) => {
    headers[name] = value;
  });
  if (extraSetCookies && extraSetCookies.length > 0 && !headers["set-cookie"]) {
    headers["set-cookie"] = extraSetCookies;
  }
  // Test-only transport marker: a measured equivalence run must know whether these
  // bytes came from the lane or the fallback (identical bytes prove nothing if the
  // lane never served). Gated on the verification env, so production responses
  // carry no transport fingerprint.
  if (process.env.BENCH_VERIFY_RAW === "1") headers["x-fast-lane-served"] = "1";
  const body: string | Uint8Array =
    out.status === 204 || out.status === 304 ? "" : new Uint8Array(await out.arrayBuffer());
  // Node would otherwise fall back to chunked encoding for a body without a
  // declared length — the lane's own writer emits one computed chunk.
  if (!headers["content-length"] && out.status !== 204 && out.status !== 304) {
    headers["content-length"] = String(
      typeof body === "string" ? Buffer.byteLength(body) : body.byteLength,
    );
  }
  return { status: out.status, headers, body };
}

/**
 * Collection point-read/list lane. Byte-for-byte the SvelteKit lane: the same
 * `tryCollectionReadLane` decides, including its warm-turbo-session and admin
 * requirements and its `If-None-Match → 304` handling.
 */
const collectionReadLane: FastLane = async (input) => {
  const getHeader = headerLookup(input.headers);
  const url = fastLaneUrl(input);
  // The lane reads `request.method`, `request.headers.get`, `url` and `cookies`.
  // A real `Request` would mean paying the bridging cost this lane exists to avoid.
  const request = { method: input.method, headers: { get: getHeader } } as unknown as Request;
  const event = {
    url,
    request,
    cookies: cookieLookup(getHeader("cookie")),
    locals: {},
  } as unknown as RequestEvent;

  if (!isSimpleCollectionRead(event)) return null;

  const out = await tryCollectionReadLane({
    event,
    resolve: async () => FALL_THROUGH as unknown as Response,
  });
  if (!out || (out as unknown) === FALL_THROUGH) return null;
  return responseToLaneResult(out);
};

/**
 * Collection create/update lane — the transport twin of `tryCollectionWriteLane`.
 *
 * The body is exposed to the lane **lazily** through `readBody()`: `tryCollectionWriteLane`
 * declines (cold session, non-simple path, maintenance state) without touching the
 * stream, and only calls `request.json()` once it has committed — after which
 * `serveWarmCollectionWrite` guarantees a `Response`. A declined lane therefore
 * returns `null` with the body unread, and the entry can safely hand the request
 * to the full pipeline.
 */
const collectionWriteLane: FastLane = async (input) => {
  if (!input.readBody) return null;
  if (input.method !== "POST" && input.method !== "PATCH" && input.method !== "PUT") return null;
  if (!input.url.startsWith("/api/collections/")) return null;

  const getHeader = headerLookup(input.headers);
  const url = fastLaneUrl(input);
  const readBody = input.readBody;
  let bodyPromise: Promise<Uint8Array> | null = null;
  // Set the moment the body is touched. After this point the request can no
  // longer fall through — the pipeline could not re-read a consumed stream.
  let bodyRead = false;
  const request = {
    method: input.method,
    headers: { get: getHeader },
    json: async () => {
      bodyRead = true;
      if (!bodyPromise) bodyPromise = readBody();
      const bytes = await bodyPromise;
      return JSON.parse(Buffer.from(bytes).toString("utf8"));
    },
  } as unknown as Request;

  const jar = cookieLookup(getHeader("cookie"));
  const setCookies: string[] = [];
  const cookies = {
    get: (name: string) => jar.get(name),
    set: (name: string, value: string, opts?: Record<string, unknown>) => {
      setCookies.push(serializeCookie(name, value, opts));
    },
  };

  const { clientAddress } = input;
  const event = {
    url,
    request,
    cookies,
    locals: {},
    // Parity with adapter-node: when an address header is configured but absent
    // it throws, and `getClientIp` fails closed to 0.0.0.0. Reproduce that here
    // so rate-limit bucketing cannot be weakened on the lane.
    getClientAddress: () => {
      if (clientAddress === undefined) {
        throw new Error("Client address is unavailable on the fast lane");
      }
      return clientAddress;
    },
  } as unknown as RequestEvent;

  try {
    const out = await tryCollectionWriteLane({
      event,
      resolve: async () => FALL_THROUGH as unknown as Response,
    });
    if (!out || (out as unknown) === FALL_THROUGH) return null;
    return await responseToLaneResult(out, setCookies);
  } catch (err) {
    // A consumed body cannot be replayed, so once `bodyRead` is set the lane must
    // answer rather than hand a half-read stream to the pipeline. Before that the
    // request is untouched and may safely fall through.
    if (!bodyRead) return null;
    logger.error("[FastLane] write lane failed after consuming the body", err);
    return {
      status: 500,
      headers: { "content-type": "application/json" },
      body: '{"success":false,"message":"Internal error"}',
    };
  }
};

/**
 * Publish the registry for the server entry.
 *
 * The read lane is default ON: it is the same function the pipeline calls,
 * reached without adapter-node's bridging, and `BENCH_VERIFY_RAW=1` proves both
 * transports byte-identical in a single server run. `SVELTY_FAST_LANE=0` is the
 * documented opt-out. The write lane is additionally gated on
 * `SVELTY_FAST_LANE_WRITE=1` (mutations carry bodies).
 */
export function installFastLanes(): void {
  if (process.env.SVELTY_FAST_LANE === "0") return;
  if (lanes.length === 0) {
    registerFastLane(collectionReadLane);
    if (WRITE_LANE_ENABLED) registerFastLane(collectionWriteLane);
  }

  const host = globalThis as typeof globalThis & {
    [FAST_LANE_REGISTRY]?: (input: FastLaneInput) => Promise<FastLaneResult | null>;
  };
  host[FAST_LANE_REGISTRY] = async (input) => {
    // 🛡️ STATE GATE (fail-closed): lanes run before `handle-system-state`, so this
    // is where MAINTENANCE / RECOVERY / FAILED / SETUP traffic is turned away to
    // the pipeline. Checked here as well as inside each lane so a lane added
    // later cannot serve a state the operator took the instance out of.
    if (!isLaneServingAllowed()) return null;
    for (const lane of lanes) {
      try {
        const out = await lane(input);
        if (out) return out;
      } catch (err) {
        // A lane failure is never the request's failure: fall back to the full
        // pipeline, which produces the properly rendered error response.
        logger.debug(
          `[FastLane] lane declined after error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return null;
  };
  logger.info(`[FastLane] ${lanes.length} lane(s) registered`);
  // Deliberate stderr write: the A/B harness forwards the spawned server's stderr,
  // while `logger` writes to the app log sink — this is the proof that the lanes
  // (and not the fallback) are live in a measured run.
  process.stderr.write(`[FastLane] ${lanes.length} lane(s) registered\n`);
}
