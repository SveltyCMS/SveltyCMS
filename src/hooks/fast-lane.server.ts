/**
 * @file src/hooks/fast-lane.server.ts
 * @description Opt-in fast lanes: handlers that answer a request with prebuilt
 * `{ status, headers, body }` so `index.server.mjs` can write the bytes straight
 * to the socket instead of going through adapter-node's `IncomingMessage →
 * Request` and `Response → stream` bridging.
 *
 * A lane is not a second implementation: it calls the very same functions the
 * SvelteKit path calls (here: `tryCollectionReadLane`), so auth, tenancy,
 * publication clamping, cache semantics and the security-header contract stay in
 * one place. Only the transport differs, and `BENCH_VERIFY_RAW=1` proves both
 * transports byte-identical inside a single server run.
 *
 * ### Features:
 * - `SVELTY_FAST_LANE=1` registers the lanes; unset ⇒ one env read at boot
 * - lane registry: adding a lane never touches the server entry
 * - `LANE_BYPASSED_HOOKS` policy + a guard test that fails when a new pipeline
 *   hook appears unclassified (divergence must be a decision, not an accident)
 * - any lane error falls back to the full SvelteKit pipeline
 */

import type { RequestEvent } from "@sveltejs/kit";
import { logger } from "@utils/logger";
import { isSimpleCollectionRead, tryCollectionReadLane } from "./handle-collection-read-lane";

/** What the server entry writes to the socket. */
export interface FastLaneResult {
  status: number;
  headers: Record<string, string>;
  body: string;
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
 * Collection point-read/list lane. Byte-for-byte the SvelteKit lane: the same
 * `tryCollectionReadLane` decides, including its warm-turbo-session and admin
 * requirements and its `If-None-Match → 304` handling.
 */
const collectionReadLane: FastLane = async (input) => {
  const getHeader = headerLookup(input.headers);
  const url = new URL(input.url, input.origin);
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

  const headers: Record<string, string> = {};
  out.headers.forEach((value, name) => {
    headers[name] = value;
  });
  const body = out.status === 204 || out.status === 304 ? "" : await out.text();
  // Node would otherwise fall back to chunked encoding for a body without a
  // declared length — the lane's own writer emits one computed chunk.
  if (!headers["content-length"] && out.status !== 204 && out.status !== 304) {
    headers["content-length"] = String(Buffer.byteLength(body));
  }
  return { status: out.status, headers, body };
};

/**
 * Publish the registry for the server entry. No-op unless `SVELTY_FAST_LANE=1`,
 * so a default boot installs nothing and the entry's dispatch is a no-op.
 */
export function installFastLanes(): void {
  if (process.env.SVELTY_FAST_LANE !== "1") return;
  if (lanes.length === 0) registerFastLane(collectionReadLane);

  const host = globalThis as typeof globalThis & {
    [FAST_LANE_REGISTRY]?: (input: FastLaneInput) => Promise<FastLaneResult | null>;
  };
  host[FAST_LANE_REGISTRY] = async (input) => {
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
  logger.info(`[FastLane] ${lanes.length} lane(s) registered (SVELTY_FAST_LANE=1)`);
  // Deliberate stderr write: the A/B harness forwards the spawned server's stderr,
  // while `logger` writes to the app log sink — this is the proof that the lanes
  // (and not the fallback) are live in a measured run.
  process.stderr.write(`[FastLane] ${lanes.length} lane(s) registered\n`);
}
