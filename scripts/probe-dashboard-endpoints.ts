/**
 * @file scripts/probe-dashboard-endpoints.ts
 * @description One-shot local probe: seed → login → hit every dashboard API.
 * Usage: server already running on :4173 with TEST_MODE=true
 */
import { prepareAuthenticatedContext } from "../tests/integration/helpers/test-setup.ts";
import { safeFetch, BASE_URL } from "../tests/integration/helpers/server.ts";

const paths = [
  "/api/dashboard/health",
  "/api/dashboard/metrics",
  "/api/dashboard/metrics?detailed=true",
  "/api/dashboard/system-info",
  "/api/dashboard/system-info?type=cpu",
  "/api/dashboard/system-info?type=memory",
  "/api/dashboard/system-info?type=disk",
  "/api/dashboard/logs?limit=10&page=1",
  "/api/dashboard/logs?level=error&limit=10",
  "/api/dashboard/logs?search=database&limit=10",
  "/api/dashboard/logs?limit=5",
  "/api/dashboard/logs?limit=200",
  "/api/dashboard/last5-content",
  "/api/dashboard/last5-content?limit=3",
  "/api/dashboard/last5media",
  "/api/dashboard/online-user",
  "/api/dashboard/system-messages",
  "/api/dashboard/system-messages?limit=3",
  "/api/dashboard/cache-metrics",
];

const cookie = await prepareAuthenticatedContext();
console.log("AUTH_OK", cookie.includes("auth_sessions"));

let ok = 0;
let fail = 0;
for (const p of paths) {
  try {
    const r = await safeFetch(`${BASE_URL}${p}`, { headers: { Cookie: cookie } }, 2, 400);
    const t = await r.text();
    console.log("OK", r.status, p, t.slice(0, 80).replace(/\n/g, " "));
    ok++;
  } catch (e) {
    console.log("FAIL", p, e instanceof Error ? e.message.slice(0, 120) : e);
    fail++;
  }
}
console.log("SUMMARY", { ok, fail });
process.exit(fail > 0 ? 1 : 0);
