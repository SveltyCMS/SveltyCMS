import { describe, expect, it } from "vitest";
import {
  collectionPresetToSchema,
  generateCollectionFileContent,
  getWizardPresetSchemas,
  isBenchmarkArtifact,
  isMockScanCollection,
  purgeBenchmarkCollectionArtifacts,
} from "@src/routes/setup/preset-collections.server";
import { PRESETS } from "@src/routes/setup/presets";

interface NamedField {
  db_fieldName?: string;
  widget?: { Name?: string };
  fields?: NamedField[];
  collection?: string;
  displayField?: string;
  multiple?: boolean;
  options?: string[];
  default?: unknown;
}

function fieldNamed(schema: { fields?: unknown }, name: string): NamedField | undefined {
  if (!Array.isArray(schema.fields)) return undefined;
  return (schema.fields as NamedField[]).find((field) => field.db_fieldName === name);
}

describe("preset-collections.server", () => {
  it("resolves blog preset from presets.ts with lowercase ids", async () => {
    const schemas = await getWizardPresetSchemas("blog");
    expect(schemas.length).toBe(3);
    expect(schemas.map((s) => s._id).sort()).toEqual(["authors", "categories", "posts"]);
  });

  it("wires blog relations, nested categories, and publishable plan prices", () => {
    const blog = PRESETS.find((preset) => preset.id === "blog");
    const posts = collectionPresetToSchema(
      blog!.collections!.find((collection) => collection.name === "posts")!,
    );
    const categories = collectionPresetToSchema(
      blog!.collections!.find((collection) => collection.name === "categories")!,
    );
    expect(fieldNamed(posts, "author")).toMatchObject({
      collection: "authors",
      displayField: "name",
    });
    expect(fieldNamed(posts, "categories")).toMatchObject({
      collection: "categories",
      displayField: "name",
      multiple: true,
    });
    expect(fieldNamed(posts, "tags")?.widget?.Name).toBe("Tags");
    expect(fieldNamed(categories, "parent")).toMatchObject({
      collection: "categories",
      displayField: "name",
    });

    const saas = PRESETS.find((preset) => preset.id === "saas");
    const pricing = collectionPresetToSchema(
      saas!.collections!.find((collection) => collection.name === "pricing")!,
    );
    expect(fieldNamed(pricing, "currency")?.default).toBe("EUR");
    expect(fieldNamed(pricing, "interval")?.options).toEqual(["month", "year", "once"]);
    expect(fieldNamed(pricing, "features")?.fields?.map((child) => child.db_fieldName)).toEqual([
      "text",
    ]);
    expect(saas?.features).toEqual(["Features", "Pricing plans", "Documentation"]);

    const agency = PRESETS.find((preset) => preset.id === "agency");
    const services = collectionPresetToSchema(
      agency!.collections!.find((collection) => collection.name === "services")!,
    );
    expect(fieldNamed(services, "features")?.widget?.Name).toBe("Repeater");
    expect(agency?.features).toEqual(["Projects", "Services", "Team"]);

    const corporate = PRESETS.find((preset) => preset.id === "corporate");
    expect(corporate?.features).toEqual(["Team", "Careers", "Press"]);
    const press = collectionPresetToSchema(
      corporate!.collections!.find((collection) => collection.name === "press")!,
    );
    expect(fieldNamed(press, "date")?.widget?.Name).toBe("DateTime");
  });

  it("generates valid collection files with _id and no dead widgets import", () => {
    const blog = PRESETS.find((p) => p.id === "blog");
    const posts = blog?.collections?.[0];
    expect(posts).toBeDefined();

    const content = generateCollectionFileContent(posts!);
    // The `@src/widgets` barrel was removed in df0ba4393 — generated files must not
    // reference it (it breaks svelte-check on config/collections and is stripped
    // by the compilation transformer anyway).
    expect(content).not.toContain('import { widgets } from "@src/widgets"');
    expect(content).toContain('_id: "posts"');
    expect(content).toContain("config/collections/posts.ts");
  });

  it("emits ecommerce variant children, relation targets, and checkout fields", () => {
    const ecommerce = PRESETS.find((p) => p.id === "ecommerce");
    const products = ecommerce?.collections?.find((collection) => collection.name === "products");
    const orders = ecommerce?.collections?.find((collection) => collection.name === "orders");
    const coupons = ecommerce?.collections?.find((collection) => collection.name === "coupons");
    expect(products).toBeDefined();
    expect(orders).toBeDefined();
    expect(coupons).toBeDefined();

    const productSchema = collectionPresetToSchema(products!);
    const variant = fieldNamed(productSchema, "variants");
    expect(variant?.widget?.Name).toBe("Repeater");
    expect(variant?.fields?.map((child) => child.db_fieldName)).toEqual([
      "sku",
      "title",
      "price",
      "inventory",
      "downloadable",
    ]);
    const categories = fieldNamed(productSchema, "categories");
    expect(categories?.collection).toBe("product_categories");
    expect(categories?.displayField).toBe("name");
    expect(categories?.multiple).toBe(true);
    expect(fieldNamed(productSchema, "stockStatus")).toBeUndefined();
    expect(fieldNamed(productSchema, "taxClass")?.options).toEqual(["standard", "reduced", "zero"]);
    const history = fieldNamed(productSchema, "priceHistory");
    expect(history?.widget?.Name).toBe("Repeater");
    expect(history?.fields?.map((child) => child.db_fieldName)).toEqual(["amount", "recordedAt"]);

    const carts = ecommerce?.collections?.find((collection) => collection.name === "carts");
    const cartSchema = collectionPresetToSchema(carts!);
    expect(fieldNamed(cartSchema, "invoiceNumber")).toBeUndefined();

    const orderSchema = collectionPresetToSchema(orders!);
    expect(fieldNamed(orderSchema, "stripePaymentIntentId")?.widget?.Name).toBe("Input");
    expect(fieldNamed(orderSchema, "trackingUrl")?.widget?.Name).toBe("Input");
    expect(fieldNamed(orderSchema, "shippingZone")).toBeUndefined();
    expect(fieldNamed(orderSchema, "paymentMethod")?.options).toEqual([
      "stripe",
      "cod",
      "bank_transfer",
    ]);
    expect(fieldNamed(orderSchema, "invoiceNumber")?.widget?.Name).toBe("Input");
    expect(fieldNamed(orderSchema, "withdrawalAt")?.widget?.Name).toBe("DateTime");

    const couponSchema = collectionPresetToSchema(coupons!);
    expect(fieldNamed(couponSchema, "expiresAt")?.widget?.Name).toBe("DateTime");

    const content = generateCollectionFileContent(products!);
    expect(content).toContain('collection: "product_categories"');
    expect(content).toContain('db_fieldName: "sku"');
    expect(content).not.toContain('import { widgets } from "@src/widgets"');
  });

  it("maps field types to core widget names for database schemas", () => {
    const blog = PRESETS.find((p) => p.id === "blog");
    const posts = blog?.collections?.[0];
    const schema = collectionPresetToSchema(posts!);
    const titleField = schema.fields?.find((f: any) => (f as any).db_fieldName === "title") as {
      widget?: { Name?: string };
    };
    expect(titleField?.widget?.Name).toBe("Input");
  });

  it("falls back to benchmark PRESET_COLLECTIONS for demo preset", async () => {
    const schemas = await getWizardPresetSchemas("demo");
    expect(schemas.some((s) => s._id === "BenchmarkStable")).toBe(true);
    expect(schemas.some((s) => s._id === "redirects")).toBe(true);
  });

  it("detects BenchmarkStable as a benchmark artifact", () => {
    expect(isBenchmarkArtifact("BenchmarkStable.ts")).toBe(true);
    expect(isBenchmarkArtifact("benchmarkstable.js")).toBe(true);
    expect(isBenchmarkArtifact("mock_collection_42.js")).toBe(true);
    expect(isBenchmarkArtifact("posts.ts")).toBe(false);
  });

  it("detects mock scan collections for GraphQL exclusion", () => {
    expect(isMockScanCollection("mock-collection-0", "Mock Collection 0")).toBe(true);
    expect(isMockScanCollection("mock_collection_42")).toBe(true);
    expect(isMockScanCollection("mockcollection42")).toBe(true);
    expect(isMockScanCollection("BenchmarkStable")).toBe(false);
    expect(isMockScanCollection("benchmark_authors")).toBe(false);
  });

  it("purge removes benchmark test workspaces", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const sourceDir = path.resolve("config/test-collections/purge-test");
    const compiledDir = path.resolve(".compiledCollections/test-collections/purge-test");
    try {
      await fs.mkdir(sourceDir, { recursive: true });
      await fs.mkdir(compiledDir, { recursive: true });
      const sourceArtifact = path.join(sourceDir, "BenchmarkStable.ts");
      const compiledArtifact = path.join(compiledDir, "BenchmarkStable.js");
      await fs.writeFile(sourceArtifact, "export default {};", "utf-8");
      await fs.writeFile(compiledArtifact, "export default {};", "utf-8");

      const removed = await purgeBenchmarkCollectionArtifacts();
      expect(removed).toBeGreaterThanOrEqual(2);
      expect(
        await fs
          .access(sourceArtifact)
          .then(() => true)
          .catch(() => false),
      ).toBe(false);
      expect(
        await fs
          .access(compiledArtifact)
          .then(() => true)
          .catch(() => false),
      ).toBe(false);
    } finally {
      // Hermetic: never leave benchmark artifacts in the repo, even on failure.
      await fs.rm(sourceDir, { recursive: true, force: true }).catch(() => {});
      await fs.rm(compiledDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});
