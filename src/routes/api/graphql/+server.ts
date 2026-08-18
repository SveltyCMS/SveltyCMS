/**
 * @file src/routes/api/graphql/+server.ts
 * @description GraphQL API endpoint using GraphQL Yoga + Unified Dispatcher.
 *
 * # Features
 * - Uses GraphQL Yoga for GraphQL API endpoint.
 * - Uses Unified Dispatcher for GraphQL API endpoint.
 * - Uses PubSub for GraphQL API endpoint.
 * - Uses Loaders for GraphQL API endpoint.
 *
 * # Security
 * - Enforces query depth (max 8).
 * - Enforces alias count (max 15).
 * - Blocks schema introspection in production (unconditional in production builds).
 * - Enforces query execution cost limits at parse time.
 */

import type { RequestEvent } from "@sveltejs/kit";

import { createYoga, createSchema } from "graphql-yoga";
import { GraphQLError, NoSchemaIntrospectionCustomRule, parse, type DocumentNode } from "graphql";
import { useGraphQlJit } from "@envelop/graphql-jit";
import {
  responseCache,
  buildGraphQLResponseCacheKey,
  generateContentEtag,
} from "@src/services/cache/response-cache";
import { PROFILE_WRITE_ENABLED, profileSpan, profileMark } from "@utils/write-profiler";
import { metricsService } from "@src/services/observability/metrics-service";
import { pubSub } from "@src/services/background/pub-sub";
import { createDepthLimitRule, createMaxAliasesRule } from "./rules";
import { registerCollections, collectionsResolvers } from "./resolvers/collections";
import { analyzeQueryCost, formatCostError, normalizeQueryString } from "./cost-analyzer";

// GraphQL validation plugin: enforces query depth (max 8), alias count (max 15),
// and blocks schema introspection in production environments
const MAX_QUERY_DEPTH = 8;
const MAX_ALIASES = 15;

// Live getter (not a module-load snapshot) so tests can toggle NODE_ENV.
const isProduction = () => process.env.NODE_ENV === "production";

const depthLimitRule = createDepthLimitRule(MAX_QUERY_DEPTH);
const maxAliasesRule = createMaxAliasesRule(MAX_ALIASES);

// ─── Query AST & Document Validation Cache ──────────────────────────────────
const MAX_AST_CACHE = 1000;
const astCache = new Map<string, DocumentNode>();
const validatedDocuments = new WeakMap<DocumentNode, number>();

function getOrParseDocument(rawQuery: string): DocumentNode {
  const key = normalizeQueryString(rawQuery);
  let cached = astCache.get(key);
  if (cached) return cached;

  cached = parse(rawQuery);
  if (astCache.size >= MAX_AST_CACHE) {
    const oldestKey = astCache.keys().next().value;
    if (oldestKey !== undefined) astCache.delete(oldestKey);
  }
  astCache.set(key, cached);
  return cached;
}

const securityValidationPlugin = {
  onParse({
    params,
    setParsedDocument,
  }: {
    params?: { source?: string; query?: string };
    setParsedDocument?: (doc: any) => void;
  }) {
    const endParse = profileMark("gql:parse");
    // Cost-budget queries at parse time — no request.clone() needed.
    // Throw GraphQLError (not AppError) so Yoga surfaces the real reason in
    // the standard error envelope instead of masking it as a 500.
    const query = params?.source || params?.query;
    if (typeof query === "string") {
      const analysis = analyzeQueryCost(query);
      if (!analysis.allowed) {
        throw new GraphQLError(formatCostError(analysis.cost, 1000), {
          extensions: { code: "QUERY_TOO_EXPENSIVE" },
        });
      }
      try {
        const doc = getOrParseDocument(query);
        if (typeof setParsedDocument === "function") {
          setParsedDocument(doc);
        }
      } catch {
        // Fall back to default Yoga parser on parse error
      }
    }
    endParse();
  },
  onValidate({
    params,
    addValidationRule,
    setResult,
  }: {
    params?: { documentAST?: DocumentNode };
    addValidationRule: (rule: any) => void;
    setResult?: (res: any) => void;
  }) {
    const endValidate = profileMark("gql:validate");
    const doc = params?.documentAST;
    if (
      doc &&
      validatedDocuments.get(doc) === schemaRefreshEpoch &&
      typeof setResult === "function"
    ) {
      setResult([]);
      endValidate();
      return;
    }

    addValidationRule(depthLimitRule);
    addValidationRule(maxAliasesRule);
    // 🛡️ Explicit introspection block in production (belt-and-suspenders with Yoga's default)
    if (isProduction() || process.env.BLOCK_GRAPHQL_INTROSPECTION === "true") {
      addValidationRule(NoSchemaIntrospectionCustomRule);
    }
    endValidate();

    return ({ result }: { result?: any[] }) => {
      if (doc && (!result || result.length === 0)) {
        validatedDocuments.set(doc, schemaRefreshEpoch);
      }
    };
  },
};

/** PROFILE_WRITE=1 span around Yoga's execution phase (after parse/validate). */
const executeSpanPlugin = {
  onExecute() {
    const endExecute = profileMark("gql:execute");
    return () => {
      endExecute();
    };
  },
};

/**
 * Robustly checks if a GraphQL operation is read-only (Query) without false
 * positives from string literals or field names containing "mutation".
 * An empty query is treated as non-cacheable.
 */
function isReadOnlyQuery(query: string): boolean {
  if (!query) return false;
  const trimmed = query.trim().toLowerCase();

  // Explicit operation types must not be cached
  if (trimmed.startsWith("mutation") || trimmed.startsWith("subscription")) {
    return false;
  }
  // Standard queries start with 'query' or directly with a selection set '{'
  return true;
}
import { mediaResolvers, mediaTypeDefs } from "./resolvers/media";
import { systemResolvers, systemTypeDefs } from "./resolvers/system";
import { userResolvers, userTypeDefs } from "./resolvers/users";
import { seoResolvers, seoTypeDefs } from "./resolvers/seo";
import {
  virtualCollectionsMutationFields,
  virtualCollectionsMutationResolvers,
  virtualCollectionsQueryFields,
  virtualCollectionsResolvers,
  virtualCollectionsTypeDefs,
} from "./resolvers/virtual-collections";
import {
  dataOperationsMutationFields,
  dataOperationsMutationResolvers,
  dataOperationsQueryFields,
  dataOperationsQueryResolvers,
  dataOperationsTypeDefs,
  JSONScalar,
} from "./resolvers/data-operations";
import { createLoaders } from "./loaders";
import { LocalCMS } from "@src/services/sdk";

import { apiHandler } from "@utils/api-handler";
import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger";

import { registerPermission } from "@src/databases/auth/permissions";
import { PermissionAction, PermissionType } from "@src/databases/auth/types";

// ---------------------------------------------------------------------------
// Permission Registration
// ---------------------------------------------------------------------------
const accessManagementPermission = {
  _id: "manage-access",
  name: "Manage Access",
  action: PermissionAction.MANAGE,
  type: PermissionType.SYSTEM,
  resource: "access",
  description: "Manage system access and permissions",
};

registerPermission(accessManagementPermission as any);

// ---------------------------------------------------------------------------
// Schema Construction
// ---------------------------------------------------------------------------
async function createGraphQLSchema(dbAdapter: any, tenantId?: string | null) {
  const registered = await registerCollections(tenantId);
  const { typeDefs: collectionTypeDefs, queryFields } = registered;
  const collectionResolversMap = await collectionsResolvers(dbAdapter, null, tenantId, registered);

  const typeDefs = `
    ${userTypeDefs()}
    ${systemTypeDefs}
    ${mediaTypeDefs()}
    ${seoTypeDefs}
    ${collectionTypeDefs}
    ${virtualCollectionsTypeDefs}
    ${dataOperationsTypeDefs}

    type Query {
      _empty: String
      me: User
      users(pagination: PaginationInput): [User]
      mediaImages(pagination: PaginationInput): [MediaImage]
      mediaDocuments(pagination: PaginationInput): [MediaDocument]
      mediaAudio(pagination: PaginationInput): [MediaAudio]
      mediaVideos(pagination: PaginationInput): [MediaVideo]
      mediaRemote(pagination: PaginationInput): [MediaRemote]
      mediaFolders: [MediaFolder]
      ${queryFields.join("\n      ")}
      ${virtualCollectionsQueryFields}
      ${dataOperationsQueryFields}
    }

    input PaginationInput {
      page: Int
      limit: Int
    }

    type Mutation {
      _empty: String
      ${virtualCollectionsMutationFields}
      ${dataOperationsMutationFields}
    }

    type Subscription {
      contentStructureUpdated: String
      entryUpdated: String
      onPing: PingPayload
    }

    type PingPayload {
      timestamp: Float
    }
  `;

  const resolvers = {
    JSON: JSONScalar,
    Query: {
      ...userResolvers(dbAdapter),
      ...systemResolvers.Query,
      ...collectionResolversMap.Query,
      ...mediaResolvers(dbAdapter),
      ...seoResolvers.Query,
      ...virtualCollectionsResolvers(dbAdapter, tenantId),
      ...dataOperationsQueryResolvers(dbAdapter, tenantId),
    },
    Mutation: {
      ...(systemResolvers as any).Mutation,
      ...(collectionResolversMap as any).Mutation,
      ...virtualCollectionsMutationResolvers(dbAdapter, tenantId),
      ...dataOperationsMutationResolvers(dbAdapter, tenantId),
    },
    Subscription: {
      contentStructureUpdated: {
        subscribe: (_: any, __: any, context: any) => {
          if (!context.user) throw new AppError("Unauthorized", 401);
          return context.pubSub.subscribe("contentStructureUpdated");
        },
        resolve: (payload: any) => payload,
      },
      entryUpdated: {
        subscribe: (_: any, __: any, context: any) => {
          if (!context.user) throw new AppError("Unauthorized", 401);
          return context.pubSub.subscribe("entryUpdated");
        },
        resolve: (payload: any) => payload,
      },
      onPing: {
        subscribe: (_: any, __: any, context: any) => {
          if (!context.user) throw new AppError("Unauthorized", 401);
          return context.pubSub.subscribe("onPing");
        },
        resolve: (payload: any) => ({
          timestamp: payload.timestamp || Date.now(),
        }),
      },
    },
  };

  return { typeDefs, resolvers };
}

type YogaCacheEntry = {
  version: number;
  epoch: number;
  promise: Promise<any>;
};

let schemaRefreshEpoch = 0;
const yogaObjectCache = new WeakMap<object, Map<string, YogaCacheEntry>>();
const yogaPrimitiveCache = new Map<string, Map<string, YogaCacheEntry>>();
const MAX_TENANT_SCHEMA_CACHE = 32;

/**
 * Resolve the stable root adapter + effective tenant for the schema cache.
 * Per-request tenant-bound wrappers (forTenant) are NEW objects on every
 * request — comparing wrapper identity invalidated the schema cache on EVERY
 * request (measured: 13-17ms rebuild per cold GraphQL query).
 *
 * The root is normalized by recursively unwrapping tenant wrappers AND the
 * self-healing root proxy (both expose unscoped()) to the raw adapter
 * instance, so turbo-auth GETs (which skip the auth hook and fall back to
 * getDb()) and full-auth POSTs share ONE cache entry. The schema only
 * depends on the underlying adapter + tenant + content version.
 */
function resolveSchemaCacheKey(dbAdapter: any, tenantId?: string | null) {
  let root: any = dbAdapter;
  for (let i = 0; i < 4 && root && typeof root.unscoped === "function"; i++) {
    root = root.unscoped();
  }
  const boundTenant = dbAdapter?.boundTenantId;
  // "global" is the canonical CACHE marker for "no tenant" — but the schema
  // itself must be built with null so resolvers fall back to the same default
  // tenant ("default") a real no-tenant request would use (plugin state,
  // tenant-scoped settings). Building it with "global" changes resolver
  // semantics (e.g. isHubEnabled("global") misses the null-tenant state).
  const tenant = boundTenant ?? (tenantId && tenantId !== "global" ? tenantId : null);
  const tenantKey = String(tenant ?? "global");
  return { root, tenant, tenantKey };
}

function getRootSchemaCache(root: any): Map<string, YogaCacheEntry> {
  if ((typeof root === "object" && root !== null) || typeof root === "function") {
    let cache = yogaObjectCache.get(root);
    if (!cache) {
      cache = new Map<string, YogaCacheEntry>();
      yogaObjectCache.set(root, cache);
    }
    return cache;
  }

  const key = String(root ?? "null");
  let cache = yogaPrimitiveCache.get(key);
  if (!cache) {
    cache = new Map<string, YogaCacheEntry>();
    yogaPrimitiveCache.set(key, cache);
  }
  return cache;
}

function setTenantSchemaCache(
  cache: Map<string, YogaCacheEntry>,
  tenant: string,
  entry: YogaCacheEntry,
): void {
  if (!cache.has(tenant) && cache.size >= MAX_TENANT_SCHEMA_CACHE) {
    const oldestTenant = cache.keys().next().value;
    if (oldestTenant !== undefined) cache.delete(oldestTenant);
  }
  cache.set(tenant, entry);
}

export async function _getYogaApp(dbAdapter: any, tenantId?: string | null) {
  const { contentSystem } = await import("@src/content/index.server");
  const currentVersion = contentSystem.version;
  const {
    root: rootAdapter,
    tenant: schemaTenant,
    tenantKey,
  } = resolveSchemaCacheKey(dbAdapter, tenantId);
  const schemaCache = getRootSchemaCache(rootAdapter);
  const cached = schemaCache.get(tenantKey);
  if (cached && cached.version === currentVersion && cached.epoch === schemaRefreshEpoch) {
    // 🎯 SCHEMA-REBUILD COUNTER: schemaMisses ≈ requests means the cache is
    // being invalidated per request (identity-flip class) — visible in /health.
    metricsService.recordGraphqlSchemaHit(tenantKey);
    return cached.promise;
  }

  const t0 = performance.now();
  let promise: Promise<any>;
  promise = (async () => {
    const { typeDefs, resolvers } = await createGraphQLSchema(dbAdapter, schemaTenant);
    const schema = createSchema({ typeDefs, resolvers });

    const plugins: any[] = [securityValidationPlugin, useGraphQlJit(), executeSpanPlugin];

    const app = createYoga({
      schema: schema as any,
      graphqlEndpoint: "/api/graphql",
      landingPage: true,
      cors: false,
      batching: { limit: 10 },
      plugins,
      context: async (serverContext: any) => {
        let _loaders: any = undefined;
        return {
          user: serverContext.user,
          tenantId: serverContext.tenantId,
          dbAdapter: serverContext.dbAdapter,
          cms: serverContext.cms,
          pubSub,
          get loaders() {
            if (_loaders === undefined) {
              _loaders = serverContext.loaders;
            }
            return _loaders;
          },
          set loaders(value) {
            _loaders = value;
          },
          publicationFilter: serverContext.publicationFilter || "all",
        };
      },
    });

    return app;
  })();

  // Self-healing: purge a failed build from the cache so the next request
  // retries instead of reusing the rejected promise. The derived promise
  // resolves (swallow) — the original promise still rejects for callers.
  promise.then(undefined, () => {
    if (schemaCache.get(tenantKey)?.promise === promise) {
      schemaCache.delete(tenantKey);
    }
  });

  // 🎯 SCHEMA-REBUILD COUNTER: record the miss + rebuild duration (hit or miss).
  promise.then(
    () => metricsService.recordGraphqlSchemaMiss(performance.now() - t0, tenantKey),
    () => metricsService.recordGraphqlSchemaMiss(performance.now() - t0, tenantKey),
  );

  setTenantSchemaCache(schemaCache, tenantKey, {
    version: currentVersion,
    epoch: schemaRefreshEpoch,
    promise,
  });
  return promise;
}

export async function _refreshSchema(dbAdapter: any, tenantId?: string | null) {
  schemaRefreshEpoch++;
  return await _getYogaApp(dbAdapter, tenantId);
}

let sharedCMS: LocalCMS | null = null;

async function handleRequest(event: RequestEvent) {
  const { locals, request } = event;

  if (!locals.user) {
    throw new AppError("Unauthorized: Login required for GraphQL", 401);
  }

  const url = event.url;
  const publicationFilterParam = url.searchParams.get("publicationFilter");
  const publicationFilterHeader = request.headers.get("x-publication-filter");
  const publicationFilter = (publicationFilterParam || publicationFilterHeader || "all") as
    | "published"
    | "draft"
    | "all";

  let query = "";
  let variables: any = {};
  let bodyText = "";

  if (request.method === "POST") {
    const bodyFromSecurity = (locals as any).__graphqlBodyText;
    bodyText =
      typeof bodyFromSecurity === "string"
        ? bodyFromSecurity
        : await request.text().catch(() => "");

    const parsedFromSecurity = (locals as any).__graphqlParsedBody;
    if (parsedFromSecurity && typeof parsedFromSecurity === "object") {
      query = parsedFromSecurity?.query || "";
      variables = parsedFromSecurity?.variables || {};
    } else {
      try {
        const body = JSON.parse(bodyText);
        query = body?.query || "";
        variables = body?.variables || {};
      } catch {}
    }
  } else if (request.method === "GET") {
    query = url.searchParams.get("query") || "";
    const varsParam = url.searchParams.get("variables");
    if (varsParam) {
      try {
        variables = JSON.parse(varsParam);
      } catch {}
    }
  }

  const isQuery = isReadOnlyQuery(query);

  const userId = locals.user?._id || locals.user?.id || null;
  const cacheKey =
    isQuery && query
      ? buildGraphQLResponseCacheKey(query, variables, publicationFilter, userId)
      : null;

  // 🚀 FAST-PATH: Return cached response immediately before content/DB/Yoga setup
  if (cacheKey) {
    const cached = responseCache.get(cacheKey, locals.tenantId as string);
    if (cached) {
      const payload = cached.buffer || cached.body;
      metricsService.recordGraphqlResponseHit(locals.tenantId as string);
      return new Response(payload as any, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ETag: cached.etag,
          "X-Cache": "HIT",
          "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=86400",
        },
      });
    }
  }

  // ── CACHE MISS PATH: Load content system, DB adapter & Yoga app ──
  const { contentStore } = await import("@src/stores/content-registry.svelte");
  if (contentStore.isReloading) {
    if (PROFILE_WRITE_ENABLED) {
      const reloadEnd = profileMark("gql:waitForReload");
      await contentStore.waitForReload();
      reloadEnd();
    } else {
      await contentStore.waitForReload();
    }
  }

  let adapter = locals.dbAdapter;
  if (!adapter || (typeof adapter.isConnected === "function" && !adapter.isConnected())) {
    const { isDbConnected, getDbInitPromise, getDb } = await import("@src/databases/db");
    if (!isDbConnected()) {
      await getDbInitPromise();
    }
    adapter = getDb();
  }

  if (!adapter) {
    throw new AppError("Database unavailable: Adapter not initialized", 503);
  }

  if (!sharedCMS || sharedCMS.db !== adapter) {
    sharedCMS = new LocalCMS(adapter);
  }
  const cms = sharedCMS;
  let _loaders: any = null;

  try {
    const yogaRequest =
      request.method === "POST"
        ? new Request(request.url, { method: "POST", headers: request.headers, body: bodyText })
        : request;

    const yogaApp = PROFILE_WRITE_ENABLED
      ? await profileSpan("gql:getYogaApp", () => _getYogaApp(adapter, locals.tenantId))
      : await _getYogaApp(adapter, locals.tenantId);

    const buildYogaContext = () => ({
      user: locals.user,
      tenantId: locals.tenantId,
      dbAdapter: adapter,
      cms,
      get loaders() {
        if (!_loaders) {
          _loaders = createLoaders(adapter, (locals.tenantId as any) || null, publicationFilter);
        }
        return _loaders;
      },
      set loaders(value) {
        _loaders = value;
      },
      publicationFilter,
    });
    const handleYogaRequest = () => yogaApp.handleRequest(yogaRequest, buildYogaContext());
    const yogaResponse = PROFILE_WRITE_ENABLED
      ? await profileSpan("gql:yoga.handleRequest", handleYogaRequest)
      : await handleYogaRequest();

    const responseBody = PROFILE_WRITE_ENABLED
      ? await profileSpan("gql:response.text", () => yogaResponse.text())
      : await yogaResponse.text();

    // 🛡️ Do not cache error-shaped responses or empty collection arrays
    if (cacheKey && yogaResponse.status === 200) {
      const hasErrors = responseBody.includes('"errors":[');
      const isEmptyCollectionData = responseBody.includes(":[]");

      if (!hasErrors && !isEmptyCollectionData) {
        const etag = PROFILE_WRITE_ENABLED
          ? await profileSpan("gql:etag", () => generateContentEtag(responseBody))
          : generateContentEtag(responseBody);
        responseCache.set(
          cacheKey,
          { body: responseBody, etag },
          60_000,
          locals.tenantId as string,
        );
      }
    }

    if (cacheKey) {
      // 🎯 RESPONSE-CACHE COUNTER + explicit MISS header: cacheKey drift
      // (publicationFilter/userId/query-normalization changes) silently zeroes
      // the hit rate — responseMisses climbing with hits at 0 is the signal.
      metricsService.recordGraphqlResponseMiss(locals.tenantId as string);
    }

    const headers = new Headers(yogaResponse.headers);
    if (cacheKey) headers.set("X-Cache", "MISS");
    return new Response(responseBody, {
      status: yogaResponse.status,
      statusText: yogaResponse.statusText,
      headers,
    });
  } catch (err: any) {
    logger.error("GraphQL Request Error:", err);
    return new Response(
      JSON.stringify({
        errors: [{ message: err.message || "Internal Server Error" }],
      }),
      {
        status: err.status || 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

export const GET = apiHandler(handleRequest);
export const POST = apiHandler(handleRequest);
