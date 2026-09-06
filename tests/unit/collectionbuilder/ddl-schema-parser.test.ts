/**
 * @file tests/unit/collectionbuilder/ddl-schema-parser.test.ts
 * @description Unit tests for SQL DDL and JSON sample schema parser.
 */

import { describe, expect, it } from "vitest";
import {
  parseJsonSample,
  parseSqlDDL,
} from "@src/routes/(app)/config/collectionbuilder/nested-content/ddl-schema-parser";

describe("ddl-schema-parser", () => {
  describe("parseSqlDDL", () => {
    it("parses standard PostgreSQL/MySQL CREATE TABLE statement into fields", () => {
      const sql = `
        CREATE TABLE products (
          id INT PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          price DECIMAL(10, 2),
          description TEXT,
          in_stock BOOLEAN DEFAULT true,
          created_at TIMESTAMP,
          category_id INT REFERENCES categories(id)
        );
      `;

      const result = parseSqlDDL(sql);
      expect(result.name).toBe("Products");
      expect(result.slug).toBe("products");
      expect(result.fields).toHaveLength(6);

      const titleField = result.fields.find((f) => f.db_fieldName === "title");
      expect(titleField?.widgetKey).toBe("input");
      expect(titleField?.required).toBe(true);

      const priceField = result.fields.find((f) => f.db_fieldName === "price");
      expect(priceField?.widgetKey).toBe("currency");

      const descField = result.fields.find((f) => f.db_fieldName === "description");
      expect(descField?.widgetKey).toBe("markdown");

      const inStockField = result.fields.find((f) => f.db_fieldName === "in_stock");
      expect(inStockField?.widgetKey).toBe("boolean");

      const createdField = result.fields.find((f) => f.db_fieldName === "created_at");
      expect(createdField?.widgetKey).toBe("date");

      const categoryField = result.fields.find((f) => f.db_fieldName === "category_id");
      expect(categoryField?.widgetKey).toBe("relation");
      expect(categoryField?.defaults?.relationCollection).toBe("categories");
    });

    it("throws a descriptive error when SQL lacks CREATE TABLE", () => {
      expect(() => parseSqlDDL("SELECT * FROM users;")).toThrow(
        "Invalid SQL: Could not find a valid CREATE TABLE statement.",
      );
    });
  });

  describe("parseJsonSample", () => {
    it("parses a JSON sample payload into fields", () => {
      const json = JSON.stringify({
        title: "Introduction to AI",
        price: 29.99,
        published: true,
        tags: ["tech", "ai", "guide"],
        created_at: "2026-09-01T12:00:00Z",
        author: { name: "John Doe" },
      });

      const result = parseJsonSample(json, "Articles");
      expect(result.name).toBe("Articles");
      expect(result.slug).toBe("articles");

      expect(result.fields.find((f) => f.db_fieldName === "title")?.widgetKey).toBe("input");
      expect(result.fields.find((f) => f.db_fieldName === "price")?.widgetKey).toBe("currency");
      expect(result.fields.find((f) => f.db_fieldName === "published")?.widgetKey).toBe("boolean");
      expect(result.fields.find((f) => f.db_fieldName === "tags")?.widgetKey).toBe("tags");
      expect(result.fields.find((f) => f.db_fieldName === "created_at")?.widgetKey).toBe("date");
      expect(result.fields.find((f) => f.db_fieldName === "author")?.widgetKey).toBe("relation");
    });

    it("throws on invalid JSON", () => {
      expect(() => parseJsonSample("not a json")).toThrow("Invalid JSON");
    });
  });
});
