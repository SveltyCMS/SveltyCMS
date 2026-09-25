/**
 * @file tests/integration/databases/auth-session-amr-contract.test.ts
 * @description Cross-adapter contract for session AMR / MFA persistence.
 *
 * Regression guard for a silent security gap: `createSession({ amr, mfaVerifiedAt })`
 * type-checked through the adapter interface while **no engine stored it** — the SQL
 * schemas had no columns and Mongo's `SessionSchema` (strict) stripped it. A session
 * that proved MFA lost that proof on the next read, and session-id rotation dropped
 * the remaining metadata as well.
 *
 * Verifies on every engine (SQLite / PostgreSQL / MariaDB / MongoDB):
 * 1. `amr` + `mfaVerifiedAt` survive a **real read** (not just the write return value);
 * 2. session-id rotation keeps the MFA proof — no silent downgrade;
 * 3. plain sessions are not given invented AMR values.
 *
 * Rotation is exercised on all four engines: MongoDB degrades to sequential writes
 * when the deployment has no transactions (standalone / CI / local compose).
 *
 * Run: bun run test:integration -- tests/integration/databases/auth-session-amr-contract.test.ts
 * Matrix: DB_TYPE=sqlite|postgresql|mariadb|mongodb
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  DatabaseAdapter,
  DatabaseId,
  ISODateString,
  Session,
} from "@src/databases/db-interface";
import { ensureFullInitialization, getDb } from "@src/databases/db";
import { assertRealAdapter } from "@tests/helpers/assert-real-adapter";
import { generateUUID } from "@utils/native-utils";

const TENANT = "global" as DatabaseId;
const MFA_AMR = ["pwd", "mfa"];

let db: DatabaseAdapter;
const createdSessionIds: DatabaseId[] = [];

function suffix(): string {
  return `${Date.now().toString(36)}-${generateUUID()}`;
}

/**
 * `user_id` is varchar(36) on the strict SQL engines (MariaDB/PostgreSQL
 * enforce it; SQLite does not) — so user identifiers must be real UUIDs,
 * never descriptive prefixes + suffix (>36 chars). Device ids may be longer
 * (varchar(64)) and keep the readable prefix.
 */
function shortUserId(prefix: string): DatabaseId {
  return `${prefix}${generateUUID().slice(prefix.length)}` as DatabaseId;
}

function futureIso(hours = 1): ISODateString {
  return new Date(Date.now() + hours * 3_600_000).toISOString() as ISODateString;
}

function unwrap<T>(res: { success: boolean; data?: T; message?: string }): T {
  expect(res.success, res.message ?? "adapter call failed").toBe(true);
  return res.data as T;
}

async function createSession(
  user_id: DatabaseId,
  extra: { amr?: string[]; mfaVerifiedAt?: ISODateString } = {},
): Promise<Session> {
  const session = unwrap(
    await db.auth.createSession({
      user_id,
      tenantId: TENANT,
      expires: futureIso(),
      deviceId: `device-${suffix()}`,
      ...extra,
    }),
  );
  createdSessionIds.push(session._id);
  return session;
}

async function readBack(user_id: DatabaseId, sessionId: DatabaseId): Promise<Session> {
  const active = unwrap(await db.auth.getActiveSessions(user_id, { tenantId: TENANT }));
  const session = active.find((s) => s._id === sessionId);
  expect(session, `session ${sessionId} missing from getActiveSessions`).toBeDefined();
  return session!;
}

beforeAll(async () => {
  await ensureFullInitialization();
  db = getDb() as DatabaseAdapter;
  assertRealAdapter(db);
});

afterAll(async () => {
  for (const id of createdSessionIds) {
    try {
      await db.auth.deleteSession(id);
    } catch {
      // rotated away or already cleaned up
    }
  }
});

describe("auth sessions — AMR / MFA persistence", () => {
  it("round-trips amr + mfaVerifiedAt through a real read", async () => {
    const userId = shortUserId("amr-roundtrip-");
    const mfaVerifiedAt = new Date().toISOString() as ISODateString;

    const written = await createSession(userId, { amr: MFA_AMR, mfaVerifiedAt });

    // 1. the write-return path
    expect(written.amr).toEqual(MFA_AMR);

    // 2. an independent read path — catches "stored as a JSON string / stripped by the schema"
    const read = await readBack(userId, written._id);
    expect(read.amr).toEqual(MFA_AMR);
    expect(new Date(read.mfaVerifiedAt as string).toISOString()).toBe(mfaVerifiedAt);
    // Boundary contract after the registered-table conversion: the session read
    // must hand back a parsed array + an ISODateString, never a driver-native
    // JSON string or Date instance (the fast branch only converts registered
    // JSON/date columns — this is what proves amr/mfaVerifiedAt are among them).
    // NOT RUN locally: needs the 4-DB integration harness (orchestrator-owned).
    expect(Array.isArray(read.amr)).toBe(true);
    expect(typeof read.mfaVerifiedAt).toBe("string");
  });

  it("keeps device metadata that other auth paths rely on", async () => {
    const userId = shortUserId("amr-device-");
    const written = await createSession(userId);
    const read = await readBack(userId, written._id);

    expect(read.deviceId).toBe(written.deviceId);
    expect(read.userAgent ?? null).toBeNull();
  });

  it("keeps the MFA proof across session-id rotation", async () => {
    const userId = shortUserId("amr-rotation-");
    const mfaVerifiedAt = new Date().toISOString() as ISODateString;

    const original = await createSession(userId, { amr: MFA_AMR, mfaVerifiedAt });
    const rotatedId = unwrap(await db.auth.rotateToken(original._id, futureIso(2))) as DatabaseId;
    createdSessionIds.push(rotatedId);

    const rotated = await readBack(userId, rotatedId);
    expect(rotated.amr).toEqual(MFA_AMR);
    expect(new Date(rotated.mfaVerifiedAt as string).toISOString()).toBe(mfaVerifiedAt);

    // The retired id must not still be an active session.
    const active = unwrap(await db.auth.getActiveSessions(userId, { tenantId: TENANT }));
    expect(active.some((s) => s._id === original._id)).toBe(false);
  });

  it("does not invent AMR for plain sessions", async () => {
    const userId = shortUserId("amr-plain-");
    const written = await createSession(userId);
    const read = await readBack(userId, written._id);

    expect(read.amr ?? []).toEqual([]);
    expect(read.mfaVerifiedAt ?? null).toBeNull();
  });
});
