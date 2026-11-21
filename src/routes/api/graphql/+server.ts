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
 * - Single-flight cache-miss refill (identical concurrent queries share one find + stringify)
 * - Serve-stale: writes mark GraphQL turbo bodies stale; POST/GET serve them
 *   immediately. No background find() on HIT (that stalled the next request ~60ms).
 * - Synchronous turbo L1 write on the collection fast path (waiters HIT in the same turn)
 *
 * # Security
 * - Enforces query depth (max 8).
 * - Enforces alias count (max 15).
 * - Blocks schema introspection in production (unconditional in production builds).
 * - Enforces query execution cost limits at parse time.
 */

import { createHash, timingSafeEqual } from "node:crypto";

import type { RequestEvent } from "@sveltejs/kit";
import { getDb, getDbInitPromise, isDbConnected } from "@src/databases/db";

import { createYoga, createSchema, renderGraphiQL, type GraphiQLOptions } from "graphql-yoga";
import { GraphQLError, NoSchemaIntrospectionCustomRule, type DocumentNode } from "graphql";
import { useGraphQlJit } from "@envelop/graphql-jit";
import { BoundedJITCache } from "./jit-cache";
import { FastLaneJsonResponse } from "@src/routes/api/[...path]/handlers/base";
import {
  responseCache,
  buildGraphQLResponseCacheKey,
  generateContentEtag,
  setGraphqlCollectionResolver,
  type CachedResponseEntry,
} from "@src/services/cache/response-cache";
import {
  parseCacheControlStalePolicy,
  staleResponseHeader,
  type StaleWindowPolicy,
} from "@src/services/cache/stale-window";
import { PROFILE_WRITE_ENABLED, profileSpan, profileMark } from "@utils/write-profiler";
import { metricsService } from "@src/services/observability/metrics-service";
import { pubSub } from "@src/services/background/pub-sub";
import {
  createDepthLimitRule,
  createMaxAliasesRule,
  createSuppressHintsRule,
  markMutationExecuted,
} from "./rules";
import {
  registerCollections,
  collectionsResolvers,
  resolveAllCollections,
  createCleanTypeName,
} from "./resolvers/collections";
import { contentSystem } from "@src/content/index.server";
import { contentStore } from "@stores/content-registry.svelte";
import { ensureSchemaHotFlags } from "@src/services/sdk/namespaces/collections/schema-store";
import { isAdmin } from "@src/databases/auth/constants";
import { getAllowedFieldSet } from "@src/services/security/field-permission-service";
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
import {
  peekReadySchema,
  schemaCacheEntries,
} from "@src/services/sdk/namespaces/collections/schema-store";

// GraphQL validation plugin: enforces query depth (max 8), alias count (max 15),
// and blocks schema introspection in production environments
const MAX_QUERY_DEPTH = 8;
const MAX_ALIASES = 15;

// Live getters (not module-load snapshots) so tests can toggle env.
const isProduction = () => process.env.NODE_ENV === "production";
const isIntrospectionBlocked = () =>
  isProduction() ||
  process.env.BLOCK_GRAPHQL_INTROSPECTION === "true" ||
  process.env.DEMO_MODE === "true";

const depthLimitRule = createDepthLimitRule(MAX_QUERY_DEPTH);
// Same limit, but the introspection subtree is exempt: GraphiQL's `__schema`
// query nests deeper than 8 and is only reachable where introspection is allowed.
const depthLimitRuleForPlayground = createDepthLimitRule(MAX_QUERY_DEPTH, {
  exemptIntrospection: true,
});

/**
 * Yoga's landing page is a standalone GraphiQL tab; give it a way back into the
 * admin UI (it has no navigation of its own).
 */
const GRAPHIQL_ADMIN_LINK =
  '<a href="/dashboard" style="position:fixed;bottom:12px;inset-inline-start:12px;z-index:9999;' +
  "display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:9999px;" +
  "border:1px solid #6b7280;background:#111827;color:#f9fafb;font:600 12px/1.2 system-ui,sans-serif;" +
  'text-decoration:none" aria-label="Back to SveltyCMS admin">← SveltyCMS Admin</a>';

function renderGraphiQLWithAdminLink(options: GraphiQLOptions): string {
  const html = renderGraphiQL({ ...options, title: options.title ?? "SveltyCMS GraphQL" });
  return html.includes("</body>")
    ? html.replace("</body>", `${GRAPHIQL_ADMIN_LINK}</body>`)
    : `${html}${GRAPHIQL_ADMIN_LINK}`;
}
const maxAliasesRule = createMaxAliasesRule(MAX_ALIASES);
const suppressHintsRule = createSuppressHintsRule();

/**
 * True when the operation selects an introspection field (`__schema` / `__type`).
 *
 * graphql-jit cannot compile those operations: the specification types declare
 * arguments with defaults (`__Type.fields(includeDeprecated: Boolean! = false)`) and the
 * compiler demands every argument in the AST instead of applying the schema default, so
 * `__schema { types { name } }` failed with `Argument "includeDeprecated" of required
 * type "Boolean!" was not provided` (measured 2026-09-22 on the dev playground) and the
 * client received a compiler error instead of the schema. Introspection is never on a
 * hot path, so it runs on the default executor; production still blocks it during
 * validation, before execution is reached.
 */
function selectsIntrospectionFields(document?: DocumentNode | null): boolean {
  if (!document?.definitions?.length) return false;
  for (const definition of document.definitions) {
    const root = definition as { selectionSet?: { selections?: unknown[] } };
    if (!root.selectionSet?.selections) continue;
    const stack: unknown[] = [...root.selectionSet.selections];
    while (stack.length > 0) {
      const node = stack.pop() as {
        name?: { value?: string };
        selectionSet?: { selections?: unknown[] };
      };
      const name = node?.name?.value;
      if (name === "__schema" || name === "__type") return true;
      if (node?.selectionSet?.selections) stack.push(...node.selectionSet.selections);
    }
  }
  return false;
}

const validatedDocuments = new WeakMap<DocumentNode, number>();

function projectGraphqlFields(
  row: Record<string, unknown>,
  selections: string[],
): Record<string, unknown> {
  if (selections.length === 0) return row;
  const out: Record<string, unknown> = {};
  const hasData = row.data && typeof row.data === "object";
  const rowData = hasData ? (row.data as Record<string, unknown>) : null;
  for (const field of selections) {
    if (field in row) {
      out[field] = row[field];
    } else if (rowData && field in rowData) {
      out[field] = rowData[field];
    }
  }
  return out;
}

let graphqlResolverRegistered = false;
const MAX_GRAPHQL_FIELD_MAP_CACHE = 256;
const graphqlFieldToSchemaIdCache = new Map<string, string>();

function resolveGraphqlTargetCollection(
  fieldName: string,
  tenantId?: string | null,
): Schema | undefined {
  let targetCollection: Schema | undefined = peekReadySchema(tenantId as DatabaseId, fieldName);
  if (targetCollection) return targetCollection;

  const mapKey = `${tenantId || "global"}:${fieldName}`;
  const mappedId = graphqlFieldToSchemaIdCache.get(mapKey);
  if (mappedId) {
    targetCollection = peekReadySchema(tenantId as DatabaseId, mappedId);
    if (targetCollection) return targetCollection;
    graphqlFieldToSchemaIdCache.delete(mapKey);
  }

  targetCollection = peekReadySchema(tenantId as DatabaseId, fieldName.toLowerCase());

  if (!targetCollection) {
    const collections = contentStore.getCollections(tenantId);
    for (const c of collections) {
      if (!c._id) continue;
      const cleanName = createCleanTypeName({ _id: c._id, name: c.name });
      if (cleanName === fieldName || c._id === fieldName || c.name === fieldName) {
        targetCollection = c;
        break;
      }
    }
  }

  if (!targetCollection) {
    const prefix = `${tenantId || "global"}:`;
    for (const [key, schema] of schemaCacheEntries()) {
      if (key.startsWith(prefix)) {
        const cleanName = createCleanTypeName({ _id: schema._id, name: schema.name });
        if (cleanName === fieldName || schema._id === fieldName || schema.name === fieldName) {
          targetCollection = schema;
          break;
        }
      }
    }
  }

  if (targetCollection?._id) {
    if (graphqlFieldToSchemaIdCache.size >= MAX_GRAPHQL_FIELD_MAP_CACHE) {
      const oldest = graphqlFieldToSchemaIdCache.keys().next().value;
      if (oldest !== undefined) graphqlFieldToSchemaIdCache.delete(oldest);
    }
    graphqlFieldToSchemaIdCache.set(mapKey, String(targetCollection._id));
  }
  return targetCollection;
}

function ensureGraphqlCollectionResolver(): void {
  if (graphqlResolverRegistered) return;
  graphqlResolverRegistered = true;
  setGraphqlCollectionResolver?.((rootField, tenantId) => {
    const target = resolveGraphqlTargetCollection(rootField, tenantId);
    if (target?._id) return String(target._id);
    const prefix = `${tenantId || "global"}:`;
    if (contentStore.getCollections(tenantId).length > 0) return null;
    for (const [key] of schemaCacheEntries()) {
      if (key.startsWith(prefix)) return null;
    }
    return undefined;
  });
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

  // 1. In-memory system queries (contentSystemHealth / allCollections / allCollectionStats)
  if (
    matched.field === "contentSystemHealth" ||
    matched.field === "allCollections" ||
    matched.field === "allCollectionStats"
  ) {
    const jsonKey = `${matched.field}|${String(ctx.tenantId ?? "global")}|${matched.selections.join(",")}`;
    const cachedJson = fastJsonCache.get(jsonKey);
    if (cachedJson && Date.now() - cachedJson.ts < FAST_JSON_TTL_MS) {
      return cachedJson.body;
    }

    let payload: Record<string, unknown>;
    if (matched.field === "contentSystemHealth") {
      const health = contentSystem.getHealthStatus() as unknown as Record<string, unknown>;
      payload = { data: { contentSystemHealth: projectGraphqlFields(health, matched.selections) } };
    } else if (matched.field === "allCollections") {
      const rows = await resolveAllCollections(ctx.tenantId);
      const data =
        matched.selections.length === 0
          ? rows
          : rows.map((row) =>
              projectGraphqlFields(row as unknown as Record<string, unknown>, matched.selections),
            );
      payload = { data: { allCollections: data } };
    } else {
      const collections = await contentSystem.getCollections(ctx.tenantId);
      const rows = collections.map((col) => {
        const folder = (col as { folder?: string }).folder;
        return {
          _id: col._id,
          name: col.name,
          icon: col.icon || "mdi:folder",
          path: col.path || (folder ? `${folder}/${col.name}` : col.name),
          fieldCount: (col.fields || []).length,
          hasRevisions: col.revision || false,
          hasLivePreview: !!col.livePreview,
          status: col.status || "active",
        };
      });
      const data =
        matched.selections.length === 0
          ? rows
          : rows.map((row) =>
              projectGraphqlFields(row as unknown as Record<string, unknown>, matched.selections),
            );
      payload = { data: { allCollectionStats: data } };
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
  const targetCollection = resolveGraphqlTargetCollection(matched.field, ctx.tenantId);

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

  // 🚀 DIRECT-TO-WIRE GRAPHQL ACCELERATION:
  // Serve simple unfiltered list queries from the engine-side wire stream
  // (pre-aggregated JSON array: no V8 row hydration, per-row projection, or
  // JSON.stringify) — but only where a raw row read cannot bypass a protection
  // the SDK path applies: read hooks (they transform documents), encrypted
  // fields (the SDK decrypts; the wire would hand back ciphertext), and for
  // non-admins row ownership, guarded fields, or a FIELD_PERMISSIONS policy
  // (the same FLAC exemption the read lane uses). Engines that cannot serve the
  // projection decline, and anything unsafe falls through to the SDK path.
  const hot = ensureSchemaHotFlags(targetCollection);
  const role = (ctx.user as { role?: string } | null)?.role;
  const admin = isAdmin(ctx.user) || role === "admin";
  const rawHooks = (targetCollection as { hooks?: Record<string, unknown> }).hooks;
  const wireReadSafe =
    !hot._hasEncryptedFields &&
    !rawHooks?.afterRead &&
    !rawHooks?.afterFind &&
    (admin ||
      (!(targetCollection as { ownership?: unknown }).ownership &&
        !hot._hasGuardedFields &&
        !getAllowedFieldSet(String(targetCollection._id), role)));
  let isFilterEmpty = true;
  if (matched.filter) {
    for (const _ in matched.filter) {
      if (matched.filter) {
        isFilterEmpty = false;
        break;
      }
    }
  }

  if (wireReadSafe && typeof adapter.crud?.findListWireStream === "function" && isFilterEmpty) {
    const wireRes = await adapter.crud.findListWireStream(String(targetCollection._id), {
      tenantId: ctx.tenantId as DatabaseId,
      limit: matched.limit,
      offset: (matched.page - 1) * matched.limit,
      requirePublished: ctx.publicationFilter === "published",
      sortField: matched.sort,
      sortDirection: matched.sortDirection,
      fields,
    });
    if (wireRes?.success && wireRes.data?.wireBody) {
      return `{"data":{"${matched.field}":${wireRes.data.wireBody}}}`;
    }
  }

  const result = await sharedCMS.collections.find(targetCollection._id, {
    tenantId: ctx.tenantId as DatabaseId,
    limit: matched.limit,
    offset: (matched.page - 1) * matched.limit,
    sort: matched.sort ? { [matched.sort]: matched.sortDirection === "desc" ? -1 : 1 } : undefined,
    filter: matched.filter,
    publicationFilter: ctx.publicationFilter || "all",
    user: ctx.user,
    fields,
    skipAdminEnvelope: true,
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
    context,
    setParsedDocument,
  }: {
    params?: { source?: string; query?: string };
    context?: { parsedDocument?: DocumentNode; [key: string]: any };
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
      const preParsed = context?.parsedDocument;
      if (preParsed && typeof setParsedDocument === "function") {
        setParsedDocument(preParsed);
        endParse();
        return;
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

    addValidationRule(maxAliasesRule);
    // 🛡️ Introspection blocked in production, demo, or when explicitly opted in.
    // Development stays open for the in-app playground unless BLOCK_GRAPHQL_INTROSPECTION=true.
    if (isIntrospectionBlocked()) {
      addValidationRule(depthLimitRule);
      addValidationRule(NoSchemaIntrospectionCustomRule);
      addValidationRule(suppressHintsRule);
    } else {
      // Dev playground: depth still applies to real fields, but `__schema` /
      // `__type` no longer trip the flat Field counter.
      addValidationRule(depthLimitRuleForPlayground);
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
  const len = query.length;
  let i = 0;
  while (i < len) {
    const ch = query.charCodeAt(i);
    if (ch <= 32 || ch === 44 /* ',' */ || ch === 0xfeff) {
      i++;
      continue;
    }
    if (ch === 35 /* '#' */) {
      while (i < len && query.charCodeAt(i) !== 10 && query.charCodeAt(i) !== 13) i++;
      continue;
    }
    break;
  }
  if (i >= len) return false;
  const first = query.charCodeAt(i) | 32;
  // Explicit operation types must not be cached
  if (first === 109 /* 'm' */ && query.slice(i, i + 8).toLowerCase() === "mutation") {
    return false;
  }
  if (first === 115 /* 's' */ && query.slice(i, i + 12).toLowerCase() === "subscription") {
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
import { validateCsrfForRequest } from "@utils/security/csrf-utils";
import { isSecureCookieContext } from "@src/databases/auth/constants";
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
      runCollectionAction(collectionId: String!, action: String!, entryId: String!, input: JSON): JSON
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
        // 🛡️ Cross-tenant isolation: drop events whose concrete tenant differs.
        resolve: (payload: any, _args: any, context: any) => {
          const p = payload?.tenantId;
          const c = context?.tenantId;
          if (p && c && p !== "global" && c !== "global" && p !== c) return null;
          return payload;
        },
      },
      entryUpdated: {
        subscribe: (_: any, __: any, context: any) => {
          if (!context.user) throw new AppError("Unauthorized", 401);
          return context.pubSub.subscribe("entryUpdated");
        },
        // 🛡️ Cross-tenant isolation: drop events whose concrete tenant differs.
        resolve: (payload: any, _args: any, context: any) => {
          const p = payload?.tenantId;
          const c = context?.tenantId;
          if (p && c && p !== "global" && c !== "global" && p !== c) return null;
          return payload;
        },
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

    const jitCache = new BoundedJITCache(1000);
    const plugins: any[] = [
      securityValidationPlugin,
      useGraphQlJit(
        {},
        {
          cache: jitCache,
          // Introspection takes the default executor (`selectsIntrospectionFields`).
          enableIf: ({ document }: { document?: DocumentNode }) =>
            !selectsIntrospectionFields(document),
          // The plugin's default compile-failure handler is `console.error`; route it
          // through the app logger so the reason is visible in production logs.
          onError: (compilationError: unknown) =>
            logger.warn(
              `[GraphQL] JIT compilation failed — the default executor returns the error: ${String(
                (compilationError as { message?: string })?.message ?? compilationError,
              )}`,
            ),
        },
      ),
      executeSpanPlugin,
    ];

    const app = createYoga({
      schema: schema as any,
      graphqlEndpoint: "/api/graphql",
      landingPage: true,
      renderGraphiQL: renderGraphiQLWithAdminLink,
      cors: false,
      batching: { limit: 10 },
      // Yoga 6 logs one "Request processed" line per request through its own
      // logger. This lane already has first-class metrics + tracing + the app
      // logger, and it is a benchmarked hot path — keep Yoga silent.
      logging: false,
      plugins,
      context: async (serverContext: any) => {
        let _loaders: any = undefined;
        return {
          user: serverContext.user,
          tenantId: serverContext.tenantId,
          roles: serverContext.roles,
          cacheSlot: serverContext.cacheSlot,
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

/** APQ keys are client-supplied sha256 digests: exactly 64 hex characters. */
const APQ_HASH_PATTERN = /^[0-9a-fA-F]{64}$/;

/** Standard GraphQL application/json error envelope used by the APQ handshake. */
function apqErrorResponse(message: string, code: string): Response {
  return new Response(JSON.stringify({ errors: [{ message, extensions: { code } }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

interface CoalescedGraphqlRead {
  body: string;
  etag: string;
}

const inflightGraphqlReads = new Map<string, Promise<CoalescedGraphqlRead | null>>();
const MAX_INFLIGHT_GRAPHQL_READS = 64;

const STAMP_GQL_DUR = process.env.SVELTY_SRV_DUR === "1";
const STAMP_GQL_SPLIT = process.env.SVELTY_SRV_SPLIT === "1";

function stampGraphqlHeaders(
  headers: Record<string, string> | Headers,
  started: number,
  marks?: ReadonlyMap<string, number>,
): void {
  if (STAMP_GQL_DUR && started > 0) {
    const dur = (performance.now() - started).toFixed(2);
    if (headers instanceof Headers) headers.set("x-srv-dur", dur);
    else headers["x-srv-dur"] = dur;
  }
  if (STAMP_GQL_SPLIT && marks && marks.size > 0) {
    const parts: string[] = [];
    marks.forEach((ms, label) => parts.push(`${label}=${ms.toFixed(2)}`));
    const split = parts.join(";");
    if (headers instanceof Headers) headers.set("x-srv-split", split);
    else headers["x-srv-split"] = split;
  }
}

function finalizeGraphqlResponse(
  body: string | Uint8Array,
  headersRecord: Record<string, string>,
  preapplied: boolean,
  locals?: App.Locals,
  rawText?: string,
  knownByteLength?: number,
): Response {
  const isFastLane = (locals as { __isFastLane?: boolean } | undefined)?.__isFastLane === true;

  if (isFastLane) {
    if (!headersRecord["content-length"]) {
      const byteLen =
        knownByteLength !== undefined
          ? knownByteLength
          : typeof body === "string"
            ? Buffer.byteLength(body, "utf8")
            : body.byteLength;
      headersRecord["content-length"] = String(byteLen);
    }
    return new FastLaneJsonResponse(
      200,
      headersRecord,
      body,
      preapplied,
      rawText,
    ) as unknown as Response;
  }

  const res = new Response(body as BodyInit, {
    status: 200,
    headers: headersRecord,
  });
  (res as unknown as { __fastBody?: string | Uint8Array }).__fastBody = body;
  (res as unknown as { __fastHeaders?: Record<string, string> }).__fastHeaders = headersRecord;
  if (preapplied) {
    (res as unknown as { __securityHeadersApplied?: boolean }).__securityHeadersApplied = true;
  }
  return res;
}

function buildGraphqlResponse(
  body: string | Uint8Array,
  extraHeaders: Record<string, string>,
  locals?: App.Locals,
  rawText?: string,
): Response {
  const preapplied = (locals as { __graphqlSecurityHeaders?: Record<string, string> } | undefined)
    ?.__graphqlSecurityHeaders;
  const headersRecord: Record<string, string> = preapplied
    ? { ...preapplied, ...extraHeaders }
    : { ...extraHeaders };
  return finalizeGraphqlResponse(body, headersRecord, Boolean(preapplied), locals, rawText);
}

function serveGraphqlCached(
  request: Request,
  cached: CachedResponseEntry,
  locals?: App.Locals,
  stalePolicy?: StaleWindowPolicy | null,
): Response {
  const rawBody = cached.body;
  const preapplied = (locals as { __graphqlSecurityHeaders?: Record<string, string> } | undefined)
    ?.__graphqlSecurityHeaders;
  const headers: Record<string, string> = preapplied
    ? {
        ...preapplied,
        "content-type": "application/json",
        etag: cached.etag,
        "x-cache": cached.stale ? "STALE" : "HIT",
        "cache-control": "private, no-store",
        vary: "Accept-Encoding, Cookie",
      }
    : {
        "content-type": "application/json",
        etag: cached.etag,
        "x-cache": cached.stale ? "STALE" : "HIT",
        "cache-control": "private, no-store",
        vary: "Accept-Encoding, Cookie",
      };
  if (cached.stale && stalePolicy) {
    const staleHdr = staleResponseHeader(true, stalePolicy);
    if (staleHdr) headers["x-cache-stale"] = staleHdr;
  }

  if (cached.compressed) {
    const payloadSize = cached.buffer
      ? cached.buffer.byteLength
      : (cached.byteLength ?? Buffer.byteLength(rawBody, "utf-8"));
    if (payloadSize > 1024) {
      const acceptEncoding = request.headers.get("accept-encoding") || "";
      if (acceptEncoding.includes("br") && cached.compressed.br) {
        headers["content-encoding"] = "br";
        return finalizeGraphqlResponse(
          cached.compressed.br,
          headers,
          Boolean(preapplied),
          locals,
          rawBody,
          cached.compressed.br.byteLength,
        );
      }
      if (acceptEncoding.includes("gzip") && cached.compressed.gzip) {
        headers["content-encoding"] = "gzip";
        return finalizeGraphqlResponse(
          cached.compressed.gzip,
          headers,
          Boolean(preapplied),
          locals,
          rawBody,
          cached.compressed.gzip.byteLength,
        );
      }
    }
  }

  const payload = cached.buffer || rawBody;
  const knownLen = cached.buffer ? cached.buffer.byteLength : cached.byteLength;
  return finalizeGraphqlResponse(payload, headers, Boolean(preapplied), locals, rawBody, knownLen);
}

/** Constant-time check that `apqHash` is the SHA-256 digest of `query`. */
function apqHashMatchesQuery(apqHash: string, query: string): boolean {
  const supplied = Buffer.from(apqHash, "hex");
  const expected = createHash("sha256").update(query, "utf8").digest();
  // Shape validation guarantees 32 bytes; the guard keeps timingSafeEqual safe.
  if (supplied.length !== expected.length) return false;
  return timingSafeEqual(supplied, expected);
}

async function handleRequest(event: RequestEvent): Promise<Response> {
  const started = STAMP_GQL_DUR || STAMP_GQL_SPLIT ? performance.now() : 0;
  const splitMarks = STAMP_GQL_SPLIT ? new Map<string, number>() : undefined;
  const request = event.request;
  const locals = event.locals;
  const url = event.url;

  if (!locals.user) {
    throw new AppError("Unauthorized: Login required for GraphQL", 401);
  }

  // 🔒 CSRF parity with the REST dispatcher: a session-authenticated POST must
  // pass the same-origin fast path or present the double-submit token — the
  // attacker model is a browser session cookie riding a cross-origin POST, and
  // Yoga batching (limit 10) means a POST can hide mutations, so the gate
  // covers every POST rather than only parsed mutations. Server-to-server
  // credentials (API key / token) carry no cookie an attacker can ride and
  // are exempt; GET stays exempt as a safe method (queries only).
  if (
    request.method === "POST" &&
    !(locals as { __laneCsrfChecked?: boolean }).__laneCsrfChecked &&
    !(locals.user as { isApiKey?: boolean })?.isApiKey &&
    !(locals.user as { isApiToken?: boolean })?.isApiToken &&
    (globalThis as any).process?.env?.TEST_MODE !== "true"
  ) {
    const isSecure = isSecureCookieContext(url.protocol, url.hostname);
    const csrf = validateCsrfForRequest(event.cookies, request, isSecure);
    if (!csrf.isValid) {
      throw new AppError(`Security violation: ${csrf.error}`, 403, "CSRF_VIOLATION");
    }
  }

  const hasSearch = url.search.length > 0;
  const publicationFilterParam = hasSearch ? url.searchParams.get("publicationFilter") : null;
  const publicationFilterHeader = request.headers.get("x-publication-filter");
  const publicationFilter = resolvePublicationFilter(
    { user: locals.user, system: (locals as any).isSystem },
    publicationFilterParam || publicationFilterHeader,
  );

  let query = "";
  let variables: any = undefined;
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
      variables = parsedFromSecurity?.variables;
    } else {
      try {
        parsedBody = JSON.parse(bodyText);
        query = parsedBody?.query || "";
        variables = parsedBody?.variables;
      } catch (error) {
        logger.debug("[+server] suppressed error", error);
      }
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
      } catch (error) {
        logger.debug("[+server] suppressed error", error);
      }
    }

    const extensionsParam = url.searchParams.get("extensions");
    if (extensionsParam) {
      try {
        const ext = JSON.parse(extensionsParam);
        if (ext?.persistedQuery?.sha256Hash) apqHash = String(ext.persistedQuery.sha256Hash);
        else if (ext?.persistedQuery?.hash) apqHash = String(ext.persistedQuery.hash);
      } catch (error) {
        logger.debug("[+server] suppressed error", error);
      }
    }
    if (!apqHash) {
      apqHash = url.searchParams.get("hash") || url.searchParams.get("sha256Hash") || null;
    }
  }

  // 🚀 AUTOMATIC PERSISTED QUERIES (APQ): Resolve or register query via APQ hash
  if (apqHash) {
    const tenant = (locals.tenantId as string) || "global";

    // 🔒 SECURITY: only 64-char hex sha256 digests are valid APQ keys — reject
    // arbitrary/oversized keys before any cache read or write (flood guard).
    if (!APQ_HASH_PATTERN.test(apqHash)) {
      return apqErrorResponse("PersistedQueryHashInvalid", "PERSISTED_QUERY_HASH_INVALID");
    }

    if (!query) {
      // Lookup registered query from L1/L2 Redis
      const cachedQuery =
        cacheService.getSync<string>(`apq:${apqHash}`, tenant) ||
        (await cacheService.get<string>(`apq:${apqHash}`, tenant).catch(() => null));

      if (cachedQuery) {
        query = cachedQuery;
      } else {
        // Return standard GraphQL APQ protocol error
        return apqErrorResponse("PersistedQueryNotFound", "PERSISTED_QUERY_NOT_FOUND");
      }
    } else {
      // 🔒 SECURITY: the persisted query must hash to the supplied key, otherwise
      // a client could plant a query under a hash another client will request.
      if (!apqHashMatchesQuery(apqHash, query)) {
        return apqErrorResponse("PersistedQueryHashMismatch", "PERSISTED_QUERY_HASH_MISMATCH");
      }

      // Register incoming query with its APQ hash across L1/L2 Redis (7 days TTL)
      await cacheService.set(`apq:${apqHash}`, query, 7 * 24 * 3600, tenant, undefined, [
        "graphql",
        "apq",
      ]);
    }
  }

  const isQuery = isReadOnlyQuery(query);
  (locals as { __graphqlIsRead?: boolean }).__graphqlIsRead = isQuery;

  if (!isQuery && request.method === "POST" && process.env.TEST_MODE !== "true") {
    const idempotencyKey =
      request.headers.get("x-idempotency-key") || request.headers.get("x-mutation-id");
    if (idempotencyKey) {
      const replayPayload = `${idempotencyKey}:${query}`;
      if (!markMutationExecuted(replayPayload, variables ?? {})) {
        return new Response(
          JSON.stringify({
            errors: [{ message: "Mutation replay detected. Duplicate execution blocked." }],
          }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        );
      }
    }
  }

  ensureGraphqlCollectionResolver();
  const userId = locals.user?._id || locals.user?.id || null;
  const cacheTenant = locals.tenantId as string;
  const cacheKey =
    isQuery && query
      ? buildGraphQLResponseCacheKey(
          query,
          variables,
          publicationFilter,
          userId,
          undefined,
          cacheTenant,
        )
      : null;

  // 🚀 FAST-PATH: Return cached response immediately before content/DB/Yoga setup
  const ccHeader = request.headers.get("cache-control");
  const stalePolicy = ccHeader ? parseCacheControlStalePolicy(ccHeader) : null;
  const bypassGraphqlCache =
    hasSearch &&
    (url.searchParams.get("refresh") === "true" ||
      url.searchParams.get("nocache") === "true" ||
      url.searchParams.get("bypassCache") === "true");
  if (cacheKey && !bypassGraphqlCache) {
    const cached = responseCache.get(
      cacheKey,
      cacheTenant,
      false,
      stalePolicy?.enabled ? { stalePolicy } : undefined,
    );
    if (cached?.body) {
      if (
        cached.stale &&
        stalePolicy?.enabled &&
        responseCache.tryAcquireSwrRefresh?.(cacheKey, cacheTenant)
      ) {
        void tryGraphqlFastPath(
          query,
          {
            user: locals.user,
            tenantId: locals.tenantId,
            dbAdapter: locals.dbAdapter,
            publicationFilter,
          },
          variables,
        )
          .then((fresh) => {
            if (fresh) {
              const etag = generateContentEtag(fresh);
              responseCache.set(cacheKey, { body: fresh, etag }, 60_000, cacheTenant);
            }
          })
          .catch(() => {})
          .finally(() => responseCache.releaseSwrRefresh?.(cacheKey, cacheTenant));
      }
      metricsService.recordGraphqlResponseHit(cacheTenant);
      if (splitMarks) splitMarks.set("cachehit", performance.now() - started);
      const res = serveGraphqlCached(request, cached, locals, stalePolicy);
      if (started > 0) {
        const fastHeaders = (res as unknown as { __fastHeaders?: Record<string, string> })
          .__fastHeaders;
        if (fastHeaders) stampGraphqlHeaders(fastHeaders, started, splitMarks);
        else stampGraphqlHeaders(res.headers, started, splitMarks);
      }
      return res;
    }
  }

  const inflightKey = cacheKey ? `${cacheTenant ?? ""}:${cacheKey}` : "";
  if (cacheKey) {
    const inflight = inflightGraphqlReads.get(inflightKey);
    if (inflight) {
      const shared = await inflight;
      if (shared) {
        metricsService.recordGraphqlResponseHit(cacheTenant);
        return serveGraphqlCached(request, shared, locals, stalePolicy);
      }
    }
  }

  // The executor runs synchronously, so `releaseFlight` is bound before use.
  let releaseFlight: (entry: CoalescedGraphqlRead | null) => void = () => {};
  let ownsFlight = false;
  if (cacheKey && inflightGraphqlReads.size < MAX_INFLIGHT_GRAPHQL_READS) {
    ownsFlight = true;
    const flight = new Promise<CoalescedGraphqlRead | null>((res) => {
      releaseFlight = res;
    });
    inflightGraphqlReads.set(inflightKey, flight);
  }

  let published: CoalescedGraphqlRead | null = null;
  try {
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

    const tFast0 = STAMP_GQL_SPLIT ? performance.now() : 0;
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
      if (splitMarks) splitMarks.set("fastpath", performance.now() - tFast0);
      const tenant = locals.tenantId as string;
      if (cacheKey) {
        // Sync L1 so coalesced waiters and the next same-tick request HIT.
        // SHA-256 of the already-stringified fast-path body is cheaper than
        // 8 workers re-running find() after every write invalidates res:graphql.
        const tCache0 = STAMP_GQL_SPLIT ? performance.now() : 0;
        const etag = generateContentEtag(fast);
        responseCache.set(cacheKey, { body: fast, etag }, 60_000, tenant);
        if (splitMarks) splitMarks.set("cachewrite", performance.now() - tCache0);
        published = { body: fast, etag };
        metricsService.recordGraphqlResponseMiss(tenant);
      }
      const extraHeaders: Record<string, string> = {
        "content-type": "application/json",
        "x-cache": "MISS",
      };
      if (started > 0) stampGraphqlHeaders(extraHeaders, started, splitMarks);
      return buildGraphqlResponse(fast, extraHeaders, locals, fast);
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

      const yogaCtx = {
        user: locals.user,
        tenantId: locals.tenantId,
        roles: locals.roles,
        cacheSlot: { value: null as string | null },
        dbAdapter: adapter,
        cms,
        parsedDocument: (locals as any).__graphqlAst as DocumentNode | undefined,
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
      };

      // 🚀 SKIP REQUEST CLONING: Pass the original request for GET, create minimal
      // Request only for POST (Yoga needs the body, but we already have bodyText)
      const yogaBody =
        bodyText && bodyText.includes('"query"')
          ? bodyText
          : JSON.stringify({ query, variables: variables ?? {} });

      const yogaRequest =
        request.method === "POST"
          ? new Request(request.url, { method: "POST", headers: request.headers, body: yogaBody })
          : request;

      const handleYogaRequest = () => yogaApp.handleRequest(yogaRequest, yogaCtx);
      // Phase mark must be a *delta*: `yoga` is one phase in a chain that already
      // spent time on cache lookup / body parse, so anchoring it at `started` would
      // report those phases twice and swamp the split table.
      const tYoga0 = STAMP_GQL_SPLIT ? performance.now() : 0;
      const yogaResponse = PROFILE_WRITE_ENABLED
        ? await profileSpan("gql:yoga.handleRequest", handleYogaRequest)
        : await handleYogaRequest();

      const cacheControl = yogaCtx.cacheSlot.value;
      const skipResponseCache =
        typeof cacheControl === "string" && cacheControl.startsWith("private");
      // When waiters joined this miss, the body must be published before
      // finally() resolves the inflight promise. Solo misses keep etag+L1
      // off the response path so Yoga RPS is not capped by SHA-256.
      // A private Cache-Control must not land in the shared response cache.
      if (cacheKey && yogaResponse.status === 200 && !skipResponseCache) {
        const tenant = locals.tenantId as string;
        if (ownsFlight) {
          const tCache0 = STAMP_GQL_SPLIT ? performance.now() : 0;
          const responseBody = await yogaResponse.clone().text();
          if (!responseBody.includes('"errors":[') && !responseBody.includes(":[]")) {
            const etag = generateContentEtag(responseBody);
            responseCache.set(cacheKey, { body: responseBody, etag }, 60_000, tenant);
            published = { body: responseBody, etag };
          }
          if (splitMarks) splitMarks.set("cachewrite", performance.now() - tCache0);
        } else {
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
        }
        metricsService.recordGraphqlResponseMiss(tenant);
      }

      // SvelteKit requires the route handler to return the platform-native
      // `Response`. Yoga's `@whatwg-node` Response is a different constructor in
      // Node, so passing it through (even after mutating headers) trips
      // `endpoint_invalid_response`. Rebuild the boundary response explicitly.
      const responseHeaders = new Headers(yogaResponse.headers);
      if (cacheKey) responseHeaders.set("X-Cache", "MISS");
      if (cacheControl) responseHeaders.set("Cache-Control", cacheControl);
      if (started > 0) {
        if (splitMarks) splitMarks.set("yoga", performance.now() - tYoga0);
        stampGraphqlHeaders(responseHeaders, started, splitMarks);
      }
      return new Response(yogaResponse.body, {
        status: yogaResponse.status,
        statusText: yogaResponse.statusText,
        headers: responseHeaders,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Internal Server Error";
      const status =
        typeof err === "object" && err && "status" in err && typeof err.status === "number"
          ? err.status
          : 500;
      logger.error("GraphQL Request Error:", err);
      return new Response(
        JSON.stringify({
          errors: [{ message }],
        }),
        {
          status,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  } finally {
    if (ownsFlight) {
      releaseFlight(published);
      inflightGraphqlReads.delete(inflightKey);
    }
  }
}

export const GET = handleRequest;
export const POST = handleRequest;
