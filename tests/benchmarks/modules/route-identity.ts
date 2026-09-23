/**
 * @file tests/benchmarks/modules/route-identity.ts
 * @description Route-class byte-identity matrix for the fast-lane transport.
 *
 * A lane may only serve a route class if two things hold, and both are checked
 * here per case:
 *
 * 1. **Determinism** — the bridged path must return the same bytes twice within a
 *    run. A body carrying `Date.now()`, `process.uptime()` or a per-request nonce
 *    is *ineligible* by construction: identical transport bytes would prove
 *    nothing, because the two fetches were never the same response to begin with.
 * 2. **Transport identity** — the raw lane response must equal the bridged one in
 *    status and body bytes. The `x-fast-lane: off` request header forces the
 *    bridged path for a single request, so both transports are compared inside one
 *    server run (same session, same database, no drift).
 *
 * `x-fast-lane-served` (only emitted when the server runs with
 * `BENCH_VERIFY_RAW=1`) records which transport actually answered — identical
 * bytes prove nothing if the lane never served.
 *
 * Route classes follow `docs/reference/architecture/state-management.mdx` §6.
 * This verifier is advisory on purpose: it reports the matrix, and only classes
 * already promoted by hand (collection reads) fail a run in the replica bench.
 */

export interface RouteIdentityResult {
  routeClass: string;
  name: string;
  /** [raw, bridged] status codes. */
  status: [number, number];
  /** [raw, bridged] body byte lengths. */
  bytes: [number, number];
  /** Bridged vs bridged: byte-stable within this run (eligibility precondition). */
  deterministic: boolean;
  /** Raw vs bridged: same status and bytes. */
  transportIdentical: boolean;
  /** Which transport answered the raw request (needs `BENCH_VERIFY_RAW=1` server-side). */
  laneServed: boolean;
}

export interface RouteIdentityMatrix {
  results: RouteIdentityResult[];
  /** Classes where every case is deterministic and identical — lane-eligible. */
  eligible: string[];
  /** Classes with at least one non-deterministic case — never lane-eligible as-is. */
  ineligible: string[];
  report: string;
}

interface RouteCase {
  routeClass: string;
  name: string;
  url: string;
}

export interface RouteIdentityInput {
  baseUrl: string;
  headers: Record<string, string>;
  collectionUrl: string;
  entryId: string;
  urls: { missingUrl: string; listPlainUrl: string; listLargeUrl: string; listFilterUrl: string };
}

/** The matrix, one case per route class the taxonomy names (GET-only: lanes never see POST). */
export function routeIdentityCases(input: RouteIdentityInput): RouteCase[] {
  const { baseUrl, collectionUrl, entryId, urls } = input;
  return [
    // collection — the class a lane already serves.
    { routeClass: "collection", name: "point read", url: `${collectionUrl}/${entryId}` },
    { routeClass: "collection", name: "point read (missing)", url: urls.missingUrl },
    { routeClass: "collection", name: "list plain", url: urls.listPlainUrl },
    { routeClass: "collection", name: "list large", url: urls.listLargeUrl },
    { routeClass: "collection", name: "list filter+sort", url: urls.listFilterUrl },
    // api — REST endpoints outside the collection lane.
    { routeClass: "api", name: "installed version", url: `${baseUrl}/api/system/version` },
    { routeClass: "api", name: "health (liveness shape)", url: `${baseUrl}/api/system/health` },
    {
      routeClass: "api",
      name: "health (diagnostics shape)",
      url: `${baseUrl}/api/system/health?verbose`,
    },
    // bootstrap — auth pages. Nonces/CSRF make these the interesting negative case.
    { routeClass: "bootstrap", name: "login page", url: `${baseUrl}/login` },
  ];
}

async function fetchOnce(url: string, headers: Record<string, string>, bridged: boolean) {
  const res = await fetch(url, {
    headers: {
      ...headers,
      ...(bridged ? { "x-fast-lane": "off" } : {}),
    },
  });
  const body = await res.text();
  return {
    status: res.status,
    body,
    laneServed: res.headers.get("x-fast-lane-served") === "1",
  };
}

/**
 * Run the matrix. Never throws: it reports, so a non-deterministic or not-yet-lane
 * class cannot fail an unrelated benchmark run.
 */
export async function probeRouteIdentity(input: RouteIdentityInput): Promise<RouteIdentityMatrix> {
  const results: RouteIdentityResult[] = [];

  for (const c of routeIdentityCases(input)) {
    try {
      const raw = await fetchOnce(c.url, input.headers, false);
      const bridged = await fetchOnce(c.url, input.headers, true);
      const bridgedAgain = await fetchOnce(c.url, input.headers, true);
      results.push({
        routeClass: c.routeClass,
        name: c.name,
        status: [raw.status, bridged.status],
        bytes: [Buffer.byteLength(raw.body), Buffer.byteLength(bridged.body)],
        deterministic: bridged.body === bridgedAgain.body && bridged.status === bridgedAgain.status,
        transportIdentical: raw.status === bridged.status && raw.body === bridged.body,
        laneServed: raw.laneServed,
      });
    } catch (err) {
      // A failed fetch is a matrix row, not a test failure — and it must say why,
      // or a row of zeroes would look like a real (broken) response.
      console.log(
        `ROUTE-IDENTITY ${c.routeClass.padEnd(10)} ${c.name.padEnd(24)} fetch failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      results.push({
        routeClass: c.routeClass,
        name: c.name,
        status: [0, 0],
        bytes: [0, 0],
        deterministic: false,
        transportIdentical: false,
        laneServed: false,
      });
    }
  }

  const classes = [...new Set(results.map((r) => r.routeClass))];
  const ineligible = classes.filter((cls) =>
    results.some((r) => r.routeClass === cls && !r.deterministic),
  );
  const eligible = classes.filter(
    (cls) =>
      !ineligible.includes(cls) &&
      results.every((r) => r.routeClass !== cls || r.transportIdentical),
  );

  const lines = results.map(
    (r) =>
      `ROUTE-IDENTITY ${r.routeClass.padEnd(10)} ${r.name.padEnd(24)} ` +
      `status ${r.status[0]}/${r.status[1]} bytes ${String(r.bytes[0]).padStart(6)}/${String(r.bytes[1]).padStart(6)} ` +
      `${r.transportIdentical ? "identical" : "DIFFERS"} ` +
      `${r.deterministic ? "deterministic" : "NON-DETERMINISTIC"} ` +
      `${r.laneServed ? "lane-served" : "bridged"}`,
  );
  const report = [
    ...lines,
    `ROUTE-IDENTITY eligible: ${eligible.join(", ") || "(none)"}`,
    `ROUTE-IDENTITY ineligible (body not byte-stable): ${ineligible.join(", ") || "(none)"}`,
  ].join("\n");

  return { results, eligible, ineligible, report };
}
