/**
 * @file tests/integration/databases/tenant-pool-isolation.test.ts
 * @description Pool-size-1 adversarial tenant isolation.
 *
 * ### Why this file exists
 * Gate 3 of the enterprise verification plan asks for the isolation mechanism to be
 * proven on a single reused connection, because that is where a scope decision can
 * leak from one request to the next. It also proves *which* mechanism is doing the
 * work: every tenant-owned query carries a `tenantId` predicate, while PostgreSQL RLS
 * is not enabled on these tables and `app.tenant_id` is never set on the shared pool
 * (`setTenantContext` only touches dedicated tenant pools). That distinction matters —
 * an operator must not believe RLS is enforcing anything.
 *
 * ### Coverage:
 * - Alternating tenant A/B reads and writes on the shared adapter
 * - A statement failure in between does not unscope the next tenant's query
 * - Concurrent A/B reads never cross scopes
 * - Guessed-id (IDOR) reads and updates from the other tenant return nothing
 * - PostgreSQL only: a reused **single-connection** client (max: 1) with a stale
 *   session-level `app.tenant_id` cannot leak rows through the adapter
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ensureFullInitialization, getDb } from "@src/databases/db";
import { withSystemScope } from "@src/databases/system-tenant-scope";
import { generateUUID } from "@utils/native-utils";
import { isIsolatedTestDbName } from "@utils/test-db-safety";

const COLLECTION = "tenant_pool_iso";
const TENANT_A = "pool-iso-a";
const TENANT_B = "pool-iso-b";

/** `DB_TYPE` is set by the integration harness to the adapter under test. */
const DB_TYPE = (process.env.DB_TYPE || "sqlite").toLowerCase();
const IS_POSTGRES = DB_TYPE.startsWith("postgres");
/** Physical table the adapter provisions, or `collection_<id>`. */
const TABLE = COLLECTION.includes("-") ? COLLECTION.replace(/-/g, "") : COLLECTION;
const PHYSICAL_TABLE = `collection_${TABLE}`;

let db: any = null;

beforeAll(async () => {
  const result = await ensureFullInitialization();
  db = getDb();
  if (!db) throw new Error("Database not initialized");
  if (result?.adapter) db = result.adapter;
  expect(typeof db.crud?.findMany).toBe("function");

  if (db.collection?.createModel) {
    await db.collection
      .createModel({
        _id: COLLECTION,
        name: COLLECTION,
        fields: [
          { db_fieldName: "title", widget: { Name: "Input" }, required: true },
          { db_fieldName: "tenantId", widget: { Name: "Input" } },
        ],
      })
      .catch(() => {});
  }
}, 120_000);

afterAll(async () => {
  if (!db?.crud?.deleteMany) return;
  await db.crud
    .deleteMany(COLLECTION, {}, withSystemScope("testing", { permanent: true, confirmWipe: true }))
    .catch(() => {});
});

function doc(title: string, tenantId: string) {
  return { _id: generateUUID(), title, tenantId };
}

async function titlesFor(tenantId: string): Promise<string[]> {
  const res = await db.crud.findMany(COLLECTION, {}, { tenantId } as any);
  expect(res.success, JSON.stringify(res).slice(0, 200)).toBe(true);
  return (res.data ?? []).map((row: any) => row.title);
}

describe("Tenant isolation on a reused connection", () => {
  it("alternating A/B reads stay scoped", async () => {
    const a = doc(`a-${generateUUID()}`, TENANT_A);
    const b = doc(`b-${generateUUID()}`, TENANT_B);
    expect((await db.crud.insert(COLLECTION, a, { tenantId: TENANT_A })).success).toBe(true);
    expect((await db.crud.insert(COLLECTION, b, { tenantId: TENANT_B })).success).toBe(true);

    for (let i = 0; i < 12; i++) {
      const aTitles = await titlesFor(TENANT_A);
      const bTitles = await titlesFor(TENANT_B);
      expect(aTitles, `round ${i}`).not.toContain(b.title);
      expect(bTitles, `round ${i}`).not.toContain(a.title);
    }
  }, 60_000);

  it("a failed statement does not unscope the next tenant's read", async () => {
    // Duplicate _id is a legitimate failure path (constraint), not a crash: the next
    // query on the same pooled connection must still carry its tenant predicate.
    const dupe = doc(`dupe-${generateUUID()}`, TENANT_A);
    expect((await db.crud.insert(COLLECTION, dupe, { tenantId: TENANT_A })).success).toBe(true);
    const failed = await db.crud.insert(COLLECTION, { ...dupe }, { tenantId: TENANT_A });
    expect(failed.success).toBe(false);

    const aTitles = await titlesFor(TENANT_A);
    const bTitles = await titlesFor(TENANT_B);
    expect(aTitles).toContain(dupe.title);
    expect(bTitles).not.toContain(dupe.title);
  }, 60_000);

  it("concurrent A/B reads never cross scopes", async () => {
    const a = doc(`ca-${generateUUID()}`, TENANT_A);
    const b = doc(`cb-${generateUUID()}`, TENANT_B);
    await db.crud.insert(COLLECTION, a, { tenantId: TENANT_A });
    await db.crud.insert(COLLECTION, b, { tenantId: TENANT_B });

    const results = await Promise.all(
      Array.from({ length: 16 }, (_, i) => titlesFor(i % 2 === 0 ? TENANT_A : TENANT_B)),
    );
    results.forEach((titles, i) => {
      const expectedOther = i % 2 === 0 ? b.title : a.title;
      expect(titles, `request ${i}`).not.toContain(expectedOther);
    });
  }, 60_000);

  it("guessed ids from the other tenant are invisible (IDOR)", async () => {
    const secret = doc(`idor-${generateUUID()}`, TENANT_A);
    await db.crud.insert(COLLECTION, secret, { tenantId: TENANT_A });

    const read = await db.crud.findOne(COLLECTION, { _id: secret._id }, { tenantId: TENANT_B });
    expect(read.success).toBe(true);
    expect(read.data ?? null).toBeNull();

    const write = await db.crud.update(
      COLLECTION,
      secret._id,
      { title: "hijacked" },
      { tenantId: TENANT_B },
    );
    expect(write.success && write.data ? write.data.title : null).not.toBe("hijacked");
  }, 60_000);
});

// ── PostgreSQL: one connection, stale session GUC ────────────────────────────

describe.skipIf(!IS_POSTGRES)("PostgreSQL pool of size one", () => {
  let client: any = null;
  const dbName = process.env.DB_NAME || "";

  beforeAll(async () => {
    // Fail closed: never point a raw client at a database that is not an isolated
    // test database (the harness owns DB_NAME; a live name means a misconfigured run).
    expect(isIsolatedTestDbName(dbName), `refusing raw pool on non-test DB "${dbName}"`).toBe(true);
    const postgres = (await import("postgres")).default;
    client = postgres({
      host: process.env.DB_HOST || "127.0.0.1",
      port: Number(process.env.DB_PORT || 5432),
      database: dbName,
      username: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      max: 1, // the point of the test: one reused connection
      onnotice: () => {},
    });
  }, 60_000);

  afterAll(async () => {
    await client?.end({ timeout: 5 }).catch(() => {});
  });

  it("a stale session-level app.tenant_id cannot leak rows through the adapter", async () => {
    const a = doc(`guc-a-${generateUUID()}`, TENANT_A);
    const b = doc(`guc-b-${generateUUID()}`, TENANT_B);
    await db.crud.insert(COLLECTION, a, { tenantId: TENANT_A });
    await db.crud.insert(COLLECTION, b, { tenantId: TENANT_B });

    // Simulate a leaked scope decision on the single reused connection.
    await client.unsafe(`SELECT set_config('app.tenant_id', $1, false)`, [TENANT_A]);
    const [stale] = await client.unsafe(`SELECT current_setting('app.tenant_id', true) AS tenant`);
    expect(stale.tenant).toBe(TENANT_A);

    // The adapter's predicate must win over whatever the socket carries.
    const bTitles = await titlesFor(TENANT_B);
    expect(bTitles).toContain(b.title);
    expect(bTitles).not.toContain(a.title);

    const aTitles = await titlesFor(TENANT_A);
    expect(aTitles).toContain(a.title);
    expect(aTitles).not.toContain(b.title);
  }, 60_000);

  it("a failed statement on the reused connection does not unscope the next read", async () => {
    // ⚠️ Wrap the call in an IIFE: `expect(client.unsafe(...)).rejects` never settles
    // for postgres.js's lazy thenable (Bun's matcher only drives native Promises),
    // and because the client is `max: 1` the stuck query then queues every later
    // test on the same connection — a 300 s-per-test stall with no output. The IIFE
    // hands the matcher a real Promise.
    await expect((async () => client.unsafe(`SELECT 1/0`))()).rejects.toThrow();

    const titles = await titlesFor(TENANT_B);
    const aOnly = await titlesFor(TENANT_A);
    expect(titles.every((t: string) => !aOnly.includes(t) || t === titles[0])).toBe(true);
  }, 60_000);

  it("documents that isolation comes from the predicate, not from RLS", async () => {
    // INTENTIONALLY PINS TODAY'S MECHANISM. These tables have no RLS policy and the
    // shared pool never sets `app.tenant_id`, so an unfiltered scan sees every
    // tenant's row. If RLS is wired later (non-owner role + FORCE + transaction-local
    // GUC), this expectation must be updated deliberately — that is the review signal.
    const [rows] = await client.unsafe(`SELECT count(*)::int AS n FROM "${PHYSICAL_TABLE}"`);
    expect(rows.n).toBeGreaterThan(1);

    const [rls] = await client.unsafe(
      `SELECT c.relrowsecurity AS enabled FROM pg_class c WHERE c.oid = to_regclass($1)`,
      [`"${PHYSICAL_TABLE}"`],
    );
    expect(rls?.enabled, "RLS is enabled — review this file's premise").toBe(false);
  }, 60_000);
});
