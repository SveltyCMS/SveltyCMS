/**
 * @file src/routes/api/graphql/+server.ts
 * @description GraphQL API endpoint using GraphQL Yoga + Unified Dispatcher.
 *
 * # Features
 * - Uses GraphQL Yoga for GraphQL API endpoint.
 * - Uses Unified Dispatcher for GraphQL API endpoint.
 * - Uses PubSub for GraphQL API endpoint.
 * - Uses Loaders for GraphQL API endpoint.
 * - Yoga-bypass fast path for contentSystemHealth / allCollections (in-memory)
 *
 * # Security
 * - Enforces query depth (max 8).
 * - Enforces alias count (max 15).
 * - Blocks schema introspection in production (unconditional in production builds).
 * - Enforces query execution cost limits at parse time.
 */

import type { RequestEvent } from "@sveltejs/kit";

import { createYoga, createSchema } from "graphql-yoga";
import { GraphQLError, NoSchemaIntrospectionCustomRule, type DocumentNode } from "graphql";
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
import {
  registerCollections,
  collectionsResolvers,
  resolveAllCollections,
  createCleanTypeName,
} from "./resolvers/collections";
import { isDbConnected, getDbInitPromise, getDb } from "@src/databases/db";
import { contentSystem, contentStore } from "@src/content/index.server";
import {
  analyzeQueryCost,
  formatCostError,
  getOrParseDocument,
  matchCollectionQuery,
} from "./cost-analyzer";
import {
  resolvePublicationFilter,
  type PublicationFilter,
} from "@utils/security/publication-policy";
import { LocalCMS } from "@src/services/sdk";
import type { DatabaseId, Schema } from "@src/content/types";

// GraphQL validation plugin: enforces query depth (max 8), alias count (max 15),
// and blocks schema introspection in production environments
const MAX_QUERY_DEPTH = 8;
const MAX_ALIASES = 15;

// Live getter (not a module-load snapshot) so tests can toggle NODE_ENV.
const isProduction = () => process.env.NODE_ENV === "production";

const depthLimitRule = createDepthLimitRule(MAX_QUERY_DEPTH);
const maxAliasesRule = createMaxAliasesRule(MAX_ALIASES);

const validatedDocuments = new WeakMap<DocumentNode, number>();

function projectGraphqlFields(
  row: Record<string, unknown>,
  selections: string[],
): Record<string, unknown> {
  if (selections.length === 0) return row;
  const out: Record<string, unknown> = {};
  for (const field of selections) {
    if (field in row) out[field] = row[field];
  }
  return out;
}

/**
 * Skip Yoga/JIT for the two hottest in-memory queries (health + collection
 * catalog). Auth already ran; cost/depth are trivial for a single root field.
 */
const FAST_JSON_TTL_MS = 2000;
const fastJsonCache = new Map<string, { body: string; ts: number }>();

async function tryGraphqlFastPath(
  query: string,
  ctx: {
    user: unknown;
    tenantId?: string | null;
    dbAdapter?: any;
    publicationFilter?: PublicationFilter;
  },
  variables?: Record<string, any>,
): Promise<string | null> {
  if (!ctx.user || !query) return null;
  const matched = matchCollectionQuery(query, variables);
  if (!matched) return null;

  // 1. In-memory system queries (contentSystemHealth / allCollections)
  if (matched.field === "contentSystemHealth" || matched.field === "allCollections") {
    const jsonKey = `${matched.field}|${String(ctx.tenantId ?? "global")}|${matched.selections.join(",")}`;
    const cachedJson = fastJsonCache.get(jsonKey);
    if (cachedJson && Date.now() - cachedJson.ts < FAST_JSON_TTL_MS) {
      return cachedJson.body;
    }

    let payload: Record<string, unknown>;
    if (matched.field === "contentSystemHealth") {
      const health = contentSystem.getHealthStatus() as unknown as Record<string, unknown>;
      payload = { data: { contentSystemHealth: projectGraphqlFields(health, matched.selections) } };
    } else {
      const rows = await resolveAllCollections(ctx.tenantId);
      const data =
        matched.selections.length === 0
          ? rows
          : rows.map((row) =>
              projectGraphqlFields(row as unknown as Record<string, unknown>, matched.selections),
            );
      payload = { data: { allCollections: data } };
    }
    const body = JSON.stringify(payload);
    if (fastJsonCache.size >= 64) {
      const oldest = fastJsonCache.keys().next().value;
      if (oldest) fastJsonCache.delete(oldest);
    }
    fastJsonCache.set(jsonKey, { body, ts: Date.now() });
    return body;
  }

  // 2. Collection root query fast-path (e.g. BenchmarkStable, Articles)
  const collections = contentStore.getCollections(ctx.tenantId as any);
  let targetCollection: Schema | undefined;
  for (const c of collections) {
    if (!c._id) continue;
    const cleanName = createCleanTypeName({ _id: c._id, name: c.name });
    if (cleanName === matched.field || c._id === matched.field || c.name === matched.field) {
      targetCollection = c;
      break;
    }
  }

  if (!targetCollection || !targetCollection._id) {
    return null;
  }

  let adapter = ctx.dbAdapter;
  if (!adapter || (typeof adapter.isConnected === "function" && !adapter.isConnected())) {
    if (!isDbConnected()) await getDbInitPromise();
    adapter = getDb();
  }
  if (!adapter) return null;

  if (!sharedCMS || sharedCMS.db !== adapter) {
    sharedCMS = new LocalCMS(adapter);
  }

  const fields = matched.selections.length > 0 ? matched.selections : undefined;
  const result = await sharedCMS.collections.find(targetCollection._id, {
    tenantId: ctx.tenantId as DatabaseId,
    limit: matched.limit,
    offset: (matched.page - 1) * matched.limit,
    sort: matched.sort ? { [matched.sort]: matched.sortDirection === "desc" ? -1 : 1 } : undefined,
    filter: matched.filter,
    publicationFilter: ctx.publicationFilter || "all",
    user: ctx.user,
    fields,
  });

  const rows = (
    result && result.success && Array.isArray(result.data) ? result.data : []
  ) as Record<string, unknown>[];
  const projected =
    fields && fields.length > 0
      ? rows.map((r: Record<string, unknown>) => projectGraphqlFields(r, fields))
      : rows;

  return JSON.stringify({ data: { [matched.field]: projected } });
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
        const doc = analysis.document ?? getOrParseDocument(query);
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

import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger";
import { withMutableHeaders } from "@utils/hook-utils";

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
  if (root && typeof root.unscoped === "function") {
    root = root.unscoped();
    if (root && typeof root.unscoped === "function") {
      root = root.unscoped();
    }
  }
  const boundTenant = dbAdapter?.boundTenantId;
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
import { cacheService } from "@src/databases/cache/cache-service";

async function handleRequest(event: RequestEvent) {
  const request = event.request;
  const locals = event.locals;
  const url = event.url;

  if (!locals.user) {
    throw new AppError("Unauthorized: Login required for GraphQL", 401);
  }

  const publicationFilterParam = url.searchParams.get("publicationFilter");
  const publicationFilterHeader = request.headers.get("x-publication-filter");
  const publicationFilter = resolvePublicationFilter(
    { user: locals.user, system: (locals as any).isSystem },
    publicationFilterParam || publicationFilterHeader,
  );

  let query = "";
  let variables: any = {};
  let bodyText = "";
  let apqHash: string | null = null;
  let parsedBody: Record<string, any> | null = null;

  if (request.method === "POST") {
    const bodyFromSecurity = (locals as any).__graphqlBodyText;
    bodyText =
      typeof bodyFromSecurity === "string"
        ? bodyFromSecurity
        : await request.text().catch(() => "");

    const parsedFromSecurity = (locals as any).__graphqlParsedBody;
    if (parsedFromSecurity && typeof parsedFromSecurity === "object") {
      parsedBody = parsedFromSecurity;
      query = parsedFromSecurity?.query || "";
      variables = parsedFromSecurity?.variables || {};
    } else {
      try {
        parsedBody = JSON.parse(bodyText);
        query = parsedBody?.query || "";
        variables = parsedBody?.variables || {};
      } catch {}
    }

    if (parsedBody?.extensions?.persistedQuery?.sha256Hash) {
      apqHash = String(parsedBody.extensions.persistedQuery.sha256Hash);
    } else if (parsedBody?.extensions?.persistedQuery?.hash) {
      apqHash = String(parsedBody.extensions.persistedQuery.hash);
    } else if (parsedBody?.hash) {
      apqHash = String(parsedBody.hash);
    }
  } else if (request.method === "GET") {
    query = url.searchParams.get("query") || "";
    const varsParam = url.searchParams.get("variables");
    if (varsParam) {
      try {
        variables = JSON.parse(varsParam);
      } catch {}
    }

    const extensionsParam = url.searchParams.get("extensions");
    if (extensionsParam) {
      try {
        const ext = JSON.parse(extensionsParam);
        if (ext?.persistedQuery?.sha256Hash) apqHash = String(ext.persistedQuery.sha256Hash);
        else if (ext?.persistedQuery?.hash) apqHash = String(ext.persistedQuery.hash);
      } catch {}
    }
    if (!apqHash) {
      apqHash = url.searchParams.get("hash") || url.searchParams.get("sha256Hash") || null;
    }
  }

  // 🚀 AUTOMATIC PERSISTED QUERIES (APQ): Resolve or register query via APQ hash
  if (apqHash) {
    const tenant = (locals.tenantId as string) || "global";
    if (!query) {
      // Lookup registered query from L1/L2 Redis
      const cachedQuery =
        cacheService.getSync<string>(`apq:${apqHash}`, tenant) ||
        (await cacheService.get<string>(`apq:${apqHash}`, tenant).catch(() => null));

      if (cachedQuery) {
        query = cachedQuery;
      } else {
        // Return standard GraphQL APQ protocol error
        return new Response(
          JSON.stringify({
            errors: [
              {
                message: "PersistedQueryNotFound",
                extensions: { code: "PERSISTED_QUERY_NOT_FOUND" },
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    } else {
      // Register incoming query with its APQ hash across L1/L2 Redis (7 days TTL)
      await cacheService.set(`apq:${apqHash}`, query, 7 * 24 * 3600, tenant, undefined, [
        "graphql",
        "apq",
      ]);
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
      metricsService.recordGraphqlResponseHit(locals.tenantId as string);
      const acceptEncoding = request.headers.get("Accept-Encoding") || "";
      const rawBody = cached.body;
      const payloadSize = cached.buffer
        ? cached.buffer.byteLength
        : Buffer.byteLength(rawBody, "utf-8");

      const responseHeaders = new Headers({
        "Content-Type": "application/json",
        ETag: cached.etag,
        "X-Cache": "HIT",
        "Cache-Control": "private, no-store",
        Vary: "Accept-Encoding, Cookie",
      });

      // 🚀 Zero-CPU Binary Byte Serving: serve pre-compressed chunk if supported
      if (cached.compressed && payloadSize > 1024) {
        if (acceptEncoding.includes("br") && cached.compressed.br) {
          responseHeaders.set("Content-Encoding", "br");
          return new Response(cached.compressed.br as BodyInit, {
            status: 200,
            headers: responseHeaders,
          });
        }
        if (acceptEncoding.includes("gzip") && cached.compressed.gzip) {
          responseHeaders.set("Content-Encoding", "gzip");
          return new Response(cached.compressed.gzip as BodyInit, {
            status: 200,
            headers: responseHeaders,
          });
        }
      }

      const payload = cached.buffer || rawBody;
      return new Response(payload as any, {
        status: 200,
        headers: responseHeaders,
      });
    }
  }

  // ── CACHE MISS PATH: Load content system, DB adapter & Yoga app ──
  if (contentStore.isReloading) {
    if (PROFILE_WRITE_ENABLED) {
      const reloadEnd = profileMark("gql:waitForReload");
      await contentStore.waitForReload();
      reloadEnd();
    } else {
      await contentStore.waitForReload();
    }
  }

  const fast = await tryGraphqlFastPath(
    query,
    {
      user: locals.user,
      tenantId: locals.tenantId,
      dbAdapter: locals.dbAdapter,
      publicationFilter,
    },
    variables,
  );
  if (fast) {
    const tenant = locals.tenantId as string;
    if (cacheKey) {
      // ETag + L1 write off the response path (same as the Yoga miss path).
      queueMicrotask(() => {
        responseCache.set(
          cacheKey,
          { body: fast, etag: generateContentEtag(fast) },
          60_000,
          tenant,
        );
      });
      metricsService.recordGraphqlResponseMiss(tenant);
    }
    return new Response(fast, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-Cache": "MISS",
      },
    });
  }

  let adapter = locals.dbAdapter;
  if (!adapter || (typeof adapter.isConnected === "function" && !adapter.isConnected())) {
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

    // 🚀 SKIP REQUEST CLONING: Pass the original request for GET, create minimal
    // Request only for POST (Yoga needs the body, but we already have bodyText)
    const yogaBody =
      bodyText && bodyText.includes('"query"') ? bodyText : JSON.stringify({ query, variables });

    const yogaRequest =
      request.method === "POST"
        ? new Request(request.url, { method: "POST", headers: request.headers, body: yogaBody })
        : request;

    const handleYogaRequest = () => yogaApp.handleRequest(yogaRequest, buildYogaContext());
    const yogaResponse = PROFILE_WRITE_ENABLED
      ? await profileSpan("gql:yoga.handleRequest", handleYogaRequest)
      : await handleYogaRequest();

    // Serve Yoga's body immediately. Buffer + SHA-256 etag + cache write
    // happen off the response path so query RPS isn't capped by serialization.
    if (cacheKey && yogaResponse.status === 200) {
      const tenant = locals.tenantId as string;
      const cloned = yogaResponse.clone();
      queueMicrotask(() => {
        cloned
          .text()
          .then((responseBody: string) => {
            if (responseBody.includes('"errors":[') || responseBody.includes(":[]")) return;
            responseCache.set(
              cacheKey,
              { body: responseBody, etag: generateContentEtag(responseBody) },
              60_000,
              tenant,
            );
          })
          .catch(() => {});
      });
      metricsService.recordGraphqlResponseMiss(tenant);
    }

    return withMutableHeaders(yogaResponse, (headers) => {
      if (cacheKey) headers.set("X-Cache", "MISS");
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

export const GET = handleRequest;
export const POST = handleRequest;
