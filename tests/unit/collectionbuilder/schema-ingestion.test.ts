/**
 * @file tests/unit/collectionbuilder/schema-ingestion.test.ts
 * @description Unit tests for the SQL DDL / JSON schema-ingestion engine.
 */

import { describe, expect, it } from "vitest";
import {
  parseJsonSample,
  parseSchemaInput,
  parseSqlDDL,
} from "@src/routes/(app)/config/collectionbuilder/schema-ingestion";

describe("schema-ingestion", () => {
  describe("parseSqlDDL", () => {
    it("parses a standard PostgreSQL/MySQL CREATE TABLE into fields", () => {
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
      expect(titleField?.widgetKey).toBe("Input");
      expect(titleField?.required).toBe(true);

      const priceField = result.fields.find((f) => f.db_fieldName === "price");
      expect(priceField?.widgetKey).toBe("Currency");

      const descField = result.fields.find((f) => f.db_fieldName === "description");
      expect(descField?.widgetKey).toBe("Markdown");

      const inStockField = result.fields.find((f) => f.db_fieldName === "in_stock");
      expect(inStockField?.widgetKey).toBe("Checkbox");
      expect(inStockField?.defaults?.defaultValue).toBe(true);

      const createdField = result.fields.find((f) => f.db_fieldName === "created_at");
      expect(createdField?.widgetKey).toBe("DateTime");

      const categoryField = result.fields.find((f) => f.db_fieldName === "category_id");
      expect(categoryField?.widgetKey).toBe("Relation");
      expect(categoryField?.defaults?.relationCollection).toBe("categories");
    });

    it("throws a descriptive error when SQL lacks CREATE TABLE", () => {
      expect(() => parseSqlDDL("SELECT * FROM users;")).toThrow(
        "Invalid SQL: Could not find a valid CREATE TABLE statement.",
      );
    });

    it("maps ENUM(...) columns to a populated Select widget", () => {
      const result = parseSqlDDL(
        `CREATE TABLE posts (status ENUM('draft', 'published', 'archived') NOT NULL);`,
      );
      const status = result.fields.find((f) => f.db_fieldName === "status");
      expect(status?.widgetKey).toBe("Select");
      expect(status?.defaults?.options).toEqual(["draft", "published", "archived"]);
      expect(status?.required).toBe(true);
    });

    it("maps CHECK (... IN (...)) constraints to a populated Select widget", () => {
      const result = parseSqlDDL(
        `CREATE TABLE items (kind VARCHAR(10) CHECK (kind IN ('a', 'b')));`,
      );
      const kind = result.fields.find((f) => f.db_fieldName === "kind");
      expect(kind?.widgetKey).toBe("Select");
      expect(kind?.defaults?.options).toEqual(["a", "b"]);
    });

    it("maps JSON columns to JsonEditor and array columns to Tags/Repeater", () => {
      const result = parseSqlDDL(`CREATE TABLE docs (meta JSONB, tags TEXT[], blobs JSONB[]);`);
      expect(result.fields.find((f) => f.db_fieldName === "meta")?.widgetKey).toBe("JsonEditor");
      expect(result.fields.find((f) => f.db_fieldName === "tags")?.widgetKey).toBe("Tags");
      expect(result.fields.find((f) => f.db_fieldName === "blobs")?.widgetKey).toBe("Repeater");
    });

    it("resolves relation targets against the live collection list", () => {
      const result = parseSqlDDL(`CREATE TABLE orders (product_id INT);`, ["Products"]);
      const product = result.fields.find((f) => f.db_fieldName === "product_id");
      expect(product?.widgetKey).toBe("Relation");
      expect(product?.defaults?.relationCollection).toBe("Products");
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

      expect(result.fields.find((f) => f.db_fieldName === "title")?.widgetKey).toBe("Input");
      expect(result.fields.find((f) => f.db_fieldName === "price")?.widgetKey).toBe("Currency");
      expect(result.fields.find((f) => f.db_fieldName === "published")?.widgetKey).toBe("Checkbox");
      expect(result.fields.find((f) => f.db_fieldName === "tags")?.widgetKey).toBe("Tags");
      expect(result.fields.find((f) => f.db_fieldName === "created_at")?.widgetKey).toBe(
        "DateTime",
      );
      expect(result.fields.find((f) => f.db_fieldName === "author")?.widgetKey).toBe("Relation");
    });

    it("resolves nested-object relations against existing collections", () => {
      const json = JSON.stringify({ author: { name: "Jane" } });
      const result = parseJsonSample(json, "Posts", ["Authors"]);
      expect(
        result.fields.find((f) => f.db_fieldName === "author")?.defaults?.relationCollection,
      ).toBe("Authors");
    });

    it("throws on invalid JSON", () => {
      expect(() => parseJsonSample("not a json")).toThrow("Invalid JSON");
    });

    it("throws on JSON that is not a key-value object", () => {
      expect(() => parseJsonSample("[1, 2, 3]")).toThrow("Invalid JSON");
    });
  });

  describe("parseSchemaInput", () => {
    it("dispatches SQL and JSON modes", () => {
      expect(parseSchemaInput({ mode: "sql", payload: "CREATE TABLE t (a INT);" }).name).toBe("T");
      expect(
        parseSchemaInput({ mode: "json", payload: '{"a": 1}', collectionName: "Things" }).name,
      ).toBe("Things");
    });

    it("forwards existing collections for relation resolution", () => {
      const result = parseSchemaInput({
        mode: "sql",
        payload: "CREATE TABLE orders (product_id BIGINT);",
        existingCollections: ["Products"],
      });
      expect(result.fields[0].defaults?.relationCollection).toBe("Products");
    });
  });
});
