/**
 * @file tests/benchmarks/auth-session-amr.test.ts
 * @description Cost of persisting session AMR (`amr`) + `mfaVerifiedAt`.
 *
 * The AMR/MFA pair added two columns to `auth_sessions` (JSON + timestamp) so a
 * session that proved MFA keeps that proof across reads and id rotation. This
 * benchmark answers the only question that matters for performance: does the pair
 * cost anything on the paths that touch it? It measures the SAME engine twice —
 * sessions written with the columns populated vs. sessions written without them —
 * plus the two per-request paths:
 *
 * - `validateSession` — the hot path (SELECT u.* … JOIN auth_sessions), which does
 *   NOT read the session columns at all;
 * - `getSessionTokenData` — selects the session columns, i.e. the one call that
 *   actually pays for the extra JSON column.
 *
 * Run: bun run scripts/benchmark-matrix/index.ts --db=sqlite --only=auth-session-amr
 */

import {
  test,
  runBenchmark,
  exportResult,
  exportMetric,
  setupBenchmarkServer,
  ensureStableTestData,
  stabilize,
  printSummaryTable,
  getDbType,
  assertSuccess,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import type { DatabaseAdapter, DatabaseId, ISODateString } from "@src/databases/db-interface";

const TENANT = "global" as DatabaseId;
const ITERATIONS = 400;
const READ_ITERATIONS = 800;

let stopServer: (() => Promise<void>) | null = null;

function futureIso(): ISODateString {
  return new Date(Date.now() + 3_600_000).toISOString() as ISODateString;
}

async function runSessionAmrBenchmark(): Promise<void> {
  console.log("🔐 Session AMR / MFA column cost\n");

  const server = await setupBenchmarkServer();
  stopServer = server.stop;

  await ensureStableTestData();
  await stabilize(300);

  const { getDb, ensureFullInitialization } = await import("@src/databases/db");
  await ensureFullInitialization();
  const db = getDb() as DatabaseAdapter;
  if (!db) throw new Error("Database not initialized");

  const runId = Date.now().toString(36);
  const plainUser = `bench-amr-plain-${runId}` as DatabaseId;
  const amrUser = `bench-amr-mfa-${runId}` as DatabaseId;
  const mfaVerifiedAt = new Date().toISOString() as ISODateString;
  let counter = 0;

  const insertSession = (user: DatabaseId, withAmr: boolean) =>
    db.auth.createSession({
      user_id: user,
      tenantId: TENANT,
      expires: futureIso(),
      deviceId: `dev-${counter++}`,
      ...(withAmr ? { amr: ["pwd", "mfa"], mfaVerifiedAt } : {}),
    });

  const plainInsert = await runBenchmark({
    name: "SESSION INSERT (plain)",
    iterations: ITERATIONS,
    runs: 1,
    onIteration: async () => {
      const res = await insertSession(plainUser, false);
      assertSuccess(res, "createSession(plain)");
    },
  });

  const amrInsert = await runBenchmark({
    name: "SESSION INSERT (amr + mfaVerifiedAt)",
    iterations: ITERATIONS,
    runs: 1,
    onIteration: async () => {
      const res = await insertSession(amrUser, true);
      assertSuccess(res, "createSession(amr)");
    },
  });

  // Sanity: the feature under measurement must actually work (a regression here
  // would make the "cost" meaningless).
  const probe = await db.auth.createSession({
    user_id: amrUser,
    tenantId: TENANT,
    expires: futureIso(),
    amr: ["pwd", "mfa"],
    mfaVerifiedAt,
  });
  assertSuccess(probe, "createSession(probe)");
  if (!probe.success) throw new Error("AMR probe failed");
  if (JSON.stringify(probe.data.amr) !== JSON.stringify(["pwd", "mfa"])) {
    throw new Error("AMR round-trip broken — benchmark would measure nothing");
  }
  const probeId = probe.data._id;

  const singleRead = await runBenchmark({
    name: "SESSION READ single (session columns)",
    iterations: READ_ITERATIONS,
    runs: 1,
    onIteration: async () => {
      const res = await db.auth.getSessionTokenData(probeId);
      assertSuccess(res, "getSessionTokenData");
    },
  });

  const validate = await runBenchmark({
    name: "SESSION VALIDATE (per-request JOIN)",
    iterations: READ_ITERATIONS,
    runs: 1,
    onIteration: async () => {
      await db.auth.validateSession(probeId);
    },
  });

  const insertDeltaPct =
    ((amrInsert.avgMs - plainInsert.avgMs) / Math.max(plainInsert.avgMs, 0.0001)) * 100;

  printSummaryTable(
    [
      { key: "SESSION INSERT (plain)", val: plainInsert.avgMs, unit: "ms" },
      { key: "SESSION INSERT (amr + mfaVerifiedAt)", val: amrInsert.avgMs, unit: "ms" },
      { key: "SESSION INSERT Δ (amr vs plain)", val: `${insertDeltaPct.toFixed(1)}%`, unit: "" },
      { key: "SESSION READ single (session columns)", val: singleRead.avgMs, unit: "ms" },
      { key: "SESSION VALIDATE (per-request JOIN)", val: validate.avgMs, unit: "ms" },
    ],
    `AUTH SESSION · ${getDbType()}`,
  );

  exportMetric("AUTH SESSION INSERT (plain)", plainInsert.avgMs, "ms");
  exportMetric("AUTH SESSION INSERT (amr + mfa)", amrInsert.avgMs, "ms");
  exportMetric("AUTH SESSION INSERT Δ (amr vs plain)", insertDeltaPct, "%");
  exportMetric("AUTH SESSION READ single (token data)", singleRead.avgMs, "ms");
  exportMetric("AUTH SESSION VALIDATE (per-request)", validate.avgMs, "ms");

  // 📈 Trend rows (history.jsonl + history.sqlite + ledger trend lines).
  // exportMetric() only feeds the debug CSV — without these the test had no
  // history at all, so its "baseline" was overwritten by the next run.
  // The Δ% stays a CSV metric: the trend store is millisecond-keyed.
  for (const r of [
    { ...plainInsert, name: "SESSION INSERT (plain)", layer: "AMR" },
    { ...amrInsert, name: "SESSION INSERT (amr + mfaVerifiedAt)", layer: "AMR" },
    { ...singleRead, name: "SESSION READ single (session columns)", layer: "AMR" },
    { ...validate, name: "SESSION VALIDATE (per-request JOIN)", layer: "AMR" },
  ]) {
    exportResult(r);
  }

  // Cleanup — dedicated users only, never real sessions.
  for (const userId of [plainUser, amrUser]) {
    await db.auth.invalidateAllUserSessions(userId, { tenantId: TENANT }).catch(() => undefined);
  }
}

test("Auth session AMR / MFA — write + read cost", async () => {
  try {
    await runSessionAmrBenchmark();
  } finally {
    await stopServer?.();
  }
}, 600_000);
