/**
 * @file tests/benchmarks/probe-write-attrib.test.ts
 * @description Write attribution — is the update cost client-side or server-side?
 * @summary Compares the SAME operation (collection update) three ways in one
 * session: in-process `db.crud.update` at c=1/c=8 vs HTTP PATCH through the
 * write lane, reporting client wall p50, `x-srv-dur` and the lane's `dbwrite`
 * phase p50.
 *
 * ### Features:
 * - One run yields client wall, server-stamped total and the adapter phase for
 *   identical payloads — no cross-session pairing needed
 * - Concurrency split: the c=1 vs c=8 in-process pair separates write
 *   serialization from HTTP/transport cost
 * - Transport A/B: `SVELTY_FAST_LANE_WRITE=1` runs the raw write lane, unset runs
 *   the bridged pipeline (probe sets `SVELTY_SRV_SPLIT`/`SVELTY_SRV_DUR` itself)
 * - Diagnostic probe — excluded from the matrix (`SKIP_IN_MATRIX`)
 *
 * Recipe: `DB_TYPE=sqlite bun test tests/benchmarks/probe-write-attrib.test.ts`
 * (resolved the "~1.5 ms server-side write" question — see achievements §3.38).
 */
import { test, setupBenchmarkServer, benchmarkAuthHeaders } from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";

const ITERS = Number(process.env.ATTRIB_ITERS || 300);
const COLLECTION = "BenchmarkStable";
const TENANT = { tenantId: "global" };

function p50(arr: number[]): string {
  if (!arr.length) return "-";
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)].toFixed(3);
}

test("write attribution: in-process crud.update vs HTTP lane", async () => {
  process.env.SVELTY_SRV_SPLIT = "1";
  process.env.SVELTY_SRV_DUR = "1";
  const info = await setupBenchmarkServer();
  try {
    const { getDb, ensureFullInitialization } = await import("@src/databases/db");
    await ensureFullInitialization();
    const db = getDb() as any;
    const headers: Record<string, string> = {
      ...benchmarkAuthHeaders(),
      "content-type": "application/json",
    };
    const url = `${info.baseUrl}/api/collections/${COLLECTION}`;

    const ids: string[] = [];
    for (let i = 0; i < 20; i++) {
      const r = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: `attrib ${i}`,
          slug: `attrib-${Date.now()}-${i}`,
          status: "draft",
          count: 0,
          publishDate: "2026-01-01T00:00:00.000Z",
          content: "x",
        }),
      });
      const j = (await r.json().catch(() => ({}))) as any;
      const id = j?.data?._id ?? j?.data?.id;
      if (id) ids.push(id);
    }
    if (!ids.length) throw new Error("no ids seeded");

    // 1) in-process crud.update, sequential
    const in1: number[] = [];
    for (let i = 0; i < ITERS; i++) {
      const t0 = performance.now();
      await db.crud.update(COLLECTION, ids[i % ids.length], { count: i }, TENANT);
      in1.push(performance.now() - t0);
    }

    // 2) in-process crud.update, 8 workers
    const in8: number[] = [];
    await Promise.all(
      Array.from({ length: 8 }, async (_, w) => {
        for (let i = 0; i < ITERS / 8; i++) {
          const t0 = performance.now();
          await db.crud.update(COLLECTION, ids[(i + w) % ids.length], { count: i }, TENANT);
          in8.push(performance.now() - t0);
        }
      }),
    );

    // 3) HTTP lane, sequential (wall + srv-dur + dbwrite)
    const h1: number[] = [];
    const h1dur: number[] = [];
    const h1db: number[] = [];
    for (let i = 0; i < ITERS; i++) {
      const t0 = performance.now();
      const r = await fetch(`${url}/${ids[i % ids.length]}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ count: i }),
      });
      await r.arrayBuffer();
      h1.push(performance.now() - t0);
      const dur = parseFloat(r.headers.get("x-srv-dur") || "NaN");
      if (Number.isFinite(dur)) h1dur.push(dur);
      const m = (r.headers.get("x-srv-split") || "").match(/dbwrite=([\d.]+)/);
      if (m) h1db.push(Number(m[1]));
    }

    console.log(
      `\nATTRIBUTION (${COLLECTION}, ${ITERS} iters) | in-proc c=1 p50 ${p50(in1)}ms | in-proc c=8 p50 ${p50(in8)}ms | HTTP wall p50 ${p50(h1)}ms | HTTP srv-dur p50 ${p50(h1dur)}ms | HTTP dbwrite p50 ${p50(h1db)}ms`,
    );
  } finally {
    await info.stop();
  }
}, 600_000);
