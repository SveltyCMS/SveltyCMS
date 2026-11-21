/**
 * @file src/hooks/fast-lane.server.ts
 * @description Opt-in fast lanes: handlers that answer a request with prebuilt
 * `{ status, headers, body }` so the server entry can write the bytes straight
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
import type { Handle } from "@sveltejs/kit/hooks";
import { logger } from "@utils/logger";
import { isSecureCookieContext } from "@src/databases/auth/constants";
import { readSessionIdFromCookieHeader } from "@utils/security/session-cookie";
import { isSimpleCollectionRead, tryCollectionReadLane } from "./handle-collection-read-lane";
import { tryCollectionWriteLane, tryGraphqlWriteLane } from "./handle-collection-write-lane";
import { isLaneServingAllowed } from "./lane-state-gate";
import { RequestLane } from "./handle-request-classifier";

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
   * Client address resolved exactly as adapter-node would,
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

/** A lane returns `null` when the request is not its business. May settle synchronously on L1 HITs / fast exits. */
export type FastLane = (
  input: FastLaneInput,
) => FastLaneResult | null | Promise<FastLaneResult | null>;

/** `globalThis` key the app publishes the dispatcher on; read by the server entry. */
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
 * Write lane is default ON: it shares the same checks (WAF, CSRF, rate-limit,
 * turbo-auth, audit log parity) as the SvelteKit pipeline. `SVELTY_FAST_LANE_WRITE=0`
 * opts out.
 */
const WRITE_LANE_ENABLED = process.env.SVELTY_FAST_LANE_WRITE !== "0";

/** Register a lane; order is precedence (first non-null result wins). */
export function registerFastLane(lane: FastLane): void {
  lanes.push(lane);
}

/** Test-only helper to reset registered lanes between tests. */
export function resetFastLanesForTest(): void {
  lanes.length = 0;
}

/** Marks the lane's `resolve()` fall-through so it cannot be confused with a Response. */
const FALL_THROUGH = Symbol("fast-lane-fall-through");
const FALL_THROUGH_PROMISE = Promise.resolve(FALL_THROUGH as unknown as Response);
const FALL_THROUGH_RESOLVE = () => FALL_THROUGH_PROMISE;

const IS_BENCH_VERIFY_RAW = process.env.BENCH_VERIFY_RAW === "1";

/** Prototype-based read-only request header bag (avoids per-request closure allocation). */
class FastRequestHeaders {
  private readonly _headers: FastLaneInput["headers"];

  constructor(headers: FastLaneInput["headers"]) {
    this._headers = headers;
  }

  get(name: string): string | null {
    const headers = this._headers;
    let raw = headers[name];
    if (raw === undefined) raw = headers[name.toLowerCase()];
    if (raw === undefined) return null;
    return Array.isArray(raw) ? raw.join(", ") : String(raw);
  }

  has(name: string): boolean {
    const headers = this._headers;
    return headers[name] !== undefined || headers[name.toLowerCase()] !== undefined;
  }

  forEach(cb: (val: string, key: string) => void): void {
    const headers = this._headers;
    for (const key in headers) {
      if (!Object.hasOwn(headers, key)) continue;
      const v = headers[key];
      if (v !== undefined) cb(Array.isArray(v) ? v.join(", ") : String(v), key);
    }
  }

  *[Symbol.iterator](): IterableIterator<[string, string]> {
    const headers = this._headers;
    for (const key in headers) {
      if (!Object.hasOwn(headers, key)) continue;
      const v = headers[key];
      if (v !== undefined) {
        yield [key, Array.isArray(v) ? v.join(", ") : String(v)];
      }
    }
  }
}

const EMPTY_COOKIE_JAR = { get: (_name: string): string | undefined => undefined };
let lastCookieHeader: string | null = null;
let lastCookieJar: { get: (name: string) => string | undefined } = EMPTY_COOKIE_JAR;

function cookieLookup(cookieHeader: string | null) {
  if (!cookieHeader) return EMPTY_COOKIE_JAR;
  if (cookieHeader === lastCookieHeader) return lastCookieJar;
  const jar = new Map<string, string>();
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    jar.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
  }
  const lookup = { get: (name: string) => jar.get(name) };
  lastCookieHeader = cookieHeader;
  lastCookieJar = lookup;
  return lookup;
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

const EMPTY_SEARCH_PARAMS = new URLSearchParams();

interface ParsedOrigin {
  origin: string;
  protocol: string;
  host: string;
  hostname: string;
  isSecure: boolean;
}

let lastParsedOrigin: ParsedOrigin = {
  origin: "",
  protocol: "http:",
  host: "",
  hostname: "",
  isSecure: false,
};

function parseOriginCached(origin: string): ParsedOrigin {
  if (origin === lastParsedOrigin.origin) return lastParsedOrigin;
  const schemeEnd = origin.indexOf("://");
  const protocol = schemeEnd >= 0 ? origin.slice(0, schemeEnd + 1) : "http:";
  const host = schemeEnd >= 0 ? origin.slice(schemeEnd + 3) : origin;
  const colon = host.indexOf(":");
  const hostname = colon >= 0 ? host.slice(0, colon) : host;
  lastParsedOrigin = {
    origin,
    protocol,
    host,
    hostname,
    isSecure: isSecureCookieContext(protocol, hostname),
  };
  return lastParsedOrigin;
}

/**
 * Minimal prototype-based URL facade for the lane — avoids WHATWG `new URL()`
 * (~10-15µs) and per-request getter property definitions while keeping a single
 * monomorphic V8 hidden class across every fast-lane request.
 */
class FastLaneUrl {
  public readonly pathname: string;
  public readonly search: string;
  public readonly origin: string;
  public readonly protocol: string;
  public readonly host: string;
  public readonly hostname: string;
  private readonly _raw: string;
  private _parsedParams: URLSearchParams | null;

  constructor(rawUrl: string, parsedOrigin: ParsedOrigin) {
    const raw = rawUrl || "/";
    const q = raw.indexOf("?");
    this._raw = raw;
    this.pathname = q >= 0 ? raw.slice(0, q) : raw;
    this.search = q >= 0 ? raw.slice(q) : "";
    this.origin = parsedOrigin.origin;
    this.protocol = parsedOrigin.protocol;
    this.host = parsedOrigin.host;
    this.hostname = parsedOrigin.hostname;
    this._parsedParams = this.search ? null : EMPTY_SEARCH_PARAMS;
  }

  get searchParams(): URLSearchParams {
    if (!this._parsedParams) this._parsedParams = new URLSearchParams(this.search);
    return this._parsedParams;
  }

  get href(): string {
    return `${this.origin}${this._raw}`;
  }
}

const utf8Decoder = new TextDecoder();

function decodeUtf8Bytes(bytes: Uint8Array): string {
  return Buffer.isBuffer(bytes) ? bytes.toString("utf8") : utf8Decoder.decode(bytes);
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
function finalizeLaneResult(
  status: number,
  headers: Record<string, string | string[]>,
  body: string | Uint8Array,
): FastLaneResult {
  // Node would otherwise fall back to chunked encoding for a body without a
  // declared length — the lane's own writer emits one computed chunk.
  if (!headers["content-length"] && status !== 204 && status !== 304) {
    headers["content-length"] = String(
      typeof body === "string" ? Buffer.byteLength(body) : body.byteLength,
    );
  }
  return { status, headers, body };
}

function responseToLaneResult(
  out: Response,
  extraSetCookies?: string[],
  lane?: RequestLane,
): FastLaneResult | Promise<FastLaneResult> {
  const fastHeaders = (out as unknown as { __fastHeaders?: Record<string, string | string[]> })
    .__fastHeaders;
  const liveHeaders = out.headers as unknown as {
    __backingRecord?: Record<string, string | string[]>;
    forEach?: (callback: (value: string, name: string) => void) => void;
  };
  let headers: Record<string, string | string[]>;
  if (fastHeaders && liveHeaders?.__backingRecord === fastHeaders) {
    // Zero-copy fast path: `createFastHeaders(fastRecord)` mutates `fastHeaders`
    // in place, so all live header mutations (`x-svelty-lane`, security headers,
    // `x-srv-split`/`x-srv-dur`, etag) are already in `fastHeaders`.
    headers = fastHeaders;
  } else {
    // Merge the LIVE response headers over the snapshot `buildJsonResponse`
    // captured when `out` is a standard `Response` with its own `Headers` bag.
    headers = fastHeaders ? { ...fastHeaders } : {};
    if (typeof liveHeaders?.forEach === "function") {
      liveHeaders.forEach((value, name) => {
        if (name === "set-cookie" && headers[name] !== undefined) return;
        headers[name] = value;
      });
    }
  }
  if (lane && !headers["x-svelty-lane"]) {
    headers["x-svelty-lane"] = lane;
  }
  if (extraSetCookies && extraSetCookies.length > 0 && !headers["set-cookie"]) {
    headers["set-cookie"] = extraSetCookies;
  }
  // Test-only transport marker: a measured equivalence run must know whether these
  // bytes came from the lane or the fallback (identical bytes prove nothing if the
  // lane never served). Gated on the verification env, so production responses
  // carry no transport fingerprint.
  if (IS_BENCH_VERIFY_RAW) headers["x-fast-lane-served"] = "1";
  if (out.status === 204 || out.status === 304) {
    return finalizeLaneResult(out.status, headers, "");
  }
  const fastBody = (out as unknown as { __fastBody?: string | Uint8Array }).__fastBody;
  if (fastBody !== undefined) {
    return finalizeLaneResult(out.status, headers, fastBody);
  }
  return out
    .arrayBuffer()
    .then((buf) => finalizeLaneResult(out.status, headers, new Uint8Array(buf)));
}

function parseUtf8Json(bytes: Uint8Array): unknown {
  return JSON.parse(decodeUtf8Bytes(bytes));
}

/** Prototype-based lazy-body request facade for write/GraphQL fast lanes (avoids per-request closures). */
class FastWriteRequest {
  public readonly method: string;
  public readonly headers: FastRequestHeaders;
  public readonly url?: string;
  private readonly _readBody: () => Promise<Uint8Array>;
  private _bodyPromise: Promise<Uint8Array> | null = null;
  public _bodyRead = false;

  constructor(
    method: string,
    headers: FastRequestHeaders,
    readBody: () => Promise<Uint8Array>,
    url?: string,
  ) {
    this.method = method;
    this.headers = headers;
    this._readBody = readBody;
    if (url !== undefined) this.url = url;
  }

  private _readBytes(): Promise<Uint8Array> {
    this._bodyRead = true;
    if (!this._bodyPromise) this._bodyPromise = this._readBody();
    return this._bodyPromise;
  }

  text(): Promise<string> {
    return this._readBytes().then(decodeUtf8Bytes);
  }

  json(): Promise<unknown> {
    return this._readBytes().then(parseUtf8Json);
  }
}

/** Prototype-based cookie facade for write/GraphQL fast lanes (captures Set-Cookie emissions). */
class FastWriteCookies {
  private readonly _jar: { get: (name: string) => string | undefined };
  public readonly _setCookies: string[] = [];

  constructor(jar: { get: (name: string) => string | undefined }) {
    this._jar = jar;
  }

  get(name: string): string | undefined {
    return this._jar.get(name);
  }

  set(name: string, value: string, opts?: Record<string, unknown>): void {
    this._setCookies.push(serializeCookie(name, value, opts));
  }
}

/**
 * Collection point-read/list lane. Byte-for-byte the SvelteKit lane: the same
 * `tryCollectionReadLane` decides, including its warm-turbo-session and admin
 * requirements and its `If-None-Match → 304` handling.
 */
const collectionReadLane: FastLane = (input) => {
  // Fast exit before any object allocation: avoids building URL/header/cookie
  // facades on every POST/PATCH/PUT collection write and GraphQL request.
  if (input.method !== "GET" && input.method !== "HEAD") return null;
  if (!input.url.startsWith("/api/collections/")) return null;

  const reqHeaders = new FastRequestHeaders(input.headers);
  const parsedOrigin = parseOriginCached(input.origin);
  const url = new FastLaneUrl(input.url, parsedOrigin) as unknown as URL;
  const rawCookie = reqHeaders.get("cookie");
  const turboSessionId = readSessionIdFromCookieHeader(rawCookie, parsedOrigin.isSecure);
  const cookies = cookieLookup(rawCookie);
  // The lane reads `request.method`, `request.headers.get`, `url` and `cookies`.
  // A real `Request` would mean paying the bridging cost this lane exists to avoid.
  const request = { method: input.method, headers: reqHeaders } as unknown as Request;
  const event = {
    url,
    request,
    cookies,
    locals: { __isFastLane: true, turboSessionId },
  } as unknown as RequestEvent;

  if (!isSimpleCollectionRead(event)) return null;

  const out = tryCollectionReadLane({
    event,
    resolve: FALL_THROUGH_RESOLVE,
  });
  if (out instanceof Promise) {
    return out.then((res) => {
      if (!res || (res as unknown) === FALL_THROUGH) return null;
      return responseToLaneResult(res, undefined, RequestLane.API_READ);
    });
  }
  if (!out || (out as unknown) === FALL_THROUGH) return null;
  return responseToLaneResult(out, undefined, RequestLane.API_READ);
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
function isGraphqlPostUrl(rawUrl: string): boolean {
  const q = rawUrl.indexOf("?");
  const pathname = q < 0 ? rawUrl : rawUrl.slice(0, q);
  return pathname === "/api/graphql" || pathname === "/api/graphql/";
}

async function runPostWriteLane(
  input: FastLaneInput,
  laneHandler: Handle,
  readTextToo = false,
): Promise<FastLaneResult | null> {
  if (!input.readBody) return null;
  const reqHeaders = new FastRequestHeaders(input.headers);
  const parsedOrigin = parseOriginCached(input.origin);
  const url = new FastLaneUrl(input.url, parsedOrigin) as unknown as URL;
  const fastRequest = new FastWriteRequest(
    input.method,
    reqHeaders,
    input.readBody,
    readTextToo ? `${input.origin}${input.url}` : undefined,
  );
  const request = fastRequest as unknown as Request;

  const rawCookie = reqHeaders.get("cookie");
  const turboSessionId = readSessionIdFromCookieHeader(rawCookie, parsedOrigin.isSecure);
  const cookies = new FastWriteCookies(cookieLookup(rawCookie));

  const { clientAddress } = input;
  const event = {
    url,
    request,
    cookies,
    locals: { __isFastLane: true, turboSessionId },
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
    const out = await laneHandler({
      event,
      resolve: FALL_THROUGH_RESOLVE,
    });
    if (!out || (out as unknown) === FALL_THROUGH) return null;
    const laneRes = responseToLaneResult(out, cookies._setCookies, RequestLane.API_WRITE);
    return laneRes instanceof Promise ? await laneRes : laneRes;
  } catch (err) {
    // A consumed body cannot be replayed, so once `_bodyRead` is set the lane must
    // answer rather than hand a half-read stream to the pipeline. Before that the
    // request is untouched and may safely fall through.
    if (!fastRequest._bodyRead) return null;
    logger.error("[FastLane] write lane failed after consuming the body", err);
    return {
      status: 500,
      headers: { "content-type": "application/json", "x-svelty-lane": RequestLane.API_WRITE },
      body: '{"success":false,"message":"Internal error"}',
    };
  }
}

const collectionWriteLane: FastLane = (input) => {
  if (input.method !== "POST" && input.method !== "PATCH" && input.method !== "PUT") return null;
  if (!input.url.startsWith("/api/collections/")) return null;
  return runPostWriteLane(input, tryCollectionWriteLane);
};

const graphqlWriteLane: FastLane = (input) => {
  if (input.method !== "POST") return null;
  if (!isGraphqlPostUrl(input.url)) return null;
  return runPostWriteLane(input, tryGraphqlWriteLane, true);
};

async function finishAsyncLanes(
  pending: Promise<FastLaneResult | null>,
  nextIdx: number,
  input: FastLaneInput,
): Promise<FastLaneResult | null> {
  try {
    const first = await pending;
    if (first) return first;
  } catch (err) {
    logger.debug(
      `[FastLane] lane declined after error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  for (let i = nextIdx; i < lanes.length; i++) {
    try {
      const raw = lanes[i]!(input);
      const out = raw instanceof Promise ? await raw : raw;
      if (out) return out;
    } catch (err) {
      logger.debug(
        `[FastLane] lane declined after error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return null;
}

const NULL_LANE_PROMISE: Promise<FastLaneResult | null> = Promise.resolve(null);

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
    if (WRITE_LANE_ENABLED) {
      registerFastLane(collectionWriteLane);
      registerFastLane(graphqlWriteLane);
    }
  }

  const host = globalThis as typeof globalThis & {
    [FAST_LANE_REGISTRY]?: (input: FastLaneInput) => Promise<FastLaneResult | null>;
  };
  host[FAST_LANE_REGISTRY] = (input) => {
    // 🛡️ STATE GATE (fail-closed): lanes run before `handle-system-state`, so this
    // is where MAINTENANCE / RECOVERY / FAILED / SETUP traffic is turned away to
    // the pipeline. Checked here as well as inside each lane so a lane added
    // later cannot serve a state the operator took the instance out of.
    if (!isLaneServingAllowed()) return NULL_LANE_PROMISE;
    for (let i = 0; i < lanes.length; i++) {
      try {
        const raw = lanes[i]!(input);
        if (raw instanceof Promise) {
          return finishAsyncLanes(raw, i + 1, input);
        }
        if (raw) return Promise.resolve(raw);
      } catch (err) {
        // A lane failure is never the request's failure: fall back to the full
        // pipeline, which produces the properly rendered error response.
        logger.debug(
          `[FastLane] lane declined after error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return NULL_LANE_PROMISE;
  };
  logger.info(`[FastLane] ${lanes.length} lane(s) registered`);
  // Deliberate stderr write: the external A/B harness forwards the spawned server's
  // stderr, while `logger` writes to the app log sink — this is the proof that the lanes
  // (and not the fallback) are live in a measured run. Production builds only: a dev
  // console already shows the logger line, and two identical lines per boot read as a bug.
  if (process.env.NODE_ENV === "production") {
    process.stderr.write(`[FastLane] ${lanes.length} lane(s) registered\n`);
  }
}
