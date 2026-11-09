/**
 * @file tests/integration/api/lane-transport-identity.test.ts
 * @description Mandatory byte-identity gate between the raw fast-lane transport
 * and the bridged SvelteKit transport.
 *
 * `responseToLaneResult()` once served a header snapshot captured at `Response`
 * construction, so the raw transport silently dropped security headers,
 * `x-svelty-lane`, `x-srv-split`/`x-srv-dur`, etag and 304 validators while the
 * bridged path kept them. The only equivalence check lived in a benchmark behind
 * `BENCH_VERIFY_RAW=1`, which is why the divergence shipped.
 *
 * This suite runs the same check unconditionally: every case is requested twice
 * against one server, session and database — once through the raw lane and once
 * with `x-fast-lane: off` (the bridged path) — and requires identical status,
 * body bytes, etag, security headers and conditional-request status.
 *
 * ### Features:
 * - point read, missing-id point read, list and HEAD transport parity
 * - strict security-header equality (CSP, frame, nosniff, referrer, permissions
 *   policy, HSTS when present) — the regression class that shipped
 * - byte-identical bodies compared with `Buffer.equals`
 * - `If-None-Match` 304 parity on both transports
 * - hard failure when the fixture collection/entry cannot be created
 * - hard failure when NO case was served by the raw lane (the harness pins
 *   `BENCH_VERIFY_RAW=1`, so `x-fast-lane-served` proves the lane actually ran)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getApiBaseUrl, safeFetch, testingAction, waitForServer } from "../helpers/server";
import { prepareAuthenticatedContext } from "../helpers/test-setup";

const API = getApiBaseUrl();
const COLLECTION = "lane_transport_identity";
const MISSING_ID = "ffffffff-ffff-7fff-bfff-ffffffffffff";

const SCHEMA = {
  _id: COLLECTION,
  name: COLLECTION,
  fields: [
    { db_fieldName: "title", label: "Title", widget: { Name: "Input" }, type: "string" },
    { db_fieldName: "body", label: "Body", widget: { Name: "Input" }, type: "string" },
  ],
};

/**
 * Headers the security contract guarantees on every API response. HSTS is
 * excluded from the presence check because it is only emitted on HTTPS, but it
 * is still compared whenever either transport carries it.
 */
const REQUIRED_API_SECURITY_HEADERS = [
  "content-security-policy",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
] as const;

const SECURITY_HEADERS = [...REQUIRED_API_SECURITY_HEADERS, "strict-transport-security"] as const;

type Transport = "raw" | "bridged";

interface TransportResponse {
  status: number;
  body: Buffer;
  etag: string | null;
  headers: Headers;
}

let cookie = "";
let entryPath = "";
/** Cases proven to have been answered by the raw lane (`x-fast-lane-served: 1`). */
let laneServedCases = 0;

function rowOf(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object") return {};
  const root = body as Record<string, unknown>;
  const data = root.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return root;
}

/**
 * One request through the selected transport. `safeFetch` keeps the suite on the
 * same Origin/test-secret handling as the other API contracts.
 */
async function fetchTransport(
  path: string,
  transport: Transport,
  method: "GET" | "HEAD" = "GET",
): Promise<TransportResponse> {
  const response = await safeFetch(`${API}${path}`, {
    method,
    headers: {
      Cookie: cookie,
      ...(transport === "bridged" ? { "x-fast-lane": "off" } : {}),
    },
  });
  return {
    status: response.status,
    body: Buffer.from(await response.arrayBuffer()),
    etag: response.headers.get("etag"),
    headers: response.headers,
  };
}

/**
 * Conditional request with the first response's validator.
 *
 * Raw `fetch` instead of `safeFetch`: the helper rebuilds the response with
 * `new Response(body, { status })`, and the Fetch spec rejects a body (even a
 * zero-length ArrayBuffer) on a 304.
 */
async function fetchConditional(path: string, etag: string, transport: Transport): Promise<number> {
  const response = await fetch(`${API}${path}`, {
    method: "GET",
    headers: {
      Cookie: cookie,
      Origin: API,
      "Accept-Encoding": "identity",
      "If-None-Match": etag,
      ...(transport === "bridged" ? { "x-fast-lane": "off" } : {}),
    },
  });
  return response.status;
}

/**
 * The contract: identical status, body bytes, etag, security headers, lane
 * attribution (present on both) and conditional transport behaviour.
 */
function expectTransportIdentity(
  label: string,
  raw: TransportResponse,
  bridged: TransportResponse,
): void {
  expect(raw.status, `${label}: HTTP status`).toBe(bridged.status);

  expect(
    raw.body.equals(bridged.body),
    `${label}: body bytes differ (${raw.body.byteLength} B raw vs ${bridged.body.byteLength} B bridged)`,
  ).toBe(true);

  expect(raw.etag, `${label}: ETag`).toBe(bridged.etag);

  // Strictest assertion in the suite: a header present on one transport and
  // absent (or different) on the other is exactly the shipped regression.
  for (const name of REQUIRED_API_SECURITY_HEADERS) {
    expect(raw.headers.get(name), `${label}: raw transport dropped ${name}`).toBeTruthy();
    expect(bridged.headers.get(name), `${label}: bridged transport dropped ${name}`).toBeTruthy();
  }
  for (const name of SECURITY_HEADERS) {
    const rawValue = raw.headers.get(name);
    const bridgedValue = bridged.headers.get(name);
    expect(
      rawValue,
      `${label}: ${name} (raw=${rawValue ?? "absent"} bridged=${bridgedValue ?? "absent"})`,
    ).toBe(bridgedValue);
  }

  // The dropped `x-svelty-lane` was part of the shipped header divergence.
  const rawLane = raw.headers.get("x-svelty-lane");
  const bridgedLane = bridged.headers.get("x-svelty-lane");
  expect(rawLane, `${label}: raw x-svelty-lane`).toBeTruthy();
  expect(bridgedLane, `${label}: bridged x-svelty-lane`).toBeTruthy();

  // Attribution canary: the read lane stamps API_READ, while the pipeline stamps
  // the classifier lane (HYPER_TURBO for a warm session). Equal attribution means
  // the raw request never reached the lane and this case compared the pipeline
  // with itself — the suite still guards the wire contract, but the transport
  // regression it exists for can only be caught while the lane actually serves.
  if (rawLane === bridgedLane) {
    console.warn(
      `   ⚠ ${label}: raw attribution equals the bridged lane (${rawLane}); the raw transport may have fallen through`,
    );
  }

  // The integration harness pins `BENCH_VERIFY_RAW=1` on the preview server, so
  // `responseToLaneResult()` stamps `x-fast-lane-served: 1` on bytes that came
  // out of the lane. A missing marker means the lane crashed or declined and the
  // registry re-served the request through the bridge — the failure the unit
  // facade test pins, and the reason this suite counts served cases instead of
  // trusting byte identity alone.
  if (raw.headers.get("x-fast-lane-served") === "1") laneServedCases += 1;
  expect(
    bridged.headers.get("x-fast-lane-served"),
    `${label}: bridged request must not be lane-served`,
  ).toBeNull();

  console.log(
    `   ℹ ${label}: ${raw.status}/${bridged.status} · ${raw.body.byteLength}/${bridged.body.byteLength} B · ` +
      `lane ${raw.headers.get("x-svelty-lane") ?? "-"}/${bridged.headers.get("x-svelty-lane") ?? "-"} · ` +
      `raw-lane-served ${raw.headers.get("x-fast-lane-served") ?? "n/a"}`,
  );
}

describe("Fast-lane transport byte identity", () => {
  beforeAll(async () => {
    await waitForServer();
    cookie = await prepareAuthenticatedContext();
    expect(cookie.length).toBeGreaterThan(0);

    const provisioned = await testingAction("create-collection", { schema: SCHEMA });
    expect(provisioned?.success, JSON.stringify(provisioned)).toBe(true);

    const created = await safeFetch(`${API}/api/collections/${COLLECTION}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        title: `lane-identity-${Date.now()}`,
        body: "byte-identity fixture",
        status: "published",
      }),
    });
    const createdText = await created.clone().text();
    expect(
      [200, 201],
      `entry create failed: ${created.status} ${createdText.slice(0, 300)}`,
    ).toContain(created.status);

    let createdBody: unknown;
    try {
      createdBody = JSON.parse(createdText);
    } catch {
      throw new Error(`entry create returned non-JSON: ${createdText.slice(0, 300)}`);
    }

    const entryId = String(rowOf(createdBody)._id ?? "");
    expect(
      entryId.length,
      `entry create returned no _id: ${createdText.slice(0, 300)}`,
    ).toBeGreaterThan(0);

    entryPath = `/api/collections/${COLLECTION}/${entryId}`;
  }, 180_000);

  afterAll(async () => {
    if (!cookie || !entryPath) return;
    try {
      await safeFetch(`${API}${entryPath}`, {
        method: "DELETE",
        headers: { Cookie: cookie },
      });
    } catch (error) {
      console.warn(
        `   ⚠ cleanup: could not delete ${entryPath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    // Hard gate: at least one case must have been served by the raw transport.
    // Without this, a lane that throws and falls back makes every comparison
    // here the bridged pipeline compared with itself — green, and blind.
    expect(
      laneServedCases,
      "no case was served by the raw lane — the transport fell back to the bridged pipeline",
    ).toBeGreaterThan(0);
  });

  it("point read is byte-identical on the raw and bridged transports", async () => {
    const raw = await fetchTransport(entryPath, "raw");
    const bridged = await fetchTransport(entryPath, "bridged");
    expect(raw.status, "point read must succeed before parity is meaningful").toBe(200);
    expectTransportIdentity("point read", raw, bridged);
  });

  it("missing-id point read keeps the same status and body on both transports", async () => {
    // The point-read envelope answers a missing row as `200 {success:true,data:null}`
    // on both transports (the read lane owns that contract); parity is the gate.
    const missingPath = `/api/collections/${COLLECTION}/${MISSING_ID}`;
    const raw = await fetchTransport(missingPath, "raw");
    const bridged = await fetchTransport(missingPath, "bridged");
    expect([200, 404], "missing-id read must answer 200 or 404").toContain(raw.status);
    expectTransportIdentity("missing-id point read", raw, bridged);
  });

  it("list read is byte-identical on the raw and bridged transports", async () => {
    const listPath = `/api/collections/${COLLECTION}?limit=10`;
    const raw = await fetchTransport(listPath, "raw");
    const bridged = await fetchTransport(listPath, "bridged");
    expect(raw.status, "list read must succeed before parity is meaningful").toBe(200);
    expectTransportIdentity("list read", raw, bridged);
  });

  it("HEAD point read is byte-identical on the raw and bridged transports", async () => {
    const raw = await fetchTransport(entryPath, "raw", "HEAD");
    const bridged = await fetchTransport(entryPath, "bridged", "HEAD");
    expect(raw.status, "HEAD point read must succeed before parity is meaningful").toBe(200);
    expect(raw.body.byteLength, "HEAD must not carry a body").toBe(0);
    expectTransportIdentity("HEAD point read", raw, bridged);
  });

  it("conditional If-None-Match answers 304 on both transports", async () => {
    const first = await fetchTransport(entryPath, "raw");
    expect(first.etag, "point read must expose an ETag for the conditional probe").toBeTruthy();
    if (!first.etag) {
      throw new Error("point read returned no ETag; the conditional path cannot be exercised");
    }

    const rawStatus = await fetchConditional(entryPath, first.etag, "raw");
    const bridgedStatus = await fetchConditional(entryPath, first.etag, "bridged");

    expect(rawStatus, "If-None-Match must produce 304 on the raw transport").toBe(304);
    expect(bridgedStatus, "If-None-Match must produce 304 on the bridged transport").toBe(304);
    expect(rawStatus, "conditional status parity").toBe(bridgedStatus);
    console.log(`   ℹ conditional If-None-Match: ${rawStatus}/${bridgedStatus}`);
  });
});
