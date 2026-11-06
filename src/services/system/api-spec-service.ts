/**
 * @file src/services/system/api-spec-service.ts
 * @description
 * Advanced OpenAPI 3.1.0 Specification Generator for SveltyCMS.
 * Dynamically constructs the API contract from collection schemas and system handlers.
 */

import { version } from "../../../package.json";
import type { Schema, FieldInstance, DatabaseId } from "@src/content/types";
import { CacheCategory } from "@src/databases/cache/types";
import { deepClone } from "@utils/native-utils";
import { logger } from "@utils/logger";
import { ENDPOINT_PERMISSIONS } from "@src/routes/api/[...path]/endpoint-permissions";

/** Cached lazy handle to the engine server — one module-registry lookup instead of one per call. */
let engineServerModulePromise: Promise<typeof import("@src/content/engine.server")> | undefined;
function loadEngineServerModule(): Promise<typeof import("@src/content/engine.server")> {
  return (engineServerModulePromise ??= import("@src/content/engine.server"));
}

/** Cached lazy handle to the cache service — one module-registry lookup instead of one per call. */
let cacheServiceModulePromise:
  | Promise<typeof import("@src/databases/cache/cache-service")>
  | undefined;
function loadCacheServiceModule(): Promise<typeof import("@src/databases/cache/cache-service")> {
  return (cacheServiceModulePromise ??= import("@src/databases/cache/cache-service"));
}

/** Cached lazy handle to the DB module — one module-registry lookup instead of one per call. */
let dbModulePromise: Promise<typeof import("@src/databases/db")> | undefined;
function loadDbModule(): Promise<typeof import("@src/databases/db")> {
  return (dbModulePromise ??= import("@src/databases/db"));
}

/**
 * OpenAPI Response Object for an error status. A bare `$ref` to the ApiError
 * *Schema Object* is invalid here: every response needs its own `description`
 * and the schema belongs under `content`.
 */
function apiErrorResponse(description: string) {
  return {
    description,
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/ApiError" },
      },
    },
  };
}

export class ApiSpecService {
  private static instance: ApiSpecService;
  private baseSpec: any;

  // In-memory L1 cache (Tenant-Aware)
  private l1Cache = new Map<string, { spec: any; specString: string; timestamp: number }>();
  private readonly CACHE_TTL_MS = 300_000; // 5 minutes

  private constructor() {
    this.baseSpec = {
      openapi: "3.1.0",
      info: {
        title: "SveltyCMS Unified API",
        version: version,
        description:
          "Enterprise-grade, high-performance headless API. Supports multi-tenancy, real-time events, and JIT GraphQL. This OpenAPI document is a curated sample: it covers auth, users, system, media, search, tokens, collections, webhooks, workflows and automations. Endpoints outside this list remain available and are enforced by the endpoint-permission map.",
        contact: {
          name: "SveltyCMS Team",
          url: "https://sveltycms.com",
          email: "support@sveltycms.com",
        },
        license: {
          name: "BSL 1.1",
          url: "https://github.com/SveltyCMS/SveltyCMS/blob/main/LICENSE",
        },
      },
      servers: [{ url: "/api", description: "Standard API Endpoint" }],
      tags: [
        { name: "Auth", description: "Identity and session management" },
        { name: "Collections", description: "Dynamic content operations" },
        { name: "Media", description: "Asset management and processing" },
        { name: "System", description: "Health, telemetry, and settings" },
        {
          name: "Search",
          description: "Global and collection-specific search",
        },
        { name: "Tokens", description: "API and Website token management" },
        {
          name: "Webhooks & Automation",
          description: "Outbound webhooks, content workflows and event-driven automation flows",
        },
        {
          name: "SCIM",
          description: "System for Cross-domain Identity Management (v2.0)",
        },
      ],
      paths: {},
      components: {
        schemas: {
          ApiError: {
            type: "object",
            properties: {
              success: { type: "boolean", example: false },
              message: { type: "string" },
              code: { type: "string" },
              issues: { type: "array", items: { type: "string" } },
            },
          },
          HealthResponse: {
            type: "object",
            properties: {
              status: {
                type: "string",
                enum: ["healthy", "degraded", "initializing"],
              },
              database: { type: "string" },
              latency: { type: "number" },
              uptime: { type: "number" },
              timestamp: { type: "integer" },
              dbType: { type: "string" },
              dbVersion: { type: "string" },
            },
          },
        },
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
          apiKeyAuth: {
            type: "apiKey",
            in: "header",
            name: "x-api-key",
          },
        },
      },
    };
  }

  public static getInstance(): ApiSpecService {
    if (!ApiSpecService.instance) {
      ApiSpecService.instance = new ApiSpecService();
    }
    return ApiSpecService.instance;
  }

  /**
   * Internal test helper to reset L1 cache
   */
  public __resetCache(): void {
    this.l1Cache.clear();
  }

  public async invalidateCache(tenantId?: string | null): Promise<void> {
    const cacheKey = `openapi:spec:${tenantId || "global"}`;
    this.l1Cache.clear(); // Clear all keys to guarantee freshness across all tenant contexts
    try {
      const { cacheService } = await loadCacheServiceModule();
      await cacheService.delete(cacheKey, tenantId);
    } catch (err) {
      logger.debug("Non-fatal API spec cache delete error:", err);
    }
  }

  /**
   * Generates the full specification JSON with multi-layer caching
   */
  public async generateSpec(collections: Schema[] = [], tenantId?: string | null): Promise<any> {
    const now = Date.now();
    const cacheKey = `openapi:spec:${tenantId || "global"}`;
    const l1Key = tenantId || "global";

    // 1. Check L1 In-Memory Cache (Tenant-Aware)
    const l1Cached = this.l1Cache.get(l1Key);
    if (l1Cached && now - l1Cached.timestamp < this.CACHE_TTL_MS) {
      return l1Cached.spec;
    }

    // 2. Check L2 Global Cache (Redis/Memory)
    try {
      const { cacheService } = await loadCacheServiceModule();
      const l2Cached = await cacheService.get<any>(cacheKey, tenantId);
      if (l2Cached) {
        this.l1Cache.set(l1Key, {
          spec: l2Cached,
          specString: JSON.stringify(l2Cached),
          timestamp: now,
        });
        return l2Cached;
      }
    } catch (err) {
      const { logger } = await import("@utils/logger");
      logger.debug("Non-fatal API spec cache miss:", err);
    }

    // 3. ACTUAL GENERATION (Only if cache miss)
    const spec = deepClone(this.baseSpec);

    // 1. Add Auth & User Paths
    this.addAuthPaths(spec);
    this.addUserPaths(spec);

    // 2. Add System & Utility Paths
    this.addSystemPaths(spec);
    this.addUtilityPaths(spec);

    // 3. Add Media Paths
    this.addMediaPaths(spec);

    // 4. Add Search Paths
    this.addSearchPaths(spec);

    // 5. Add Token Paths
    this.addTokenPaths(spec);

    // 6. Add Webhooks, Workflows & Automations
    this.addAutomationPaths(spec);

    // 7. Publish the complete namespace inventory (documented + undocumented).
    //    The curated paths are a subset; this extension makes the coverage gap
    //    explicit and machine-readable instead of hidden.
    const documented = new Set(
      Object.keys(spec.paths)
        .map((path) => path.split("/").filter(Boolean)[0])
        .filter((namespace): namespace is string => Boolean(namespace)),
    );
    const endpointPermissions = Object.fromEntries(
      Object.entries(ENDPOINT_PERMISSIONS).map(([namespace, mapping]) => [
        namespace,
        typeof mapping === "function" ? "method-dependent" : mapping,
      ]),
    );
    spec["x-sveltycms"] = {
      endpointPermissions,
      documentedNamespaces: [...documented].filter((ns) => ns in endpointPermissions).sort(),
      undocumentedNamespaces: Object.keys(endpointPermissions)
        .filter((namespace) => !documented.has(namespace))
        .sort(),
    };

    // 8. Add Collection Paths dynamically
    for (const collection of collections) {
      this.addCollectionPaths(spec, collection);
    }

    // Update Caches
    const specString = JSON.stringify(spec);
    this.l1Cache.set(l1Key, { spec, specString, timestamp: now });

    try {
      const { cacheService } = await loadCacheServiceModule();
      await cacheService.set(cacheKey, spec, 300, tenantId, CacheCategory.API);
    } catch (err) {
      const { logger } = await import("@utils/logger");
      logger.debug("Non-fatal API spec cache write error:", err);
    }

    return spec;
  }

  /**
   * Convenience wrapper that fetches collections from DB and generates spec.
   * Useful for background warming.
   */
  public async generateFullSpec(tenantId?: string | null): Promise<any> {
    const now = Date.now();
    const l1Key = tenantId || "global";

    // 1. L1 Memory Check FIRST to avoid any work
    const l1Cached = this.l1Cache.get(l1Key);
    if (l1Cached && now - l1Cached.timestamp < this.CACHE_TTL_MS) {
      return l1Cached.spec;
    }

    try {
      const { contentService } = await loadEngineServerModule();
      const collections = await contentService.getContentStructureFromDatabase("flat", tenantId);
      const schemaMap = new Map<string, Schema>();

      const mergeSchema = (candidate?: Schema | null) => {
        if (!candidate) return;
        const key = (candidate._id || candidate.name || "").toString().trim().toLowerCase();
        if (!key) return;

        const existing = schemaMap.get(key);
        if (!existing || (existing.fields?.length ?? 0) < (candidate.fields?.length ?? 0)) {
          schemaMap.set(key, candidate);
        }
      };

      // Prefer the content structure because it reflects builder metadata and route shape.
      const schemaOnly = collections
        .filter((n) => n.nodeType === "collection" && n.collectionDef)
        .map((n) => n.collectionDef as Schema);
      for (const schema of schemaOnly) {
        mergeSchema(schema);
      }

      // Some adapters can materialize schemas before content nodes are fully persisted.
      // Fall back to the DB schema registry so /api/openapi.json remains adapter-agnostic.
      const { getDb } = await loadDbModule();
      const db = await getDb();
      const listSchemasResult = db?.collection?.listSchemas
        ? await db.collection.listSchemas(tenantId as DatabaseId | null | undefined)
        : null;
      const dbSchemas = Array.isArray(listSchemasResult)
        ? listSchemasResult
        : listSchemasResult?.success
          ? (listSchemasResult.data ?? [])
          : [];
      for (const schema of dbSchemas) {
        mergeSchema(schema);
      }

      return this.generateSpec(Array.from(schemaMap.values()), tenantId);
    } catch (err: any) {
      const { logger } = await import("@utils/logger");
      logger.error("Failed to generate full API spec", {
        tenantId,
        error: err.message,
      });
      return this.generateSpec([], tenantId);
    }
  }

  private addAuthPaths(spec: any) {
    spec.paths["/auth/login"] = {
      post: {
        tags: ["Auth"],
        operationId: "auth.login",
        summary: "Login",
        description: "Authenticates a user and returns a session token.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: {
                    type: "string",
                    format: "email",
                    example: "admin@example.com",
                  },
                  password: {
                    type: "string",
                    format: "password",
                    example: "********",
                  },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Success" },
          401: apiErrorResponse("Unauthorized"),
        },
      },
    };

    spec.paths["/auth/logout"] = {
      post: {
        tags: ["Auth"],
        operationId: "auth.logout",
        summary: "Logout",
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: "Logged out" },
        },
      },
    };

    spec.paths["/auth/me"] = {
      get: {
        tags: ["Auth"],
        operationId: "auth.me",
        summary: "Identify Current User",
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: "Current user profile" },
          401: apiErrorResponse("Unauthorized"),
        },
      },
    };
  }

  private addUserPaths(spec: any) {
    spec.paths["/user"] = {
      get: {
        tags: ["Auth"],
        operationId: "user.list",
        summary: "List Users",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "page",
            in: "query",
            schema: { type: "integer", default: 1 },
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 10 },
          },
        ],
        responses: {
          200: { description: "List of users" },
        },
      },
    };
  }

  private addSystemPaths(spec: any) {
    spec.paths["/system/health"] = {
      get: {
        tags: ["System"],
        operationId: "system.health",
        summary: "Health Check",
        responses: {
          200: {
            description: "System is healthy",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HealthResponse" },
              },
            },
          },
        },
      },
    };

    spec.paths["/dashboard/metrics"] = {
      get: {
        tags: ["System"],
        operationId: "system.metrics",
        summary: "Get Performance Metrics",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "detailed",
            in: "query",
            schema: { type: "boolean", default: false },
          },
        ],
        responses: {
          200: { description: "Performance report" },
        },
      },
    };
  }

  private addUtilityPaths(spec: any) {
    spec.paths["/cache/clear"] = {
      post: {
        tags: ["System"],
        operationId: "utility.cacheClear",
        summary: "Clear Cache",
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  type: {
                    type: "string",
                    enum: ["content", "all"],
                    default: "all",
                  },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Cache cleared" },
        },
      },
    };

    spec.paths["/trash"] = {
      get: {
        tags: ["Collections"],
        operationId: "utility.trashList",
        summary: "List Deleted Items",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "Trash list" } },
      },
    };
  }

  private addMediaPaths(spec: any) {
    spec.paths["/media/list"] = {
      get: {
        tags: ["Media"],
        operationId: "media.list",
        summary: "List Assets",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 100 },
          },
          { name: "folderId", in: "query", schema: { type: "string" } },
        ],
        responses: {
          200: { description: "Success" },
        },
      },
    };

    spec.paths["/media/upload"] = {
      post: {
        tags: ["Media"],
        operationId: "media.upload",
        summary: "Upload Assets",
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  files: {
                    type: "array",
                    items: { type: "string", format: "binary" },
                  },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Upload results" },
        },
      },
    };
  }

  private addSearchPaths(spec: any) {
    spec.paths["/search"] = {
      get: {
        tags: ["Search"],
        operationId: "search.global",
        summary: "Global Search",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "q",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "type",
            in: "query",
            schema: { type: "string" },
            description: "Comma-separated collection IDs",
          },
        ],
        responses: { 200: { description: "Search results" } },
      },
    };
  }

  private addTokenPaths(spec: any) {
    spec.paths["/token/list"] = {
      get: {
        tags: ["Tokens"],
        operationId: "tokens.list",
        summary: "List API Tokens",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "Token list" } },
      },
    };
  }

  /**
   * Webhooks, workflows and automation flows share one admin surface but are
   * three distinct contracts: durable outbound delivery (retry/logs),
   * per-collection lifecycle transitions, and event-triggered operation chains.
   * They were absent from the published spec entirely.
   */
  private addAutomationPaths(spec: any) {
    const badRequest = apiErrorResponse("Bad request");
    const forbidden = apiErrorResponse("Forbidden");
    const notFound = apiErrorResponse("Not found");
    const idParam = [{ name: "id", in: "path", required: true, schema: { type: "string" } }];
    const security = [{ bearerAuth: [] }];
    const tag = ["Webhooks & Automation"];

    const webhookBody = {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            required: ["url"],
            properties: {
              name: { type: "string" },
              url: { type: "string", format: "uri" },
              events: { type: "array", items: { type: "string" } },
              event: { type: "string" },
              active: { type: "boolean" },
              secret: { type: "string", description: "HMAC-SHA-256 signing secret" },
              headers: { type: "object", additionalProperties: { type: "string" } },
            },
          },
        },
      },
    } as const;

    const webhookPatchBody = {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              name: { type: "string" },
              url: { type: "string", format: "uri" },
              events: { type: "array", items: { type: "string" } },
              event: { type: "string" },
              active: { type: "boolean" },
              secret: { type: "string" },
              headers: { type: "object", additionalProperties: { type: "string" } },
            },
          },
        },
      },
    } as const;

    const workflowBody = {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            required: ["collectionId"],
            properties: {
              _id: { type: "string" },
              collectionId: { type: "string" },
              name: { type: "string" },
              states: { type: "array", items: { type: "object", additionalProperties: true } },
              transitions: {
                type: "array",
                items: { type: "object", additionalProperties: true },
              },
            },
            additionalProperties: true,
          },
        },
      },
    } as const;

    const workflowTransitionBody = {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            required: ["entryId"],
            properties: {
              entryId: { type: "string" },
              targetStateId: { type: "string" },
              assigneeId: { type: "string" },
              comment: { type: "string" },
            },
            anyOf: [{ required: ["targetStateId"] }, { required: ["assigneeId"] }],
          },
        },
      },
    } as const;

    const automationBody = {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              trigger: { type: "object", additionalProperties: true },
              actions: { type: "array", items: { type: "object", additionalProperties: true } },
              active: { type: "boolean" },
            },
            additionalProperties: true,
          },
        },
      },
    } as const;

    spec.paths["/webhooks"] = {
      get: {
        tags: tag,
        operationId: "webhooks.list",
        summary: "List configured webhooks",
        security,
        responses: { 200: { description: "Webhook list" }, 403: forbidden },
      },
      post: {
        tags: tag,
        operationId: "webhooks.create",
        summary: "Create a webhook",
        security,
        requestBody: webhookBody,
        responses: { 201: { description: "Created" }, 400: badRequest, 403: forbidden },
      },
    };

    spec.paths["/webhooks/{id}"] = {
      parameters: idParam,
      patch: {
        tags: tag,
        operationId: "webhooks.update",
        summary: "Update a webhook",
        security,
        requestBody: webhookPatchBody,
        responses: { 200: { description: "Updated" }, 404: notFound },
      },
      delete: {
        tags: tag,
        operationId: "webhooks.delete",
        summary: "Delete a webhook",
        security,
        responses: { 200: { description: "Deleted" }, 404: notFound },
      },
    };

    spec.paths["/webhooks/{id}/test"] = {
      parameters: idParam,
      post: {
        tags: tag,
        operationId: "webhooks.test",
        summary: "Send a test event",
        security,
        responses: { 200: { description: "Delivery attempted" }, 404: notFound },
      },
    };

    spec.paths["/webhooks/logs"] = {
      get: {
        tags: tag,
        operationId: "webhooks.logs",
        summary: "List delivery attempts (durable webhook-delivery jobs)",
        description:
          "Includes retry state and last error; a failed job may be requeued with POST /webhooks/logs/{id}/retry.",
        security,
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", default: 50, maximum: 200 } },
          {
            name: "status",
            in: "query",
            schema: { type: "string", enum: ["pending", "running", "completed", "failed"] },
          },
        ],
        responses: { 200: { description: "Delivery log rows" }, 403: forbidden },
      },
    };

    spec.paths["/webhooks/logs/{id}/retry"] = {
      parameters: idParam,
      post: {
        tags: tag,
        operationId: "webhooks.retryDelivery",
        summary: "Requeue a failed delivery",
        security,
        responses: { 200: { description: "Requeued" }, 404: notFound },
      },
    };

    spec.paths["/workflows"] = {
      get: {
        tags: tag,
        operationId: "workflows.get",
        summary: "Read a workflow definition or an entry's workflow instance",
        security,
        parameters: [
          { name: "collectionId", in: "query", schema: { type: "string" } },
          { name: "entryId", in: "query", schema: { type: "string" } },
        ],
        responses: {
          200: { description: "Definition or instance" },
          400: badRequest,
          403: forbidden,
        },
      },
      post: {
        tags: tag,
        operationId: "workflows.save",
        summary: "Save a workflow definition",
        security,
        requestBody: workflowBody,
        responses: {
          200: { description: "Saved" },
          201: { description: "Created" },
          400: badRequest,
        },
      },
      patch: {
        tags: tag,
        operationId: "workflows.transition",
        summary: "Transition or assign an entry",
        security,
        requestBody: workflowTransitionBody,
        responses: { 200: { description: "Updated instance" }, 400: badRequest, 403: forbidden },
      },
      delete: {
        tags: tag,
        operationId: "workflows.delete",
        summary: "Delete a workflow definition",
        security,
        parameters: [{ name: "id", in: "query", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Deleted" }, 400: badRequest },
      },
    };

    spec.paths["/automations"] = {
      get: {
        tags: tag,
        operationId: "automations.list",
        summary: "List automation flows",
        security,
        responses: { 200: { description: "Flow list" }, 403: forbidden },
      },
      post: {
        tags: tag,
        operationId: "automations.create",
        summary: "Create an automation flow",
        security,
        requestBody: automationBody,
        responses: { 201: { description: "Created" }, 400: badRequest, 403: forbidden },
      },
    };

    spec.paths["/automations/{id}"] = {
      parameters: idParam,
      get: {
        tags: tag,
        operationId: "automations.get",
        summary: "Read a flow",
        security,
        responses: { 200: { description: "Flow" }, 404: notFound },
      },
      patch: {
        tags: tag,
        operationId: "automations.update",
        summary: "Update a flow",
        security,
        requestBody: automationBody,
        responses: { 200: { description: "Updated" }, 404: notFound },
      },
      delete: {
        tags: tag,
        operationId: "automations.delete",
        summary: "Delete a flow",
        security,
        responses: { 200: { description: "Deleted" }, 404: notFound },
      },
    };

    spec.paths["/automations/{id}/test"] = {
      parameters: idParam,
      post: {
        tags: tag,
        operationId: "automations.test",
        summary: "Execute a flow with a test payload",
        security,
        responses: { 200: { description: "Execution log" }, 404: notFound },
      },
    };

    spec.paths["/automations/{id}/logs"] = {
      parameters: idParam,
      get: {
        tags: tag,
        operationId: "automations.logs",
        summary: "Recent execution logs for a flow",
        security,
        responses: { 200: { description: "Execution log entries" }, 404: notFound },
      },
    };
  }

  private addCollectionPaths(spec: any, collection: Schema) {
    const name = collection.name;
    const schemaName = `Collection_${name}`;

    // Register the schema component
    spec.components.schemas[schemaName] = this.mapFieldsToSchema(
      collection.fields as FieldInstance[],
    );

    const basePath = `/collections/${name}`;
    spec.paths[basePath] = {
      get: {
        tags: ["Collections"],
        operationId: `collections.${name}.list`,
        summary: `List ${name} entries`,
        parameters: [
          {
            name: "page",
            in: "query",
            schema: { type: "integer", default: 1 },
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 50 },
          },
          {
            name: "filter",
            in: "query",
            schema: { type: "string" },
            description: "JSON stringified Mongo-style filter",
          },
        ],
        responses: {
          200: {
            description: "Successful response",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: {
                      type: "array",
                      items: { $ref: `#/components/schemas/${schemaName}` },
                    },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["Collections"],
        operationId: `collections.${name}.create`,
        summary: `Create ${name} entry`,
        security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: `#/components/schemas/${schemaName}` },
            },
          },
        },
        responses: {
          201: { description: "Created" },
          400: apiErrorResponse("Bad request"),
        },
      },
    };

    spec.paths[`${basePath}/{id}`] = {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      get: {
        tags: ["Collections"],
        operationId: `collections.${name}.get`,
        summary: `Get ${name} by ID`,
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json": {
                schema: { $ref: `#/components/schemas/${schemaName}` },
              },
            },
          },
        },
      },
      patch: {
        tags: ["Collections"],
        operationId: `collections.${name}.update`,
        summary: `Partial Update ${name}`,
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: { $ref: `#/components/schemas/${schemaName}` },
            },
          },
        },
        responses: {
          200: { description: "Updated" },
        },
      },
      delete: {
        tags: ["Collections"],
        operationId: `collections.${name}.delete`,
        summary: `Delete ${name}`,
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: "Deleted" },
        },
      },
    };
  }

  private mapFieldsToSchema(fields: FieldInstance[], depth = 0): any {
    if (depth > 5) {
      return {
        type: "object",
        description: "Recursion Limit Reached",
        additionalProperties: true,
      };
    }

    const properties: any = {
      _id: {
        type: "string",
        format: "uuid",
        example: "67f8c9d2e1b3a4f5c6d7e8f9",
      },
      status: {
        type: "string",
        enum: ["published", "draft", "archived"],
        default: "published",
      },
      createdAt: { type: "string", format: "date-time" },
      updatedAt: { type: "string", format: "date-time" },
    };

    const typeMapping: Record<string, any> = {
      number: { type: "number", example: 42 },
      boolean: { type: "boolean", default: false },
      checkbox: { type: "boolean", default: false },
      date: { type: "string", format: "date-time" },
      datetime: { type: "string", format: "date-time" },
      email: { type: "string", format: "email" },
      url: { type: "string", format: "uri" },
      relation: { type: "string", format: "uuid" },
    };

    for (const field of fields) {
      const fieldName = field.db_fieldName;
      if (!fieldName) continue;

      let fieldSchema: any = { description: field.label };
      const widgetName = field.widget?.Name || field.type;

      // 🚀 Recursive Handling for Groups and Repeaters
      if (widgetName === "Repeater" || widgetName === "Group") {
        const nestedFields = (field as any).fields || [];
        const nestedSchema = this.mapFieldsToSchema(nestedFields, depth + 1);

        if (widgetName === "Repeater") {
          fieldSchema = {
            type: "array",
            items: nestedSchema,
            description: `${field.label} (List)`,
          };
        } else {
          fieldSchema = {
            ...nestedSchema,
            description: `${field.label} (Group)`,
          };
        }
      } else if (widgetName === "Select" && Array.isArray((field as any).options)) {
        fieldSchema.type = "string";
        fieldSchema.enum = (field as any).options.map((o: any) => o.value || o);
      } else {
        const mapped =
          typeMapping[(widgetName || "").toLowerCase()] ||
          typeMapping[(field.type || "").toLowerCase()];
        if (mapped) {
          fieldSchema = { ...fieldSchema, ...mapped };
        } else if (widgetName === "Media" || widgetName === "Image") {
          fieldSchema.type = "string";
          fieldSchema.description = `${field.label} (Media URL or Array)`;
        } else if (widgetName === "RichText") {
          fieldSchema.type = "string";
          fieldSchema.contentMediaType = "text/html";
        } else {
          fieldSchema.type = "string";
        }
      }

      // Handle translation wrapper
      if (field.translated) {
        properties[fieldName] = {
          type: "object",
          description: `${field.label} (Multilingual Object)`,
          additionalProperties: { type: fieldSchema.type },
          example: { en: "Example Text" },
        };
      } else {
        properties[fieldName] = fieldSchema;
      }
    }

    return {
      type: "object",
      properties,
    };
  }
}

export const apiSpecService = ApiSpecService.getInstance();
