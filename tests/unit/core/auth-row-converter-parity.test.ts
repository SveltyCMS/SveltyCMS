/**
 * @file tests/unit/core/auth-row-converter-parity.test.ts
 * @description Byte-identity guard for the schema-aware auth row conversion.
 *
 * `convertDatesToISO` / `convertArrayDatesToISO` have two paths:
 * - **registered table** (`options.table` resolves in the `registerTableSchema`
 *   registry) — only the known date/JSON columns are visited (the fast branch);
 * - **no/unknown table** — every key of every row is checked against
 *   `DATE_FIELDS` / `JSON_FIELDS` (the legacy walk).
 *
 * The auth read paths were moved onto the fast branch: the system-table
 * registration now happens in `sql-adapter-core` for all three SQL adapters and
 * `relational-auth` passes the `authUsers` / `authSessions` table keys. What this
 * file pins down is the guarantee that makes that move safe: **both branches must
 * produce the same object** for the same auth row. A field that is converted on
 * one path and left raw on the other is a security bug (a JSON blob read as a
 * string, a Date leaking past the ISODateString boundary), not a performance
 * detail.
 *
 * It also guards the registration itself: the registered column set must be a
 * superset of the physical columns of all three SQL schemas, otherwise a column
 * would silently drop out of the converted set.
 *
 * Run: bun run test:unit -- tests/unit/core/auth-row-converter-parity.test.ts
 */

import { describe, expect, it } from "vitest";
import { SqlAdapterCore } from "@src/databases/core/sql-adapter-core";
import * as utils from "@src/databases/core/relational-utils";
import * as sqliteSchema from "@src/databases/sqlite/schema";
import * as mariaSchema from "@src/databases/mariadb/schema";
import * as pgSchema from "@src/databases/postgresql/schema";

/**
 * Same extraction `SqlAdapterCore.ensureTableSchemaRegistered` uses — the test
 * must validate the registry against the source the adapters register from —
 * plus a function filter for table-level accessors like PostgreSQL's
 * `enableRLS` (a method on the table object, not a column).
 */
function schemaColumns(table: object): string[] {
  return Object.entries(table)
    .filter(
      ([key, value]) =>
        typeof value !== "function" && !key.startsWith("Symbol(") && key !== "_" && key !== "name",
    )
    .map(([key]) => key);
}

/** Physical columns of each auth table per SQL engine (schema-authoritative). */
const AUTH_TABLES = ["authUsers", "authSessions"] as const;
const SCHEMAS = { sqlite: sqliteSchema, mariadb: mariaSchema, postgresql: pgSchema } as const;

const EPOCH_MS = 1786272221268; // 2026-08-09T22:43:41.268Z — SQLite raw INTEGER ms
const PG_TS = "2026-08-09 22:25:38.488+00"; // postgres.js timestamptz text
const PG_TS_ISO = "2026-08-09T22:25:38.488Z";

type Row = Record<string, unknown>;
type RowFactory = () => Row;

// ============================================================================
// 1. Registration completeness (the fast branch's column knowledge)
// ============================================================================

describe("auth table schema registration", () => {
  it("registers the shared SQL core (import side effect) for the auth tables", () => {
    // Importing sql-adapter-core is what runs the module-scope registration; the
    // class reference keeps the named import from being dropped.
    expect(typeof SqlAdapterCore).toBe("function");
    expect(utils.getTableMeta("authUsers")).toBeDefined();
    expect(utils.getTableMeta("authSessions")).toBeDefined();
  });

  for (const engine of ["sqlite", "mariadb", "postgresql"] as const) {
    for (const tableName of AUTH_TABLES) {
      it(`${engine}.${tableName}: every physical column is registered`, () => {
        const physical = schemaColumns(SCHEMAS[engine][tableName]);
        const meta = utils.getTableMeta(tableName);

        expect(physical.length).toBeGreaterThan(0);
        expect(meta).toBeDefined();
        const registered = new Set(meta!.columns);
        // A missing column is exactly the class of bug this guards: the
        // registered branch copies unknown keys verbatim — no JSON/date handling.
        expect(physical.filter((c) => !registered.has(c))).toEqual([]);
      });
    }
  }

  it("derived views stay consistent and expose the auth JSON/date columns", () => {
    expect(() => utils.assertTableRegistryConsistent("authUsers")).not.toThrow();
    expect(() => utils.assertTableRegistryConsistent("authSessions")).not.toThrow();

    expect(utils.getTableJsonColumns("authUsers")).toEqual(
      expect.arrayContaining(["roleIds", "preferences"]),
    );
    expect(utils.getTableDateColumns("authUsers")).toEqual(
      expect.arrayContaining(["createdAt", "updatedAt", "last2FAVerification", "lockoutUntil"]),
    );
    expect(utils.getTableDateColumns("authSessions")).toEqual(
      expect.arrayContaining(["expires", "mfaVerifiedAt"]),
    );
  });
});

// ============================================================================
// 2. Fast branch ≡ fallback branch (byte-identical auth rows)
// ============================================================================

function typedAuthUser(): Row {
  return {
    _id: "user-1",
    email: "ada@example.com",
    username: "ada",
    password: "hash",
    emailVerified: true,
    blocked: false,
    firstName: "Ada",
    lastName: "Lovelace",
    avatar: null,
    roleIds: ["editor", "author"],
    role: "editor",
    isAdmin: false,
    isRegistered: true,
    is2FAEnabled: true,
    totpSecret: null,
    backupCodes: ["a", "b"],
    last2FAVerification: new Date("2026-08-01T10:00:00.000Z"),
    authenticators: [{ id: "totp" }],
    preferences: { locale: "de" },
    failedAttempts: 2,
    lockoutUntil: new Date("2026-08-01T10:15:00.000Z"),
    tenantId: "tenant-1",
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-02T00:00:00.000Z"),
  };
}

/** SQLite raw path: epoch-ms INTEGERs + TEXT JSON, booleans as 0/1. */
function rawAuthUser(): Row {
  return {
    ...typedAuthUser(),
    roleIds: '["editor","author"]',
    backupCodes: '["a","b"]',
    authenticators: '[{"id":"totp"}]',
    preferences: '{"locale":"de"}',
    last2FAVerification: EPOCH_MS,
    lockoutUntil: EPOCH_MS,
    createdAt: EPOCH_MS,
    updatedAt: EPOCH_MS,
    emailVerified: 1,
    blocked: 0,
  };
}

/** MariaDB path: DATETIME / JSON come back as text. */
function textAuthUser(): Row {
  return {
    ...typedAuthUser(),
    roleIds: '["editor","author"]',
    preferences: '{"locale":"de"}',
    last2FAVerification: "2026-08-01 10:00:00.000",
    lockoutUntil: "2026-08-01 10:15:00.000",
    createdAt: "2026-07-01 00:00:00.000",
    updatedAt: "2026-07-02 00:00:00.000",
  };
}

function typedSession(): Row {
  return {
    _id: "session-1",
    user_id: "user-1",
    expires: new Date("2026-09-01T00:00:00.000Z"),
    tenantId: "tenant-1",
    userAgent: "vitest",
    deviceId: "device-1",
    ipAddress: "127.0.0.1",
    amr: ["pwd", "mfa"],
    mfaVerifiedAt: new Date("2026-09-01T00:00:00.000Z"),
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
  };
}

function rawSession(): Row {
  return {
    ...typedSession(),
    amr: '["pwd","mfa"]',
    expires: EPOCH_MS,
    mfaVerifiedAt: EPOCH_MS,
    createdAt: EPOCH_MS,
    updatedAt: EPOCH_MS,
  };
}

function textSession(): Row {
  return {
    ...typedSession(),
    amr: '["pwd","mfa"]',
    expires: "2026-09-01 00:00:00.000",
    mfaVerifiedAt: PG_TS,
    createdAt: "2026-08-01 00:00:00.000",
    updatedAt: "2026-08-01 00:00:00.000",
  };
}

const USER_SHAPES: Array<[string, RowFactory]> = [
  ["typed select (Date + parsed JSON)", typedAuthUser],
  ["SQLite raw (epoch ms + TEXT JSON)", rawAuthUser],
  ["MariaDB (DATETIME/JSON text)", textAuthUser],
];

const SESSION_SHAPES: Array<[string, RowFactory]> = [
  ["typed select (Date + parsed JSON)", typedSession],
  ["SQLite raw (epoch ms + TEXT JSON)", rawSession],
  ["MariaDB (DATETIME/JSON text)", textSession],
];

describe("auth row conversion — registered table vs no-schema fallback", () => {
  for (const [label, makeRow] of USER_SHAPES) {
    it(`authUsers · ${label}: identical output on both branches`, () => {
      const fast = utils.convertUserToISO(makeRow(), { table: "authUsers" });
      const fallback = utils.convertUserToISO(makeRow()); // no table → legacy walk

      expect(fast).toEqual(fallback);

      // Absolute checks on the fields that must never stay driver-native.
      expect(typeof fast.createdAt).toBe("string");
      expect(typeof fast.updatedAt).toBe("string");
      expect(Array.isArray(fast.roleIds)).toBe(true);
      expect(typeof fast.preferences).toBe("object");
      expect(fast.lockoutUntil === null || typeof fast.lockoutUntil === "string").toBe(true);
    });
  }

  for (const [label, makeRow] of SESSION_SHAPES) {
    it(`authSessions · ${label}: identical output on both branches`, () => {
      const source = makeRow();
      const fast = utils.convertArrayDatesToISO([source], { table: "authSessions" })[0];
      const fallback = utils.convertDatesToISO(makeRow());

      expect(fast).toEqual(fallback);

      expect(typeof fast.expires).toBe("string");
      expect(fast.mfaVerifiedAt === null || typeof fast.mfaVerifiedAt === "string").toBe(true);
      // `amr` is not a JSON_FIELDS member: the converter must leave the column
      // exactly as the driver returned it so `normalizeSessionAmr`
      // (parseJsonField) keeps its fallback semantics on every engine.
      expect(fast.amr).toEqual(source.amr);
      expect(utils.parseJsonField<string[]>(fast.amr, [])).toEqual(["pwd", "mfa"]);
    });
  }

  it("authSessions · in-place fast path matches the allocating path", () => {
    const inPlaceRows = [rawSession()];
    const inPlace = utils.convertArrayDatesToISO(inPlaceRows, {
      table: "authSessions",
      inPlace: true,
    });

    expect(inPlace).toBe(inPlaceRows); // same array, mutated in place
    expect(inPlace[0]).toEqual(utils.convertDatesToISO(rawSession()));
    expect(inPlace[0].expires).toBe(new Date(EPOCH_MS).toISOString());
    expect(inPlace[0].mfaVerifiedAt).toBe(new Date(EPOCH_MS).toISOString());
    expect(inPlace[0].amr).toBe('["pwd","mfa"]');
    expect(utils.parseJsonField<string[]>(inPlace[0].amr, [])).toEqual(["pwd", "mfa"]);
  });

  it("keeps null timestamps null on both branches (no invented values)", () => {
    const row: Row = {
      ...typedAuthUser(),
      roleIds: null,
      lockoutUntil: null,
      last2FAVerification: null,
    };
    const fast = utils.convertUserToISO({ ...row }, { table: "authUsers" });
    const fallback = utils.convertUserToISO({ ...row });

    expect(fast).toEqual(fallback);
    expect(fast.lockoutUntil).toBeNull();
    expect(fast.last2FAVerification).toBeNull();
  });

  it("normalizes postgres.js timestamptz text identically on both branches", () => {
    const row: Row = { ...typedAuthUser(), lockoutUntil: PG_TS };
    const fast = utils.convertUserToISO({ ...row }, { table: "authUsers" });
    const fallback = utils.convertUserToISO({ ...row });

    expect(fast).toEqual(fallback);
    expect(fast.lockoutUntil).toBe(PG_TS_ISO);
  });

  it("converts an empty result set without touching the registry", () => {
    expect(utils.convertArrayDatesToISO([], { table: "authSessions" })).toEqual([]);
  });
});
