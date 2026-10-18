/**
 * @file src/routes/api/[...path]/handlers/testing/testing-seed.ts
 * @description Seed, fixture, and benchmark data actions for the testing API.
 */

import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger";
import { contentSystem } from "@src/content/index.server";
import { getSchemaPath } from "@src/content/first-collection";
import { collectionTableName } from "@src/databases/core/collection-name";
import type { DatabaseId } from "@src/databases/db-interface";
import { generateUUID, deepClone } from "@utils/native-utils";
import { withSystemScope } from "@src/databases/system-tenant-scope";
import {
  loadCacheServiceModule,
  loadEngineServerModule,
  loadHandleTurboGetModule,
  rawResponse,
  setTestingSessionCookie,
  type TestingContext,
} from "./testing-shared";

export async function handleTestingSeedRoutes(ctx: TestingContext): Promise<Response | undefined> {
  const { event, cms, tenantId, params, initializedAdapter, action } = ctx;

  if (action === "seed") {
    const { email, password, username } = params;
    if (!email || !password) throw new AppError("Email and password required for seeding", 400);

    logger.debug("Seeding test user", { email, tenantId });

    // Seed default roles if missing (crucial after database reset/wipe)
    try {
      const { seedRoles } = await import("@src/routes/setup/seed");
      await seedRoles(initializedAdapter, tenantId);
    } catch (err: any) {
      logger.warn(`[TestingHandler] Non-fatal role seeding error: ${err.message}`);
    }

    // Idempotent seed: createUser then update-by-email on conflict.
    // NEVER wipe auth_users here — chromium shards call seed in parallel and a
    // full DELETE invalidates every other worker's admin session mid-test.
    // Use action=reset when a true clean slate is required (serial auth-setup).

    const seedOpts = { tenantId } as any;
    // Role defaults to admin for backward compatibility; tests that need a
    // non-admin reset pass an explicit role (e.g. the p0 password afterEach).
    const explicitRole = params.role ? String(params.role) : undefined;
    const seedRole = explicitRole || "admin";
    let result: any = await cms.auth.createUser(
      {
        email,
        password,
        username: username || email.split("@")[0],
        role: seedRole,
        isAdmin: seedRole === "admin",
        isRegistered: true,
        emailVerified: true,
      },
      seedOpts,
    );
    if (!result?.success) {
      // User likely already exists — update password/role instead.
      const existing = await cms.auth.getUserByEmail(email, seedOpts);
      if (existing?.success && existing?.data) {
        // 🛡️ PRESERVE ROLE on re-seed unless explicitly requested: the login
        // retry seeds without a role, and forcing role=admin there silently
        // turned test users into superusers — every permission-denial E2E
        // assertion (media:write, config:accessManagement) then broke.
        const currentRole = (existing.data as { role?: string }).role;
        const resolvedRole = explicitRole || currentRole || "admin";
        await cms.auth.updateUserAttributes(
          (existing.data as { _id: string })._id,
          {
            password,
            username: username || email.split("@")[0],
            role: resolvedRole,
            isAdmin: explicitRole ? resolvedRole === "admin" : !!(existing.data as any).isAdmin,
            isRegistered: true,
            emailVerified: true,
            failedAttempts: 0,
            lockoutUntil: null,
          },
          // Testing seed may re-apply role; never available on public product APIs
          { ...seedOpts, allowPrivilegeEscalation: true },
        );
        result = { success: true, data: existing.data };
      }
    }

    logger.debug("Seed user creation result", {
      success: result.success,
      error: (result as any).message,
    });

    // Seed default theme
    const { DEFAULT_THEME } = await import("@src/databases/theme-manager");

    // 🚀 HARDENING: Ensure all DEFAULT_THEME properties are strings or null (no undefined)
    const safeTheme = deepClone(DEFAULT_THEME);
    await initializedAdapter.system.themes.ensure(safeTheme);

    const { ThemeManager } = await import("@src/databases/theme-manager");
    const themeManager = ThemeManager.getInstance();
    if (themeManager.isInitialized()) {
      await themeManager.refresh();
    }

    // Seed dynamic collection schemas from the filesystem into the database
    try {
      await contentSystem.initialize(tenantId, { force: true });
    } catch (err: any) {
      logger.warn(`[TestingHandler] Non-fatal collection seeding error: ${err.message}`);
    }

    // Seed system settings (idempotent) — the DB reset wiped them, and without
    // them the settings-service cache serves defaults (e.g. SITE_STARTER_ENABLED
    // unset → guests get redirected from / to /login despite a seeded site).
    try {
      const { seedSettings } = await import("@src/routes/setup/seed");
      await seedSettings(initializedAdapter, tenantId);
    } catch (err: any) {
      logger.warn(`[TestingHandler] Non-fatal settings seeding error: ${err.message}`);
    }

    // Invalidate setup cache so the system recognizes it is now COMPLETE
    const { invalidateSetupCache } = await import("@src/utils/server/setup-check");
    invalidateSetupCache(false, true);

    // Invalidate roles and user count caches so they are reloaded after seeding
    try {
      const { invalidateUserCountCache, invalidateRolesCache } =
        await import("@src/hooks/handle-authorization");
      await invalidateUserCountCache(tenantId);
      await invalidateRolesCache(tenantId);
    } catch (err: any) {
      logger.warn(
        `[TestingHandler] Non-fatal cache invalidation error during seeding: ${err.message}`,
      );
    }

    if (!result?.success) {
      return rawResponse({
        success: false,
        message: (result as any)?.message || "Seed failed",
        data: null,
      });
    }

    // Optional session (createSession:true) for auth-setup storageState capture.
    // Default is user-only so firstuser UI login tests can still open /login.
    let sessionId: string | undefined;
    const wantSession =
      params.createSession === true || params.createSession === "true" || params.session === true;
    let seedSetCookie: string | undefined;
    if (wantSession) {
      try {
        const loginResult = await cms.auth.login({ email, password }, { tenantId });
        if (loginResult.success && loginResult.data?.session?._id) {
          sessionId = loginResult.data.session._id;
          const cookie = await setTestingSessionCookie(event, sessionId!);
          seedSetCookie = cookie.setCookieHeader;
        }
      } catch (err: any) {
        logger.warn(`[TestingHandler] Non-fatal seed login/session error: ${err.message}`);
      }
    }

    const seedHeaders: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (sessionId) {
      seedHeaders["x-test-session-id"] = sessionId;
      if (seedSetCookie) seedHeaders["Set-Cookie"] = seedSetCookie;
    }

    // Ensure system state transitions to READY after seeding completes
    const { setSystemState } = await import("@src/stores/system/state.svelte.ts");
    setSystemState("READY", "Seeded test environment");

    return new Response(
      JSON.stringify({
        success: true,
        message: "System seeded successfully",
        data: result.data,
        token: sessionId,
      }),
      {
        status: 200,
        headers: seedHeaders,
      },
    );
  }

  if (action === "create-collection" || action === "bulk-create-collections") {
    const schemas =
      action === "bulk-create-collections"
        ? params.schemas
        : [params.schema || params.data || params];
    if (!Array.isArray(schemas)) throw new AppError("Invalid schemas format", 400);

    const results = [];
    for (const schema of schemas) {
      const collectionId = schema._id || schema.id || schema.name;
      try {
        logger.debug(`[testing] Provisioning collection: ${collectionId}...`);
        await initializedAdapter.collection.createModel(schema);
        logger.debug(`[testing] Model created for: ${collectionId}`);

        if (initializedAdapter.content?.nodes?.upsertContentStructureNode) {
          logger.debug(
            `[testing] Upserting content node for ${collectionId} (tenant: ${tenantId})`,
          );
          const node: any = {
            _id: collectionId,
            path: getSchemaPath(schema),
            name: schema.name || collectionId,
            nodeType: "collection",
            collectionDef: { ...schema, _id: collectionId },
            status: "publish",
            source: "api",
            tenantId,
          };
          const upsertRes = await initializedAdapter.content.nodes.upsertContentStructureNode(node);
          logger.debug(
            `[testing] Content node upsert result for ${collectionId}: ${upsertRes.success ? "OK" : "FAILED"}`,
          );
          if (!upsertRes.success) {
            // Expected during parallel seed — duplicate collection upsert is normal.
            // Don't spam ERROR with full SQL dumps.
            logger.debug(
              `[testing] Upsert conflict for ${collectionId} (expected in parallel seed)`,
            );
          }
        }
        results.push({ id: collectionId, success: true });
      } catch (e: any) {
        logger.error(`[testing] Failed to provision ${collectionId}:`, e.message);
        results.push({
          id: collectionId,
          success: false,
          error: e.message,
        });
      }
    }

    // Allow MongoDB write concerns to flush before cache refresh
    if (initializedAdapter.type === "mongodb") {
      await new Promise((r) => setTimeout(r, 100));
    }
    // 🚀 BATCH SYNC: Refresh once for all collections
    const { refreshContent } = await loadEngineServerModule();
    await refreshContent(tenantId, {
      mode: "schemas",
      adapter: initializedAdapter,
    });

    // 🚀 INVALIDATE OpenAPI spec cache so new collections appear in the API spec
    const { apiSpecService } = await import("@services/system/api-spec-service");
    await apiSpecService.invalidateCache(tenantId);

    // 🚀 SDK CACHE CLEAR: Force the shared CMS instance to drop stale schemas
    if (cms.collections?.refresh) {
      await cms.collections.refresh(tenantId as any, true);
    }

    return rawResponse({ success: results.every((r) => r.success), results });
  }

  if (action === "seed-throughput-docs") {
    const count = params.count || 1000;
    const collectionId = params.collectionId || "BenchmarkStable";
    const adapter = initializedAdapter;

    // Ensure collection exists
    try {
      await adapter.collection.createModel({
        _id: collectionId,
        name: collectionId,
        fields: [
          {
            db_fieldName: "title",
            widget: { Name: "Input" },
            type: "string",
          },
          {
            db_fieldName: "count",
            widget: { Name: "Input" },
            type: "number",
          },
        ],
      });
    } catch {
      /* already exists */
    }

    // Clear existing throughput docs to prevent UNIQUE constraint violations
    try {
      await adapter.crud.deleteMany(
        collectionId,
        {},
        {
          tenantId,
          permanent: true,
          confirmWipe: true,
        },
      );
    } catch (err: any) {
      logger.warn(
        `[testing] Failed to clear collection ${collectionId} before seeding: ${err.message}`,
      );
    }

    // High-throughput seed: large batches, single outer txn (one fsync), skip RETURNING
    const BATCH = 5000;
    let seeded = 0;
    const insertOpts = {
      tenantId,
      ...withSystemScope("testing"),
      skipReturning: true,
    };

    const executeSeed = async (db: any) => {
      for (let i = 0; i < count; i += BATCH) {
        const end = Math.min(i + BATCH, count);
        const docs = Array.from({ length: end - i }, () => ({
          _id: generateUUID(),
          title: `Throughput Doc`,
          count: 0,
          tenantId,
        }));
        // Prefer tx.crud.insertMany (SQLite txn object) or adapter.crud
        const crud = db?.crud ?? db;
        await crud.insertMany(collectionId, docs, insertOpts);
        seeded += docs.length;
      }
      return { success: true as const, data: seeded };
    };

    if (typeof (adapter as any).transaction === "function") {
      const txResult = await (adapter as any).transaction(async (txAdapter: any) => {
        return executeSeed(txAdapter);
      });
      if (txResult && txResult.success === false) {
        throw new AppError(
          txResult.message || "Seed transaction failed",
          500,
          "SEED_TRANSACTION_FAILED",
        );
      }
    } else {
      await executeSeed(adapter);
    }

    return rawResponse({ success: true, seeded, collectionId });
  }

  if (action === "create-redirect") {
    const { from, to, status } = params;
    const source = from || params.source;
    const target = to || params.target;
    if (!source || !target) throw new AppError("source and target required", 400);

    try {
      await initializedAdapter.crud.insert("redirectsMV", {
        _id: (source.replace(/\//g, "_") || generateUUID()) as any,
        source,
        target,
        type: status || params.type || 301,
        active: true,
        tenantId,
      } as any);

      // Clear redirect cache
      const { invalidateRedirectCache } = await import("@src/hooks/handle-redirects");
      invalidateRedirectCache(tenantId);

      return rawResponse({ success: true });
    } catch (err: any) {
      return rawResponse(
        {
          success: false,
          message: err.message,
        },
        500,
      );
    }
  }

  if (action === "insert") {
    const collectionId = params.collectionId || params.collection;
    const data = params.data;

    if (!collectionId) throw new AppError("collection or collectionId required", 400);
    if (!data || typeof data !== "object") throw new AppError("data payload required", 400);

    const result = await initializedAdapter.crud.insert(collectionId, data, {
      tenantId,
      ...withSystemScope("testing"),
    });

    // Role writes via the testing API must invalidate the permission cache —
    // see the update action below for the full rationale.
    if (collectionId === "roles") {
      const { invalidatePermissionCache } = await import("@src/databases/auth/permissions");
      invalidatePermissionCache();
      const { clearTurboAuthCache } = await loadHandleTurboGetModule();
      clearTurboAuthCache();
    }

    const responseBody = result.success
      ? {
          success: true,
          data: result.data,
          message: "Insert successful",
        }
      : {
          success: false,
          message: result.message,
        };

    return rawResponse(responseBody, result.success ? 200 : 400);
  }

  if (action === "update") {
    const collectionId = params.collectionId || params.collection;
    const id = params.id;
    const data = params.data;

    if (!collectionId) throw new AppError("collection or collectionId required", 400);
    if (!id) throw new AppError("id required", 400);
    if (!data || typeof data !== "object") throw new AppError("data payload required", 400);

    const result = await initializedAdapter.crud.update(collectionId, id, data, {
      tenantId,
      ...withSystemScope("testing"),
    });

    // Role mutations via the testing API bypass AuthNamespace.updateRoles (which
    // invalidates the permission cache globally). Without this, hasPermissionWithRoles
    // keeps serving the pre-removal grant for up to 5 minutes (PermissionCache TTL)
    // and permission-removal E2E assertions flake.
    if (collectionId === "roles") {
      const { invalidatePermissionCache } = await import("@src/databases/auth/permissions");
      invalidatePermissionCache();
      const { clearTurboAuthCache } = await loadHandleTurboGetModule();
      clearTurboAuthCache();
    }

    const responseBody = result.success
      ? {
          success: true,
          data: result.data,
          message: "Update successful",
        }
      : {
          success: false,
          message: result.message,
        };

    return rawResponse(responseBody, result.success ? 200 : 400);
  }

  if (action === "delete") {
    const collectionId = params.collectionId || params.collection;
    const id = params.id;

    if (!collectionId) throw new AppError("collection or collectionId required", 400);
    if (!id) throw new AppError("id required", 400);

    const result = await initializedAdapter.crud.delete(collectionId, id, {
      tenantId,
      ...withSystemScope("testing"),
      permanent: true,
    });

    return rawResponse(
      {
        success: result.success,
        message: result.success ? "Delete successful" : result.message,
      },
      result.success ? 200 : 400,
    );
  }

  if (action === "clear-collection") {
    const collectionId = params.collectionId || event.url.searchParams.get("collectionId");
    if (!collectionId) throw new AppError("collectionId required", 400);

    const db = cms.db || initializedAdapter;

    try {
      let tableName;
      try {
        const schema = await cms.collections.getSchema(collectionId, tenantId);
        tableName = cms.collections.getCollectionName(schema._id);
      } catch {
        // 🚀 RESILIENCE: Fallback to naming convention if schema is missing from cache (common during hot-reloads)
        tableName = collectionTableName(collectionId);
        if (process.env.BENCHMARK_DEBUG === "true") {
          process.stderr.write(
            `[TestingHandler] clear-collection: Schema missing for ${collectionId}, using fallback: ${tableName}\n`,
          );
        }
      }

      // 🛡️ HARDENING: Standardize tenantId for the delete operation
      const effectiveTenantId = tenantId || "default";

      await db.crud.deleteMany(
        tableName,
        {},
        {
          tenantId: effectiveTenantId as DatabaseId,
          permanent: true,
          confirmWipe: true,
        },
      );

      // 🚀 CACHE INVALIDATION: Force SDK to drop any cached schemas or entries for this collection
      await cms.collections.refresh(effectiveTenantId as DatabaseId, true);

      return rawResponse({
        success: true,
        message: `Collection ${collectionId} cleared from ${tableName}.`,
      });
    } catch (err: unknown) {
      logger.error(
        `[TestingHandler] clear-collection error for ${collectionId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return rawResponse(
        {
          success: false,
          message: err instanceof Error ? err.message : String(err),
        },
        200,
      );
    }
  }

  if (action === "bulk-seed") {
    const { collectionId, data } = params;
    if (!collectionId || !Array.isArray(data)) throw new AppError("Invalid data", 400);

    const { LocalCMS } = await import("@src/services/sdk");
    const localCms = new LocalCMS(initializedAdapter);

    const result = await localCms.collections.bulkCreate(collectionId, data, {
      tenantId,
      skipValidation: true,
      system: true,
    });
    return rawResponse(result);
  }

  if (action === "seed-website-starter") {
    const { seedWebsiteStarterBlueprint } =
      await import("@src/services/site/website-starter-seed.server");
    try {
      const result = await seedWebsiteStarterBlueprint(initializedAdapter, {
        siteName: (params.siteName as string) || "E2E Test Site",
        tenantId,
        enablePlugin: params.enablePlugin !== false,
        adminUserId: params.userId as string | undefined,
      });
      try {
        const { cacheService } = await loadCacheServiceModule();
        await cacheService.invalidateCollection(
          "pages",
          (tenantId ?? undefined) as string | undefined,
        );
        await cacheService.invalidateCollection(
          "collection_pages",
          (tenantId ?? undefined) as string | undefined,
        );
      } catch {}
      return rawResponse({ success: true, ...result });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new AppError(`Website Starter seed failed: ${message}`, 500);
    }
  }

  if (action === "seed-unified-data-hub") {
    const { seedUnifiedDataHub } = await import("@plugins/unified-data-hub/server/hub-test-seed");
    try {
      // The UDH runtime normalizes null/undefined tenants to "default" everywhere
      // (query-planner, virtual-query-engine, sdk namespace). String(null) === "null"
      // used to poison connector/schema tenantId rows so lookups could never find
      // them; the seed must use the SAME normalization or nothing is readable.
      const hubTenantId =
        tenantId == null || tenantId === ("" as any) || String(tenantId) === "null"
          ? "default"
          : String(tenantId);
      const result = await seedUnifiedDataHub(initializedAdapter, hubTenantId, {
        fixture: params.fixture || "postgres",
        rowCount: params.rowCount ?? 100,
        connectorId: params.connectorId,
        collectionId: params.collectionId,
        userId: params.userId,
      });
      return rawResponse({ success: true, tenantId: hubTenantId, ...result });
    } catch (err: any) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("POSTGRES_FIXTURE_UNAVAILABLE")) {
        return rawResponse({ success: false, code: "POSTGRES_FIXTURE_UNAVAILABLE", message }, 503);
      }
      throw new AppError(message, 500);
    }
  }

  if (action === "benchmark-seed") {
    const AUTHOR_COUNT = params.authorCount || 10;
    const POSTS_PER_AUTHOR = params.postsPerAuthor || 5;

    // Phase 1: Create benchmark collections in parallel
    const collectionSchemas = [
      {
        _id: "benchmark_authors",
        name: "benchmark_authors",
        fields: [
          {
            db_fieldName: "_id",
            label: "ID",
            widget: { Name: "Input" },
            type: "string",
          },
          {
            db_fieldName: "name",
            label: "Name",
            widget: { Name: "Input" },
            type: "string",
          },
        ],
      },
      {
        _id: "benchmark_posts",
        name: "benchmark_posts",
        fields: [
          {
            db_fieldName: "_id",
            label: "ID",
            widget: { Name: "Input" },
            type: "string",
          },
          {
            db_fieldName: "title",
            label: "Title",
            widget: { Name: "Input" },
            type: "string",
          },
          {
            db_fieldName: "author",
            label: "Author",
            widget: { Name: "Relation" },
            type: "string",
            relation: "benchmark_authors",
          },
        ],
      },
      {
        _id: "BenchmarkStable",
        name: "BenchmarkStable",
        fields: [
          {
            db_fieldName: "_id",
            label: "ID",
            widget: { Name: "Input" },
            type: "string",
          },
          {
            db_fieldName: "title",
            label: "Title",
            widget: { Name: "Input" },
            type: "string",
          },
          {
            db_fieldName: "content",
            label: "Content",
            widget: { Name: "RichText" },
            type: "string",
          },
          {
            db_fieldName: "count",
            label: "Count",
            widget: { Name: "Input" },
            type: "number",
          },
        ],
      },
      {
        _id: "redirects",
        name: "redirects",
        fields: [
          {
            db_fieldName: "_id",
            label: "ID",
            widget: { Name: "Input" },
            type: "string",
          },
          {
            db_fieldName: "source",
            label: "Source",
            widget: { Name: "Input" },
            type: "string",
          },
          {
            db_fieldName: "target",
            label: "Target",
            widget: { Name: "Input" },
            type: "string",
          },
          {
            db_fieldName: "type",
            label: "Type",
            widget: { Name: "Input" },
            type: "number",
          },
        ],
      },
    ];

    await Promise.all(
      collectionSchemas.map(async (schema) => {
        try {
          await initializedAdapter.collection.createModel(schema);
        } catch {
          /* already exists */
        }
      }),
    );

    // Phase 2: Seed data using LocalCMS for zero-latency writes
    const { LocalCMS } = await import("@src/services/sdk");
    const localCms = new LocalCMS(initializedAdapter);

    for (const schema of collectionSchemas) {
      await localCms.collections.registerSchema(schema._id, schema as any, tenantId);
    }

    // Seed authors — deterministic UUIDv4 ids (version 4 / variant 8),
    // format-compliant with the enterprise _id contract on collection tables.
    const authors = Array.from({ length: AUTHOR_COUNT }, (_, i) => ({
      _id: `10000000-0000-7000-8000-${(i + 1).toString(16).padStart(12, "0")}`,
      name: `Author ${i + 1}`,
      tenantId,
    }));
    await localCms.collections.bulkCreate("benchmark_authors", authors, {
      tenantId,
      skipValidation: true,
      system: true,
    });

    // Seed posts
    const posts = authors.flatMap((author, ai) =>
      Array.from({ length: POSTS_PER_AUTHOR }, (_, pi) => ({
        title: `Post ${pi + 1} by Author ${ai + 1}`,
        author: author._id,
        tenantId,
      })),
    );
    await localCms.collections.bulkCreate("benchmark_posts", posts, {
      tenantId,
      skipValidation: true,
      system: true,
    });

    // Seed stable entry and redirects in parallel (upsert stable entry for re-runs)
    const STABLE_ENTRY_ID = "20000000-0000-7000-8000-000000000001";
    const stablePayload = {
      _id: STABLE_ENTRY_ID,
      title: "Stable Benchmark Entry",
      content: "This is a stable entry for REST and API performance testing.",
      count: 1,
      tenantId,
    };
    await Promise.all([
      initializedAdapter.crud
        .upsert(
          "BenchmarkStable" as any,
          { _id: STABLE_ENTRY_ID } as any,
          stablePayload as any,
          { tenantId, ...withSystemScope("testing") } as any,
        )
        .then(async (res) => {
          if (!res.success) {
            await localCms.collections.create("BenchmarkStable", stablePayload, {
              tenantId,
              skipValidation: true,
              system: true,
            });
          }
        }),
      localCms.collections.bulkCreate(
        "redirects",
        [
          {
            _id: "30000000-0000-7000-8000-000000000001",
            source: "/old-path-1",
            target: "/new-path-1",
            type: 301,
            tenantId,
          },
          {
            _id: "30000000-0000-7000-8000-000000000002",
            source: "/old-path-2",
            target: "/new-path-2",
            type: 301,
            tenantId,
          },
        ],
        { tenantId, skipValidation: true, system: true },
      ),
    ]);

    // Sync content store + SDK schema cache so PATCH/GET see API-seeded entries immediately
    const { refreshContent } = await loadEngineServerModule();
    await refreshContent(tenantId, {
      mode: "schemas",
      adapter: initializedAdapter,
    });
    if (cms.collections?.refresh) {
      await cms.collections.refresh(tenantId as any, true);
    }

    return rawResponse({
      success: true,
      message: `Seeded ${authors.length} authors + ${posts.length} posts + stable entry + 2 redirects`,
      counts: {
        authors: authors.length,
        posts: posts.length,
        stable: 1,
        redirects: 2,
      },
    });
  }

  return undefined;
}
