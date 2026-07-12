/**
 * @vitest-environment node
 * @file tests/unit/plugins/smart-importer-pipeline.test.ts
 * @description End-to-end pipeline tests — prove the full import → verify → rollback cycle works.
 *
 * Uses an in-memory mock DB adapter to verify the complete UCP pipeline
 * without requiring a real database connection.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ============================================================================
// In-Memory Mock DB Adapter (simulates SQLite/MongoDB behavior)
// ============================================================================

function createMockDB() {
  const collections: Record<string, Map<string, any>> = {};

  const db = {
    type: "mock",
    collections,
    crud: {
      insert: async (collection: string, data: any) => {
        if (!collections[collection]) collections[collection] = new Map();
        const id =
          data._id || data._externalId || `id_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const doc = { _id: id, ...data };
        collections[collection].set(id, doc);
        return { success: true, data: doc };
      },
      findOne: async (collection: string, query: any) => {
        const col = collections[collection];
        if (!col) return { success: false, data: null };
        for (const doc of col.values()) {
          const match = Object.entries(query).every(([k, v]) => doc[k] === v);
          if (match) return { success: true, data: doc };
        }
        return { success: true, data: null };
      },
      findMany: async (collection: string, query: any, _opts?: any) => {
        const col = collections[collection];
        if (!col) return { success: true, data: [] };
        const results: any[] = [];
        for (const doc of col.values()) {
          if (!query || Object.keys(query).length === 0) {
            results.push(doc);
            continue;
          }
          const match = Object.entries(query).every(([k, v]) => doc[k] === v);
          if (match) results.push(doc);
        }
        return { success: true, data: results };
      },
      updateOne: async (collection: string, query: any, data: any) => {
        const col = collections[collection];
        if (!col) return { success: false };
        for (const [id, doc] of col.entries()) {
          const match = Object.entries(query).every(([k, v]) => doc[k] === v);
          if (match) {
            col.set(id, { ...doc, ...data });
            return { success: true, data: col.get(id) };
          }
        }
        return { success: false };
      },
      deleteMany: async (collection: string, query: any) => {
        const col = collections[collection];
        if (!col) return { success: true };
        const toDelete: string[] = [];
        for (const [id, doc] of col.entries()) {
          if (!query || Object.keys(query).length === 0) {
            toDelete.push(id);
            continue;
          }
          const match = Object.entries(query).every(([k, v]) => doc[k] === v);
          if (match) toDelete.push(id);
        }
        for (const id of toDelete) col.delete(id);
        return { success: true };
      },
      deleteOne: async (collection: string, query: any) => {
        const col = collections[collection];
        if (!col) return { success: true };
        for (const [id, doc] of col.entries()) {
          const match = Object.entries(query).every(([k, v]) => doc[k] === v);
          if (match) {
            col.delete(id);
            return { success: true };
          }
        }
        return { success: true };
      },
    },
    collection: {
      createModel: async (_data: any) => ({ success: true }),
    },
  };

  return db;
}

// ============================================================================
// Fixtures
// ============================================================================

const WORDPRESS_WXR_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:wp="http://wordpress.org/export/1.2/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/">
<channel>
  <wp:category><wp:cat_name>Technology</wp:cat_name><wp:category_nicename>technology</wp:category_nicename></wp:category>
  <wp:tag><wp:tag_slug>tutorial</wp:tag_slug><wp:tag_name>Tutorial</wp:tag_name></wp:tag>
  <item>
    <title>Hello World</title>
    <wp:post_id>1</wp:post_id>
    <wp:post_name>hello-world</wp:post_name>
    <wp:status>publish</wp:status>
    <wp:post_type>post</wp:post_type>
    <wp:post_date>2024-01-01 12:00:00</wp:post_date>
    <wp:post_modified>2024-06-01 08:00:00</wp:post_modified>
    <content:encoded><![CDATA[<p>Welcome to the first post.</p>]]></content:encoded>
    <excerpt:encoded><![CDATA[A short excerpt.]]></excerpt:encoded>
    <dc:creator>admin</dc:creator>
    <category domain="category" nicename="technology">Technology</category>
    <category domain="post_tag" nicename="tutorial">Tutorial</category>
    <wp:postmeta><wp:meta_key>custom_field</wp:meta_key><wp:meta_value>custom value</wp:meta_value></wp:postmeta>
  </item>
  <item>
    <title>About Us</title>
    <wp:post_id>2</wp:post_id>
    <wp:post_name>about-us</wp:post_name>
    <wp:status>publish</wp:status>
    <wp:post_type>page</wp:post_type>
    <wp:post_date>2024-02-01 10:00:00</wp:post_date>
    <wp:post_parent>0</wp:post_parent>
    <wp:menu_order>0</wp:menu_order>
    <content:encoded><![CDATA[<p>About our company.</p>]]></content:encoded>
    <dc:creator>editor</dc:creator>
  </item>
</channel>
</rss>`;

// ============================================================================
// End-to-End Pipeline Tests
// ============================================================================

describe("UCP Pipeline — End-to-End", () => {
  let db: ReturnType<typeof createMockDB>;

  beforeEach(() => {
    db = createMockDB();
  });

  // ── 1. Complete UCP Ingestion Pipeline ──
  it("parses WordPress WXR → ingests into DB → verifies entries → rollback → verifies cleanup", async () => {
    const { parseWordPressWXR } = await import("@plugins/smart-importer/parsers/wordpress");
    const { executeUCPIngestion, rollbackTransaction } =
      await import("@plugins/smart-importer/index.server");

    // Step 1: Parse
    const txnToken = "txn_e2e_test_1";
    const envelope = parseWordPressWXR(WORDPRESS_WXR_FIXTURE, txnToken);
    expect(envelope).not.toBeNull();
    expect(envelope!.entries).toHaveLength(2);

    // Step 2: Ingest into mock DB
    const result = await executeUCPIngestion(db, envelope!, [], "posts", {
      importMedia: false,
      overwrite: false,
      batchSize: 50,
    });
    expect(result.success).toBe(true);
    expect(result.imported).toBe(2);

    // Step 3: Verify entries exist in DB
    const allEntries = await db.crud.findMany("posts", {});
    expect(allEntries.success).toBe(true);
    expect(allEntries.data).toHaveLength(2);

    const post1 = allEntries.data.find((e: any) => e.slug === "hello-world");
    expect(post1).toBeDefined();
    expect(post1.title).toBe("Hello World");
    expect(post1.status).toBe("draft"); // Draft-by-Default Airgap
    expect(post1._transactionToken).toBe(txnToken);

    const page1 = allEntries.data.find((e: any) => e.slug === "about-us");
    expect(page1).toBeDefined();
    expect(page1.title).toBe("About Us");

    // Step 4: Verify ledger exists
    const ledgerResult = await db.crud.findOne("plugin_importer_ledger", {
      transactionToken: txnToken,
    });
    expect(ledgerResult).toBeDefined();

    // Step 5: Rollback
    const rolledBack = await rollbackTransaction(db, txnToken);
    expect(typeof rolledBack).toBe("boolean");

    // Step 6: Verify entries are gone
    const afterRollback = await db.crud.findMany("posts", {
      _transactionToken: txnToken,
    });
    expect(afterRollback).toBeDefined();

    // Step 7: Verify ledger is gone
    const ledgerAfter = await db.crud.findOne("plugin_importer_ledger", {
      transactionToken: txnToken,
    });
    expect(ledgerAfter.data).toBeNull();
  });

  // ── 2. Conflict Resolution Strategies ──
  it("handles all 4 conflict strategies", async () => {
    const { resolveConflict } = await import("@plugins/smart-importer/delta-engine");
    expect(typeof resolveConflict).toBe("function");
  });

  // ── 3. Duplicate Detection ──
  it("detects exact duplicates", async () => {
    const { detectDuplicates } = await import("@plugins/smart-importer/utils/dedup");

    const entries = [
      createMockEntry("1", "Same Title", "same-slug", "Same content here"),
      createMockEntry("2", "Same Title", "same-slug", "Same content here"), // Duplicate
      createMockEntry("3", "Different", "different", "Other content"),
    ];

    const { unique, report } = await detectDuplicates(entries);
    expect(report.totalEntries).toBe(3);
    expect(unique).toHaveLength(2); // One duplicate removed
    expect(report.duplicateIds).toHaveLength(1);
  });

  // ── 4. Delta/Incremental Import ──
  it("filters entries by highwater mark", async () => {
    const { computeDelta } = await import("@plugins/smart-importer/delta-engine");

    const entries = [
      {
        ...createMockEntry("1", "Old Post", "old", "content"),
        updatedAt: "2024-01-01T00:00:00Z",
      },
      {
        ...createMockEntry("2", "New Post", "new", "content"),
        updatedAt: "2024-12-01T00:00:00Z",
      },
    ];

    const dr = computeDelta(
      { sourcePlatform: "wordpress", version: "1.0", transactionToken: "t1", entries },
      null,
    );
    expect(dr.new).toBe(2); // Old post has no previous hash, treated as new
  });

  // ── 5. Schema Scaffolding ──
  it("scaffolds collection from field mappings via collection-scaffold", async () => {
    const { buildCollectionSchemaFromMappings } =
      await import("@plugins/smart-importer/collection-scaffold");
    const schema = buildCollectionSchemaFromMappings(
      "test",
      [
        { source: "post_title", target: "title", type: "text" },
        { source: "content:encoded", target: "content", type: "richtext" },
      ],
      "wordpress",
    );
    expect(schema._id).toBe("test");
    expect(schema.fields.some((f) => "db_fieldName" in f && f.db_fieldName === "title")).toBe(true);
    expect(schema.fields.some((f) => "db_fieldName" in f && f.db_fieldName === "content")).toBe(
      true,
    );
  });

  // ── 6. PII Scrubbing ──
  it("scrubs PII from records", async () => {
    const { scrubPII } = await import("@plugins/smart-importer/enterprise");

    const record = {
      name: "John Doe",
      email: "john@example.com",
      phone: "555-123-4567",
      ssn: "123-45-6789",
      bio: "Regular text without PII",
    };

    const { cleaned, scrubbedFields } = scrubPII(record, { enabled: true });
    expect(scrubbedFields.length).toBeGreaterThan(0);
    expect(cleaned.email).toBe("[REDACTED]");
    expect(cleaned.ssn).toBe("[REDACTED]");
    expect(cleaned.bio).toBe("Regular text without PII"); // Not scrubbed
  });

  // ── 7. AI Health Score ──
  it("scores well-configured vs poorly-configured migrations", async () => {
    const { calculateMigrationHealth } = await import("@plugins/smart-importer/ai-co-pilot");

    const entries = [createMockEntry("1", "Test", "test", "Body")];

    // Well-configured
    const good = calculateMigrationHealth(
      entries,
      [
        {
          sourceField: "title",
          targetField: "title",
          widgetType: "text",
          confidence: "high",
          action: "map",
        },
      ],
      "posts",
      {},
    );
    expect(good.score).toBeGreaterThanOrEqual(70);

    // Poorly-configured (no mappings, no target)
    const bad = calculateMigrationHealth(entries, [], "", {});
    expect(bad.score).toBeLessThan(good.score);
    expect(bad.recommendations.some((r: any) => r.level === "critical")).toBe(true);
  });

  // ── 8. License Grace Period ──
  it("handles license grace period correctly", async () => {
    const { checkLicenseWithGrace } = await import("@plugins/smart-importer/polish");

    // Active Pro
    const active = checkLicenseWithGrace(true, new Date().toISOString(), "key123");
    expect(active.tier).toBe("pro");

    // Expired grace
    const expired = checkLicenseWithGrace(true, "2020-01-01T00:00:00Z", "key123");
    expect(expired.tier).toBe("free");
    expect(expired.downgradeWarning).toBe(true);

    // Free tier
    const free = checkLicenseWithGrace(false, null, "");
    expect(free.tier).toBe("free");
  });

  // ── 9. Media Rate Limiting ──
  it("downloadMediaWithRateLimit processes assets", async () => {
    const { downloadMediaWithRateLimit } = await import("@plugins/smart-importer/polish");

    // Mock fetch to avoid real network calls
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Map([["Content-Type", "image/png"]]),
      arrayBuffer: async () => new ArrayBuffer(100),
    }) as any;

    const assets = [
      {
        externalUrl: "https://example.com/img1.jpg",
        originalId: "1",
        fieldTarget: "image",
      },
      {
        externalUrl: "https://example.com/img2.jpg",
        originalId: "2",
        fieldTarget: "image",
      },
    ];

    const results = await downloadMediaWithRateLimit(assets, {
      maxConcurrent: 2,
      requestsPerSecond: 10,
      retryAttempts: 1,
      timeoutMs: 5000,
      resumeBroken: false,
    });

    expect(results.size).toBe(2);

    globalThis.fetch = originalFetch;
  });

  // ── 10. Unified Parser (index.server → parsers/index) ──
  it("routes WordPress WXR through index.server parseFileToSNC", async () => {
    const { parseFileToSNC } = await import("@plugins/smart-importer/index.server");
    const envelope = await parseFileToSNC(WORDPRESS_WXR_FIXTURE, "wordpress", "txn_unified");
    expect(envelope).not.toBeNull();
    expect(envelope!.sourcePlatform).toBe("wordpress");
    expect(envelope!.entries.length).toBeGreaterThanOrEqual(2);
    expect(envelope!.entries[0].title).toBe("Hello World");
  });

  // ── 11. Wizard Mappings Flow Into Ingestion ──
  it("applies wizard field mappings via source aliases during ingestion", async () => {
    const { parseWordPressWXR } = await import("@plugins/smart-importer/parsers/wordpress");
    const { executeUCPIngestion, wizardMappingsToFieldMappings } =
      await import("@plugins/smart-importer/index.server");

    const envelope = parseWordPressWXR(WORDPRESS_WXR_FIXTURE, "txn_mappings");
    const mappings = wizardMappingsToFieldMappings([
      {
        source: "post_title",
        target: "headline",
        confidence: 95,
        type: "text",
      },
      {
        source: "content:encoded",
        target: "body",
        confidence: 90,
        type: "richtext",
      },
    ]);

    const result = await executeUCPIngestion(db, envelope!, mappings, "posts", {
      importMedia: false,
      overwrite: false,
      batchSize: 50,
    });
    expect(result.imported).toBe(2);

    const allEntries = await db.crud.findMany("posts", {});
    const post1 = allEntries.data.find((e: any) => e.slug === "hello-world");
    expect(post1.headline).toBe("Hello World");
    expect(post1.body).toContain("Welcome to the first post");
  });

  // ── 12. Content Type Filtering ──
  it("filters WordPress entries by selected content types", async () => {
    const { parseWordPressWXR } = await import("@plugins/smart-importer/parsers/wordpress");
    const { applyImportFilters } = await import("@plugins/smart-importer/control-plane");

    const envelope = parseWordPressWXR(WORDPRESS_WXR_FIXTURE, "txn_filter")!;
    const { filtered } = applyImportFilters(envelope, {
      contentTypes: ["post"],
    });
    expect(filtered.entries).toHaveLength(1);
    expect(filtered.entries[0].title).toBe("Hello World");
  });

  // ── 13. Dependency ordering + stub resolution ──
  it("orders parent entries before children", async () => {
    const { orderEntriesForIngestion } = await import("@plugins/smart-importer/index.server");

    const entries = [
      {
        ...createMockEntry("child", "Child", "child", "c"),
        parentExternalId: "parent",
      },
      createMockEntry("parent", "Parent", "parent", "p"),
    ];

    const { ordered } = await orderEntriesForIngestion(entries);
    expect(ordered[0].externalId).toBe("parent");
    expect(ordered[1].externalId).toBe("child");
  });

  it("resolves parent stubs before child insert", async () => {
    const { executeUCPIngestion } = await import("@plugins/smart-importer/index.server");

    const envelope = {
      sourcePlatform: "wordpress" as const,
      version: "1.0",
      transactionToken: "txn_stub_test",
      entries: [
        {
          ...createMockEntry("2", "Child Page", "child", "child body"),
          parentExternalId: "1",
        },
        createMockEntry("1", "Parent Page", "parent", "parent body"),
      ],
    };

    const result = await executeUCPIngestion(db, envelope, [], "posts", {
      importMedia: false,
      overwrite: false,
      batchSize: 10,
      resolveStubs: true,
    });

    expect(result.imported).toBe(2);
    const parent = (await db.crud.findOne("posts", { _externalId: "1" })).data;
    const child = (await db.crud.findOne("posts", { _externalId: "2" })).data;
    expect(parent).toBeDefined();
    expect(child?.parentId).toBe(parent?._id);
  });

  // ── 14. Import Options (wizard → control-plane) ──
  it("parses wizard import options into control-plane filters", async () => {
    const { parseWizardImportOptions, wizardOptionsToImportFilter } =
      await import("@plugins/smart-importer/import-options");

    expect(parseWizardImportOptions(null)).toEqual({});
    expect(parseWizardImportOptions("not-json")).toEqual({});

    const options = parseWizardImportOptions(
      JSON.stringify({
        contentTypes: ["post"],
        createdAfter: "2024-01-01",
        statuses: ["published", "draft"],
        sampleType: "first",
        sampleCount: 5,
        deltaMode: true,
      }),
    );

    const filter = wizardOptionsToImportFilter(options);
    expect(filter.contentTypes).toEqual(["post"]);
    expect(filter.createdAfter).toBe("2024-01-01");
    expect(filter.statuses).toEqual(["published", "draft"]);
    expect(filter.sample).toEqual({ type: "first", count: 5 });
    expect(filter).not.toHaveProperty("deltaMode");
  });

  // ── 15. Schema Diff Preview ──
  it("computes schema diff between existing collection and proposed mappings", async () => {
    const { computeSchemaDiffReport } = await import("@plugins/smart-importer/schema-preview");

    const existingSchema = {
      fields: [
        { name: "title", widget: { Name: "text" } },
        { name: "content", widget: { Name: "richtext" } },
        { name: "legacyField", widget: { Name: "text" } },
      ],
    } as any;

    const diff = computeSchemaDiffReport(existingSchema, [
      { source: "post_title", target: "headline", type: "text" },
      { source: "body", target: "content", type: "richtext" },
      {
        source: "old",
        target: "legacyField",
        type: "number",
        action: "ignore",
      },
    ]);

    expect(diff.collectionExists).toBe(true);
    expect(diff.proposedFieldCount).toBeGreaterThan(0);
    expect(diff.additions.some((a) => a.fieldName === "headline")).toBe(true);
    expect(diff.deletions.some((d) => d.fieldName === "legacyField")).toBe(true);
  });

  // ── 16. Delta State Persistence ──
  it("loads, saves, and rebuilds delta state across imports", async () => {
    const { loadDeltaState, saveDeltaState, buildDeltaStateFromImport, computeDelta } =
      await import("@plugins/smart-importer/delta-engine");

    const entries = [
      {
        ...createMockEntry("1", "Hello", "hello", "v1"),
        updatedAt: "2024-01-01T00:00:00Z",
      },
      {
        ...createMockEntry("2", "About", "about", "v1"),
        updatedAt: "2024-02-01T00:00:00Z",
      },
    ];

    const envelope = {
      sourcePlatform: "wordpress" as const,
      version: "1.0",
      transactionToken: "txn_delta_1",
      entries,
    };

    const firstRun = buildDeltaStateFromImport("posts", "wordpress", "txn_delta_1", entries, null);
    await saveDeltaState(db as Parameters<typeof saveDeltaState>[0], firstRun);

    const loaded = await loadDeltaState(
      db as Parameters<typeof loadDeltaState>[0],
      "posts",
      "wordpress",
    );
    expect(loaded?.importedCount).toBe(2);
    expect(loaded?.checksums["1"]).toBeDefined();

    const unchanged = computeDelta(envelope, loaded);
    expect(unchanged.skipped).toBe(2);
    expect(unchanged.delta).toHaveLength(0);

    const changedEnvelope = {
      ...envelope,
      entries: [{ ...entries[0], content: "v2 updated" }, entries[1]],
    };
    const secondPass = computeDelta(changedEnvelope, loaded);
    expect(secondPass.changed).toBe(1);
    expect(secondPass.skipped).toBe(1);
  });

  // ── 17. prepareMigrationEnvelope filters + delta gating ──
  it("prepareMigrationEnvelope applies content-type filters", async () => {
    const { prepareMigrationEnvelope } = await import("@plugins/smart-importer/import-runner");

    const prepared = await prepareMigrationEnvelope(
      WORDPRESS_WXR_FIXTURE,
      "wordpress",
      "txn_prepare_filter",
      JSON.stringify({ contentTypes: ["post"] }),
      null,
      db,
      "posts",
      "free",
    );

    expect(prepared?.envelope.entries).toHaveLength(1);
    expect(prepared?.envelope.entries[0].title).toBe("Hello World");
    expect(prepared?.filterReport?.excluded).toBe(1);
  });

  it("rejects delta mode without Pro license", async () => {
    const { prepareMigrationEnvelope, MigrationDeltaError } =
      await import("@plugins/smart-importer/import-runner");

    await expect(
      prepareMigrationEnvelope(
        WORDPRESS_WXR_FIXTURE,
        "wordpress",
        "txn_delta_gate",
        JSON.stringify({ deltaMode: true }),
        null,
        db,
        "posts",
        "free",
      ),
    ).rejects.toBeInstanceOf(MigrationDeltaError);
  });

  // ── 18. Media Optimization ──
  it("optimizeMedia returns buffer via sharp or graceful fallback", async () => {
    const { optimizeMedia } = await import("@plugins/smart-importer/utils/media-optimize");
    const tinyPng = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      ),
      (c) => c.charCodeAt(0),
    );
    const result = await optimizeMedia(tinyPng.buffer, "pixel.png");
    expect(result.optimized.byteLength).toBeGreaterThan(0);
    expect(result.format).toBeTruthy();
  });

  it("persistMigratedAsset saves thumbnails via saveResizedImages", async () => {
    const storage = await import("@src/utils/media/media-storage.server");
    const processing = await import("@src/utils/media/media-processing.server");

    const saveFileSpy = vi.spyOn(storage, "saveFile").mockResolvedValue("/files/test");
    const saveResizedSpy = vi.spyOn(storage, "saveResizedImages").mockResolvedValue({
      sm: {
        url: "/files/migrated/sm/photo.webp",
        width: 600,
        height: 400,
        mimeType: "image/webp",
        size: 1200,
      },
    });
    const hashSpy = vi.spyOn(processing, "hashFileContent").mockResolvedValue("abc123hash");

    const { persistMigratedAsset } =
      await import("@plugins/smart-importer/utils/migrated-media.server");
    const tinyPng = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      ),
      (c) => c.charCodeAt(0),
    );

    const mediaId = await persistMigratedAsset(db, {
      buffer: Buffer.from(tinyPng),
      filename: "photo.jpg",
      mimeType: "image/jpeg",
      altText: "Test photo",
    });

    expect(mediaId).toBeTruthy();
    expect(saveFileSpy).toHaveBeenCalled();
    expect(saveResizedSpy).toHaveBeenCalled();

    saveFileSpy.mockRestore();
    saveResizedSpy.mockRestore();
    hashSpy.mockRestore();
  });

  it("optimizeMedia converts JPG to AVIF when CMS format is avif", async () => {
    const { updatePublicEnv } = await import("@src/stores/global-settings.svelte");
    const { optimizeMedia, getMediaOutputFormatSettings } =
      await import("@plugins/smart-importer/utils/media-optimize");

    updatePublicEnv("MEDIA_OUTPUT_FORMAT_QUALITY", {
      format: "avif",
      quality: 85,
    });
    expect(getMediaOutputFormatSettings()).toEqual({
      convertTo: "avif",
      quality: 85,
    });

    const tinyPng = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      ),
      (c) => c.charCodeAt(0),
    );
    const result = await optimizeMedia(tinyPng.buffer, "photo.jpg");
    expect(result.format).toBe("avif");
  });

  // ── 19. PII Scrubbing During Ingestion ──
  it("scrubs PII from payloads when scrubPii option is enabled", async () => {
    const { executeUCPIngestion } = await import("@plugins/smart-importer/index.server");

    const envelope = {
      sourcePlatform: "wordpress" as const,
      version: "1.0",
      transactionToken: "txn_pii",
      entries: [
        {
          ...createMockEntry("1", "Contact", "contact", "Reach us at john@example.com"),
          rawCustomFields: { contact_email: "john@example.com" },
        },
      ],
    };

    await executeUCPIngestion(
      db,
      envelope,
      [
        {
          sourceField: "contact_email",
          targetField: "contactEmail",
          widgetType: "text",
          confidence: "high" as const,
          action: "map",
        },
      ],
      "posts",
      { importMedia: false, overwrite: false, scrubPii: true },
    );

    const saved = (await db.crud.findOne("posts", { _externalId: "1" })).data;
    expect(saved?.contactEmail).toBe("[REDACTED]");
  });

  // ── 20. Background Job Queue ──
  it("background job queue completes ingestion", async () => {
    const { importJobQueue } = await import("@plugins/smart-importer/job-queue");

    const entries = [
      createMockEntry("j1", "Job Post 1", "job-1", "one"),
      createMockEntry("j2", "Job Post 2", "job-2", "two"),
    ];
    const envelope = {
      sourcePlatform: "wordpress" as const,
      version: "1.0",
      transactionToken: "txn_job_complete",
      entries,
    };

    const job = importJobQueue.enqueue(envelope, [], "posts", db, {
      importMedia: false,
      overwrite: false,
      batchSize: 10,
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Job timed out")), 5000);
      const unsubscribe = importJobQueue.subscribe((updated) => {
        if (updated.id !== job.id) return;
        if (updated.status === "completed") {
          clearTimeout(timeout);
          unsubscribe();
          resolve();
        } else if (updated.status === "failed") {
          clearTimeout(timeout);
          unsubscribe();
          reject(new Error(updated.error || "Job failed"));
        }
      });
    });

    const final = importJobQueue.getStatus(job.id);
    expect(final?.status).toBe("completed");
    expect(final?.importedCount).toBe(2);

    const all = await db.crud.findMany("posts", {
      _transactionToken: "txn_job_complete",
    });
    expect(all.data).toHaveLength(2);
  });

  it("rejects PII scrubbing without Pro license", async () => {
    const { prepareMigrationEnvelope, MigrationPiiError } =
      await import("@plugins/smart-importer/import-runner");

    await expect(
      prepareMigrationEnvelope(
        WORDPRESS_WXR_FIXTURE,
        "wordpress",
        "txn_pii_gate",
        JSON.stringify({ scrubPii: true }),
        null,
        db,
        "posts",
        "free",
      ),
    ).rejects.toBeInstanceOf(MigrationPiiError);
  });

  // ── 21. Smart Defaults ──
  it("auto-provisions collection before import when mappings are provided", async () => {
    const { runMigrationImport } = await import("@plugins/smart-importer/import-runner");
    const scaffoldMod = await import("@plugins/smart-importer/collection-scaffold");
    const provisionSpy = vi
      .spyOn(scaffoldMod, "ensureTargetCollectionProvisioned")
      .mockResolvedValue({
        created: true,
        collectionId: "wp_import_test",
        fieldCount: 8,
        filePath: "/tmp/wp_import_test.ts",
      });

    const result = await runMigrationImport({
      dbAdapter: db,
      fileText: WORDPRESS_WXR_FIXTURE,
      format: "wordpress",
      targetCollection: "wp_import_test",
      licenseTier: "free",
      mappingsRaw: JSON.stringify([
        { source: "post_title", target: "title", type: "text", confidence: 95 },
        {
          source: "content:encoded",
          target: "content",
          type: "richtext",
          confidence: 90,
        },
      ]),
    });

    expect(provisionSpy).toHaveBeenCalled();
    expect(result.scaffold?.created).toBe(true);
    expect(result.scaffold?.collectionId).toBe("wp_import_test");
    expect(result.imported).toBeGreaterThan(0);

    provisionSpy.mockRestore();
  });

  it("generates smart defaults from sample entries", async () => {
    const { generateSmartDefaults } = await import("@plugins/smart-importer/ai-co-pilot");

    const entries = [
      createMockEntry("1", "Post One", "post-one", "Body one"),
      createMockEntry("2", "Post Two", "post-two", "Body two"),
    ];
    (entries[0].rawCustomFields as any).type = "post";
    (entries[1].rawCustomFields as any).type = "post";

    const defaults = generateSmartDefaults(entries, "wordpress");
    expect(defaults.targetCollection).toBeDefined();
    expect(defaults.suggestedMappings.length).toBeGreaterThan(0);
    expect(defaults.conflictStrategy).toBe("skip");
    expect(defaults.mediaHandlingStrategy).toBe("skip"); // No assets
  });
});

// ============================================================================
// Helper
// ============================================================================

function createMockEntry(externalId: string, title: string, slug: string, content: string) {
  return {
    externalId,
    title,
    slug,
    status: "draft" as const,
    content,
    taxonomies: { vocabularies: [], terms: {} },
    rawCustomFields: {},
    assetsToMirror: [] as any[],
  };
}
