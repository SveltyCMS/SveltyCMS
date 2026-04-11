/**
 * @file src/services/system/api-spec-service.ts
 * @description
 * Advanced OpenAPI 3.1.0 Specification Generator for SveltyCMS.
 * Dynamically constructs the API contract from collection schemas and system handlers.
 */

import { version } from "../../../package.json";
import type { Schema, FieldInstance } from "@src/content/types";
import { CacheCategory } from "@src/databases/cache/types";

export class ApiSpecService {
  private static instance: ApiSpecService;
  private baseSpec: any;

  // In-memory L1 cache
  private cachedSpec: any = null;
  private cacheTimestamp = 0;
  private readonly CACHE_TTL_MS = 300_000; // 5 minutes

  private constructor() {
    this.baseSpec = {
      openapi: "3.1.0",
      info: {
        title: "SveltyCMS Unified API",
        version: version,
        description:
          "Enterprise-grade, high-performance headless API. Supports multi-tenancy, real-time events, and JIT GraphQL.",
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
        { name: "Search", description: "Global and collection-specific search" },
        { name: "Tokens", description: "API and Website token management" },
        { name: "SCIM", description: "System for Cross-domain Identity Management (v2.0)" },
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
              status: { type: "string", enum: ["healthy", "degraded", "initializing"] },
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
    this.cachedSpec = null;
    this.cacheTimestamp = 0;
  }

  /**
   * Invalidates the OpenAPI specification cache
   */
  public async invalidateCache(tenantId?: string): Promise<void> {
    const cacheKey = `openapi:spec:${tenantId || "global"}`;
    this.cachedSpec = null;
    this.cacheTimestamp = 0;
    try {
      const { cacheService } = await import("@src/databases/cache/cache-service");
      await cacheService.delete(cacheKey, tenantId);
    } catch (err) {
      // Non-fatal
    }
  }

  /**
   * Generates the full specification JSON with multi-layer caching
   */
  public async generateSpec(collections: Schema[] = [], tenantId?: string): Promise<any> {
    const now = Date.now();
    const cacheKey = `openapi:spec:${tenantId || "global"}`;

    // 1. Check L1 In-Memory Cache
    if (this.cachedSpec && now - this.cacheTimestamp < this.CACHE_TTL_MS) {
      return this.cachedSpec;
    }

    // 2. Check L2 Global Cache (Redis/Memory)
    try {
      const { cacheService } = await import("@src/databases/cache/cache-service");
      const l2Cached = await cacheService.get(cacheKey, tenantId);
      if (l2Cached) {
        this.cachedSpec = l2Cached;
        this.cacheTimestamp = now;
        return l2Cached;
      }
    } catch (err) {
      // Non-fatal cache miss
    }

    const spec = JSON.parse(JSON.stringify(this.baseSpec));

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

    // 6. Add Collection Paths dynamically
    for (const collection of collections) {
      this.addCollectionPaths(spec, collection);
    }

    // Update Caches
    this.cachedSpec = spec;
    this.cacheTimestamp = now;

    try {
      const { cacheService } = await import("@src/databases/cache/cache-service");
      await cacheService.set(cacheKey, spec, 300, tenantId, CacheCategory.API);
    } catch (err) {
      // Non-fatal cache write error
    }

    return spec;
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
                  email: { type: "string", format: "email", example: "admin@example.com" },
                  password: { type: "string", format: "password", example: "********" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Success" },
          401: { $ref: "#/components/schemas/ApiError" },
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
          401: { $ref: "#/components/schemas/ApiError" },
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
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 10 } },
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
              "application/json": { schema: { $ref: "#/components/schemas/HealthResponse" } },
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
          { name: "detailed", in: "query", schema: { type: "boolean", default: false } },
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
                properties: { type: { type: "string", enum: ["content", "all"], default: "all" } },
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
          { name: "limit", in: "query", schema: { type: "integer", default: 100 } },
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
                  files: { type: "array", items: { type: "string", format: "binary" } },
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
          { name: "q", in: "query", required: true, schema: { type: "string" } },
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
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 50 } },
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
                    data: { type: "array", items: { $ref: `#/components/schemas/${schemaName}` } },
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
          400: { $ref: "#/components/schemas/ApiError" },
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
              "application/json": { schema: { $ref: `#/components/schemas/${schemaName}` } },
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
            "application/json": { schema: { $ref: `#/components/schemas/${schemaName}` } },
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

  private mapFieldsToSchema(fields: FieldInstance[]): any {
    const properties: any = {
      _id: { type: "string", format: "uuid", example: "67f8c9d2e1b3a4f5c6d7e8f9" },
      status: { type: "string", enum: ["published", "draft", "archived"], default: "published" },
      createdAt: { type: "string", format: "date-time" },
      updatedAt: { type: "string", format: "date-time" },
    };

    for (const field of fields) {
      const fieldName = field.db_fieldName;
      if (!fieldName) continue;

      let fieldSchema: any = { description: field.label };

      // Try to infer type from GraphqlSchema or Widget Name
      const widgetName = field.widget?.Name;

      switch (widgetName) {
        case "Number":
          fieldSchema.type = "number";
          fieldSchema.example = 42;
          break;
        case "Boolean":
        case "Checkbox":
          fieldSchema.type = "boolean";
          fieldSchema.default = false;
          break;
        case "Date":
        case "DateTime":
          fieldSchema.type = "string";
          fieldSchema.format = "date-time";
          break;
        case "Relation":
          fieldSchema.type = "string";
          fieldSchema.format = "uuid";
          fieldSchema.description = `${field.label} (References ${field.relation?.collection || "Collection"})`;
          fieldSchema.example = "67f8c9d2e1b3a4f5c6d7e8f9";
          break;
        case "Array":
          fieldSchema.type = "array";
          fieldSchema.items = { type: "string" };
          break;
        case "RichText":
          fieldSchema.type = "string";
          fieldSchema.contentMediaType = "text/html";
          fieldSchema.description = `${field.label} (HTML Content)`;
          break;
        case "Email":
          fieldSchema.type = "string";
          fieldSchema.format = "email";
          break;
        case "Url":
          fieldSchema.type = "string";
          fieldSchema.format = "uri";
          break;
        default:
          fieldSchema.type = "string";
      }

      // Handle translation wrapper
      if (field.translated) {
        properties[fieldName] = {
          type: "object",
          description: `${field.label} (Multilingual Object)`,
          additionalProperties: { type: fieldSchema.type },
          example: { en: "Example Text", de: "Beispieltext" },
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
