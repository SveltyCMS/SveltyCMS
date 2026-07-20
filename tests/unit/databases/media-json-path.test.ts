/**
 * @file tests/unit/databases/media-json-path.test.ts
 * @description Unit tests for DB-native media JSON path builders (SQL + Mongo).
 */
import { describe, expect, it } from "vitest";
import {
  buildMediaJsonPathMongoFilter,
  buildMediaJsonPathSqlConditions,
  escapeRegex,
  metadataRelativePath,
  resolveMediaJsonSqlDialect,
} from "@src/databases/core/media-json-path";

describe("media-json-path", () => {
  describe("metadataRelativePath", () => {
    it("strips metadata. prefix for simple paths", () => {
      expect(metadataRelativePath("metadata.camera")).toBe("camera");
      expect(metadataRelativePath("metadata.exif.aperture")).toBe("exif.aperture");
    });

    it("rejects non-metadata, array indices, and unsafe paths", () => {
      expect(metadataRelativePath("filename")).toBeNull();
      expect(metadataRelativePath("metadata.tags[0]")).toBeNull();
      expect(metadataRelativePath("metadata.")).toBeNull();
      expect(metadataRelativePath("metadata.cam;drop")).toBeNull();
    });
  });

  describe("resolveMediaJsonSqlDialect", () => {
    it("maps adapter type strings", () => {
      expect(resolveMediaJsonSqlDialect({ type: "sqlite" })).toBe("sqlite");
      expect(resolveMediaJsonSqlDialect({ type: "postgresql" })).toBe("postgresql");
      expect(resolveMediaJsonSqlDialect({ dialect: "postgres" })).toBe("postgresql");
      expect(resolveMediaJsonSqlDialect({ type: "mariadb" })).toBe("mariadb");
      expect(resolveMediaJsonSqlDialect({})).toBe("sqlite");
    });
  });

  describe("buildMediaJsonPathSqlConditions", () => {
    it("builds conditions for metadata equality (all dialects)", () => {
      for (const dialect of ["sqlite", "postgresql", "mariadb"] as const) {
        const { conditions, unhandled, clauseCount } = buildMediaJsonPathSqlConditions(
          dialect,
          "metadata.camera = Canon",
        );
        expect(clauseCount).toBe(1);
        expect(unhandled).toBe(false);
        expect(conditions).toHaveLength(1);
      }
    });

    it("AND-combines multi-clause metadata filters", () => {
      const { conditions, unhandled, clauseCount } = buildMediaJsonPathSqlConditions(
        "sqlite",
        "metadata.camera ~ Canon; metadata.iso >= 400",
      );
      expect(clauseCount).toBe(2);
      expect(unhandled).toBe(false);
      expect(conditions).toHaveLength(2);
    });

    it("marks array-index and non-metadata clauses as unhandled", () => {
      const { conditions, unhandled, clauseCount } = buildMediaJsonPathSqlConditions(
        "sqlite",
        "metadata.tags[0] = nature; filename = shot.jpg",
      );
      expect(clauseCount).toBe(2);
      expect(unhandled).toBe(true);
      expect(conditions).toHaveLength(0);
    });

    it("returns empty for blank expression", () => {
      const r = buildMediaJsonPathSqlConditions("sqlite", "   ");
      expect(r.conditions).toEqual([]);
      expect(r.clauseCount).toBe(0);
    });
  });

  describe("buildMediaJsonPathMongoFilter", () => {
    it("builds case-insensitive eq filter", () => {
      const { filter, unhandled, clauseCount } =
        buildMediaJsonPathMongoFilter("metadata.camera = Canon");
      expect(clauseCount).toBe(1);
      expect(unhandled).toBe(false);
      expect(filter).toMatchObject({
        "metadata.camera": { $regex: "^Canon$", $options: "i" },
      });
    });

    it("builds numeric and multi-clause $and", () => {
      const { filter, unhandled } = buildMediaJsonPathMongoFilter(
        "metadata.camera ~ can; metadata.iso > 100",
      );
      expect(unhandled).toBe(false);
      expect(filter).toHaveProperty("$and");
      const and = (filter as { $and: unknown[] }).$and;
      expect(and).toHaveLength(2);
    });

    it("escapeRegex escapes special chars", () => {
      expect(escapeRegex("a+b")).toBe("a\\+b");
      expect(escapeRegex("x.y")).toBe("x\\.y");
    });
  });
});
