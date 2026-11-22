/**
 * @file tests/unit/databases/sql-query-builder-distinct.test.ts
 * @description Regression test for the fail-loud `distinct()` contract.
 *
 * The SQL query builders documented `distinct()` as a no-op and returned
 * `this`, so a caller would silently receive every duplicate row. A repo-wide
 * grep finds no caller, so the method now throws `UNSUPPORTED_OPERATION`
 * naming the adapter instead of returning wrong rows.
 */

import { describe, expect, it } from "vitest";
import {
  MARIADB_DIALECT,
  POSTGRES_DIALECT,
  SQLITE_DIALECT,
  SqlQueryBuilder,
  type SqlDialect,
  type SqlQueryBuilderCore,
} from "@src/databases/core/sql-query-builder";
import { AppError } from "@utils/error-handling";
import type { BaseEntity } from "@src/databases/db-interface";

interface Article extends BaseEntity {
  status: string;
}

const core: SqlQueryBuilderCore = { db: {} } as SqlQueryBuilderCore;

function catchError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return null;
}

describe("SqlQueryBuilder.distinct", () => {
  const dialects: SqlDialect[] = [SQLITE_DIALECT, MARIADB_DIALECT, POSTGRES_DIALECT];

  for (const dialect of dialects) {
    it(`throws UNSUPPORTED_OPERATION naming the ${dialect.id} adapter`, () => {
      const builder = new SqlQueryBuilder<Article>(core, "articles", dialect);

      const error = catchError(() => builder.distinct("status"));

      expect(error).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.code).toBe("UNSUPPORTED_OPERATION");
      expect(appError.status).toBe(501);
      expect(appError.message).toContain(dialect.id);
      expect(appError.message).toContain("distinct");
    });

    it(`rejects a field-less distinct() on ${dialect.id} too`, () => {
      const builder = new SqlQueryBuilder<Article>(core, "articles", dialect);

      const error = catchError(() => builder.distinct());

      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("UNSUPPORTED_OPERATION");
    });
  }
});
