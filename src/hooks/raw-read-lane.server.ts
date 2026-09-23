/**
 * @file src/hooks/raw-read-lane.server.ts
 * @description PROTOTYPE (opt-in, `SVELTY_RAW_READ_LANE=1`): serves the warm-session
 * point-read lane straight from `node:http`, skipping adapter-node's
 * `IncomingMessage → Request` and `Response → socket` bridging.
 *
 * The lane's own decisions (warm turbo session, admin only, cache, tenancy,
 * publication filter, security headers) are unchanged — this module calls the
 * very same `tryCollectionReadLane` with a plain-object event, so nothing about
 * auth or authorization is re-implemented here. Only the transport changes: the
 * server entry (`index.cjs` / `index.bun.ts`) writes the returned
 * `{ status, headers, body }` with `res.writeHead()` / `res.end()` and delegates
 * to the SvelteKit handler whenever this module returns `null`.
 *
 * Why a `globalThis` bridge: the fast path must share the running app's
 * singletons (db adapter, response cache, turbo auth context). A separate bundle
 * would get its own instances and silently serve stale/unauthorized data, so the
 * app publishes the bridge and the entry point — same process, same bundle graph
 * — calls it.
 *
 * ### Features:
 * - zero cost when `SVELTY_RAW_READ_LANE` is unset (one env read at boot)
 * - reuses `tryCollectionReadLane` verbatim; no duplicated authz or header logic
 * - falls through to the SvelteKit handler on any non-lane request or error
 *
 * @internal Prototype for the `findByIdRandom` competitive lane. Measure with a
 * paired A/B and a control lane before promoting it (see
 * `docs/project/roadmap-2026.mdx`); delete the bridge when the verdict is in.
 */

import type { RequestEvent } from "@sveltejs/kit";
import { logger } from "@utils/logger";
import { isSimpleCollectionRead, tryCollectionReadLane } from "./handle-collection-read-lane";

/** What the server entry writes to the socket. */
export interface RawLaneResult {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/** Plain inputs the entry point can produce without a SvelteKit `Request`. */
export interface RawLaneInput {
  method: string;
  /** Path + query as received (`req.url`). */
  url: string;
  /** Protocol + host for `new URL()` and the secure-cookie check. */
  origin: string;
  /** Node `IncomingMessage.headers` (lowercased keys). */
  headers: Record<string, string | string[] | undefined>;
}

type RawLaneBridge = (input: RawLaneInput) => Promise<RawLaneResult | null>;

const BRIDGE_KEY = "__SVELTY_RAW_LANE__";
let servedHits = 0;
/** Marks the lane's `resolve()` fall-through so it cannot be confused with a Response. */
const FALL_THROUGH = Symbol("raw-read-lane-fall-through");

function headerLookup(headers: RawLaneInput["headers"]) {
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

async function serveRawLane(input: RawLaneInput): Promise<RawLaneResult | null> {
  const getHeader = headerLookup(input.headers);
  const url = new URL(input.url, input.origin);
  // The lane reads `request.method`, `request.headers.get`, `url` and `cookies`.
  // A real `Request` would mean paying the bridging cost this prototype exists to
  // avoid, so the shim carries exactly those members.
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
  // Prototype marker: makes "was this served by the raw path?" answerable from
  // outside (the marker costs ~18 B on a ~1.9 KB body and is disclosed in the A/B).
  headers["x-raw-lane"] = "1";
  if (servedHits++ === 0) {
    // Deliberate stderr write: the A/B harness forwards the spawned server's
    // stderr, while `logger` writes to the app log sink — this line is the only
    // proof that the raw path (and not the fallback) served requests.
    process.stderr.write("[RawReadLane] first request served over the raw socket path\n");
  }
  const body = out.status === 204 || out.status === 304 ? "" : await out.text();
  // Node would otherwise fall back to chunked encoding for a body without a
  // declared length — the lane's own writer emits one computed chunk.
  if (!headers["content-length"] && out.status !== 204 && out.status !== 304) {
    headers["content-length"] = String(Buffer.byteLength(body));
  }
  return { status: out.status, headers, body };
}

/**
 * Publish the fast path for the server entry. No-op unless
 * `SVELTY_RAW_READ_LANE=1`, so a default boot installs nothing.
 */
export function installRawReadLane(): void {
  if (process.env.SVELTY_RAW_READ_LANE !== "1") return;
  const host = globalThis as typeof globalThis & { [BRIDGE_KEY]?: RawLaneBridge };
  host[BRIDGE_KEY] = serveRawLane;
  logger.info("[RawReadLane] prototype bridge installed (SVELTY_RAW_READ_LANE=1)");
  process.stderr.write("[RawReadLane] prototype bridge installed\n");
}
