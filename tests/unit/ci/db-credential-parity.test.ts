/**
 * @file tests/unit/ci/db-credential-parity.test.ts
 * @description
 * Ensures docker-compose.yml, CI matrix, and integration runner defaults
 * all use the same official Docker image default credentials.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DOCKER_DEFAULT_DB_CREDENTIALS,
  getBenchmarkTestEnv,
  getBenchmarkUdhPgDatabase,
  UDH_BENCHMARK_FIXTURE_DB,
} from "@src/utils/test-db-credentials";

const ROOT = join(import.meta.dirname, "../../..");

function readRepoFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("Docker default DB credential parity", () => {
  it("docker-compose uses official image defaults (no custom testuser)", () => {
    const compose = readRepoFile("tests/docker-compose.yml");

    expect(compose).not.toContain("MONGO_INITDB_ROOT_USERNAME");
    expect(compose).not.toContain("MARIADB_USER:");
    expect(compose).toContain("MARIADB_ROOT_PASSWORD: mariadb");
    expect(compose).toContain("POSTGRES_PASSWORD: postgres");
    expect(compose).not.toContain("POSTGRES_USER:");
    expect(compose).toContain('pg_isready", "-U", "postgres"');
  });

  it("db-matrix.ts declares per-DB credentials matching test-db-credentials.ts", () => {
    const matrixSource = readRepoFile(".github/workflows/db-matrix.ts");

    for (const [db, expected] of Object.entries(DOCKER_DEFAULT_DB_CREDENTIALS)) {
      const userLiteral = JSON.stringify(expected.user);
      const passLiteral = JSON.stringify(expected.password);

      expect(matrixSource, `db-matrix missing db: "${db}" block`).toContain(`db: "${db}"`);
      expect(matrixSource).toContain(`db_user: ${userLiteral}`);
      expect(matrixSource).toContain(`db_password: ${passLiteral}`);
    }
  });

  it("getBenchmarkTestEnv mirrors ci.yml bench-core UDH_PG_DATABASE split", () => {
    expect(getBenchmarkUdhPgDatabase("postgresql")).toBe(UDH_BENCHMARK_FIXTURE_DB);
    expect(getBenchmarkUdhPgDatabase("mariadb")).toBe("sveltycms_test");

    const pgEnv = getBenchmarkTestEnv("postgresql");
    expect(pgEnv.UDH_PG_DATABASE).toBe(UDH_BENCHMARK_FIXTURE_DB);
    expect(pgEnv.PASSWORD_MIN_LENGTH).toBe("8");
    expect(pgEnv.BENCHMARK_NO_REDIS).toBe("1");

    const ci = readRepoFile(".github/workflows/ci.yml");
    expect(ci).toContain("UDH_PG_DATABASE:");
    expect(ci).toContain("sveltycms_udh_fixture");
  });

  it("ci.yml db-tests and bench-core use matrix db_user/db_password from db-matrix", () => {
    const ci = readRepoFile(".github/workflows/ci.yml");

    expect(ci).toContain("DB_USER: ${{ matrix.db_user }}");
    expect(ci).toContain("DB_PASSWORD: ${{ matrix.db_password }}");
    expect(ci).not.toContain("Create MongoDB test user");
    expect(ci).toMatch(
      /bench-core:[\s\S]*matrix: \$\{\{ fromJson\(needs\.db-matrix\.outputs\.matrix\) \}\}/,
    );
    expect(ci).toContain("- bench-core");
  });
});
