/**
 * @file src/plugins/unified-data-hub/server/postgres-fixture.ts
 * @description External Postgres connector fixture (not the CMS database).
 *
 * SveltyCMS is database-agnostic — plugin metadata lives in whichever CMS adapter
 * is active (sqlite | mongodb | mariadb | postgresql). This module seeds the
 * **external** Postgres instance the Postgres *connector* reads from (Docker
 * `sveltycms_test` at 127.0.0.1:5432). Independent of CMS `DB_TYPE` / `DB_NAME`.
 *
 * Features:
 * - Reachability probe for opt-in CI tasks
 * - Idempotent schema/table seed with configurable row count
 */

import postgres from "postgres";
import {
  getDockerDefaultDbCredentials,
  getIntegrationDbName,
} from "@src/utils/test-db-credentials";

export const FIXTURE_SCHEMA = "udh_fixture";
export const FIXTURE_TABLE = "articles";
export const FIXTURE_SLUG = "bench-articles";
export const FIXTURE_AUTHORS_TABLE = "authors";
export const FIXTURE_AUTHORS_SLUG = "bench-authors";

const IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function assertIdentifier(value: string): string {
  if (!IDENTIFIER.test(value)) {
    throw new Error(`Invalid SQL identifier: ${value}`);
  }
  return value;
}

/** Connection string for the external federation Postgres (Docker default). */
export function getFixtureConnectionString(): string {
  const host = process.env.UDH_PG_HOST || process.env.DB_HOST || "127.0.0.1";
  const port = process.env.UDH_PG_PORT || process.env.DB_PORT || "5432";
  // UDH fixture uses Docker integration DB — not CMS DB_NAME (benchmarks set bench_parent).
  const database = process.env.UDH_PG_DATABASE || getIntegrationDbName();
  const creds = getDockerDefaultDbCredentials("postgresql");
  const user = process.env.UDH_PG_USER || process.env.DB_USER || creds.user;
  const password = process.env.UDH_PG_PASSWORD || process.env.DB_PASSWORD || creds.password;
  const encoded = encodeURIComponent(password);
  return `postgres://${user}:${encoded}@${host}:${port}/${database}`;
}

export async function isPostgresFixtureReachable(): Promise<boolean> {
  try {
    const sql = postgres(getFixtureConnectionString(), {
      max: 1,
      connect_timeout: 3,
      prepare: false,
    });
    await sql`SELECT 1 as ok`;
    await sql.end({ timeout: 2 });
    return true;
  } catch {
    return false;
  }
}

export async function seedPostgresBenchFixture(
  options: { rowCount?: number } = {},
): Promise<number> {
  const rowCount = Math.max(1, options.rowCount ?? 100);
  const schema = assertIdentifier(FIXTURE_SCHEMA);
  const table = assertIdentifier(FIXTURE_TABLE);

  const sql = postgres(getFixtureConnectionString(), { max: 1, prepare: false });
  try {
    await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
    const authorsTable = assertIdentifier(FIXTURE_AUTHORS_TABLE);

    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS "${schema}"."${authorsTable}" (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL
      )
    `);
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS "${schema}"."${table}" (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        slug TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'publish'
      )
    `);
    await sql.unsafe(`
      ALTER TABLE "${schema}"."${table}"
      ADD COLUMN IF NOT EXISTS author_id INTEGER REFERENCES "${schema}"."${authorsTable}"(id)
    `);
    await sql.unsafe(`TRUNCATE TABLE "${schema}"."${table}" RESTART IDENTITY CASCADE`);
    await sql.unsafe(`TRUNCATE TABLE "${schema}"."${authorsTable}" RESTART IDENTITY`);

    const authorCount = Math.min(10, Math.max(1, rowCount));
    const authorValues: string[] = [];
    const authorParams: unknown[] = [];
    let authorParam = 1;
    for (let i = 0; i < authorCount; i++) {
      authorValues.push(`($${authorParam++})`);
      authorParams.push(`Bench Author ${i + 1}`);
    }
    await sql.unsafe(
      `INSERT INTO "${schema}"."${authorsTable}" (name) VALUES ${authorValues.join(", ")}`,
      authorParams as never[],
    );

    const values: string[] = [];
    const params: unknown[] = [];
    let param = 1;
    for (let i = 0; i < rowCount; i++) {
      values.push(`($${param++}, $${param++}, $${param++}, $${param++})`);
      params.push(
        `Bench Article ${i + 1}`,
        `bench-article-${i + 1}`,
        "publish",
        (i % authorCount) + 1,
      );
    }

    await sql.unsafe(
      `INSERT INTO "${schema}"."${table}" (title, slug, status, author_id) VALUES ${values.join(", ")}`,
      params as never[],
    );

    return rowCount;
  } finally {
    await sql.end({ timeout: 5 });
  }
}
