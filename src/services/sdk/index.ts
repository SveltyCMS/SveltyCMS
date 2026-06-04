/**
 * @file src/services/local-cms.ts
 * @description
 * High-performance, modular Local SDK for SveltyCMS.
 * This is the primary internal entry point for server-to-server CMS operations.
 *
 * Features:
 * - Namespace-based architecture for better tree-shaking and maintainability.
 * - Zero HTTP overhead; direct database adapter access.
 * - Lazy-loading of service dependencies via dynamic imports.
 * - Multi-tenant isolation by design.
 */

import type { IDBAdapter } from "@src/databases/db-interface";
import type {
  AuthNamespace,
  TokensNamespace,
} from "./namespaces/auth-namespace";
import type { CollectionsNamespace } from "./namespaces/collections-namespace";
import type { MediaNamespace } from "./namespaces/media-namespace";
import type {
  WidgetsNamespace,
  SystemNamespace,
  TelemetryNamespace,
  AutomationNamespace,
  WebsiteTokensNamespace,
} from "./namespaces/misc-namespaces";
import { traceSpan } from "@utils/context";

const ASYNC_METHODS: Record<string, Set<string>> = {
  collections: new Set([
    "list",
    "search",
    "find",
    "findStreaming",
    "count",
    "getSchema",
    "getStructure",
    "reorderContentNodes",
    "getRevisions",
    "bulkCreate",
    "bulkUpdate",
    "bulkDelete",
    "findById",
    "executeBatch",
    "create",
    "update",
    "delete",
  ]),
  auth: new Set(["login", "logout", "me", "validateToken", "getPermissions"]),
  system: new Set([
    "getHealth",
    "reinitialize",
    "refresh",
    "getPreferences",
    "setPreference",
    "sendMail",
  ]),
  media: new Set(["list", "upload", "delete", "getMetadata"]),
};

/**
 * Dynamically wraps all methods of a namespace instance inside high-resolution tracing spans.
 * Short-circuits with absolute zero overhead if tracing is not active.
 */
function instrumentNamespace<T extends object>(name: string, instance: T): T {
  const proto = Object.getPrototypeOf(instance);
  if (!proto) return instance;

  const asyncSet = ASYNC_METHODS[name];
  if (!asyncSet) return instance;

  const keys = Object.getOwnPropertyNames(proto);
  for (const key of keys) {
    if (!asyncSet.has(key)) continue;

    const original = (instance as any)[key];
    if (typeof original === "function") {
      if (process.env.BENCHMARK_DEBUG === "true") {
        console.log(`[SDK] Instrumenting async method ${name}:${key}`);
      }

      (instance as any)[key] = async function (this: any, ...args: any[]) {
        return await traceSpan(`sdk:${name}:${key}`, async () => {
          return await original.apply(this, args);
        });
      };
    }
  }
  return instance;
}

/**
 * Defines a lazy-loaded namespace using Object.defineProperty.
 * This eliminates Proxy overhead after the first access.
 */
function defineLazyNamespace<T extends object>(
  target: any,
  property: string,
  factory: () => Promise<T>,
  nestedNamespaces: Record<string, boolean> = {},
) {
  let instance: T | null = null;
  let initPromise: Promise<T> | null = null;

  const getInstance = async () => {
    if (instance) return instance;
    if (!initPromise) {
      initPromise = factory().then((res) => {
        instance = res;
        return res;
      });
    }
    return initPromise;
  };

  let proxyInstance: any = null;

  Object.defineProperty(target, property, {
    get: () => {
      if (proxyInstance) return proxyInstance;

      proxyInstance = new Proxy({} as T, {
        get: (_, prop: string) => {
          if (nestedNamespaces[prop]) {
            return new Proxy(
              {},
              {
                get:
                  (_, nestedProp: string) =>
                  async (...args: any[]) => {
                    const targetInstance = await getInstance();
                    const nested = (targetInstance as any)[prop];
                    return nested[nestedProp].apply(nested, args);
                  },
              },
            );
          }

          return async (...args: any[]) => {
            const targetInstance = await getInstance();

            // HOT-SWAP: Replace the property on the main target with the actual instance.
            // Future accesses to target[property] will bypass the Proxy entirely.
            Object.defineProperty(target, property, {
              value: targetInstance,
              writable: false,
              configurable: true,
              enumerable: true,
            });

            const targetProp = (targetInstance as any)[prop];
            return typeof targetProp === "function"
              ? targetProp.apply(targetInstance, args)
              : targetProp;
          };
        },
      });
      return proxyInstance;
    },
    configurable: true,
    enumerable: true,
  });
}

/**
 * LocalCMS SDK
 * Orchestrator for all modular CMS namespaces.
 */
export class LocalCMS {
  private _contentSystem: any;

  public readonly auth!: AuthNamespace;
  public readonly tokens!: TokensNamespace;
  public readonly collections!: CollectionsNamespace;
  public readonly media!: MediaNamespace;
  public readonly widgets!: WidgetsNamespace;
  public readonly system!: SystemNamespace;
  public readonly telemetry!: TelemetryNamespace;
  public readonly automation!: AutomationNamespace;
  public readonly websiteTokens!: WebsiteTokensNamespace;

  /**
   * Access the underlying database adapter directly.
   * Required for backward compatibility with some legacy handlers.
   */
  public get db(): IDBAdapter {
    return this._dbAdapter;
  }

  /**
   * Access the internal content system.
   */
  public get content(): any {
    return this._contentSystem;
  }

  /**
   * Constructor with backward compatibility for (adapter, contentSystem) signature.
   */
  constructor(
    private _dbAdapter: IDBAdapter,
    contentSystemOrOptions?: any,
  ) {
    this._contentSystem =
      contentSystemOrOptions?.contentSystem !== undefined
        ? contentSystemOrOptions.contentSystem
        : contentSystemOrOptions;

    // Initialize Namespaces lazily using defineLazyNamespace (Hyper-Performance)
    defineLazyNamespace(
      this,
      "auth",
      async () => {
        const { AuthNamespace } = await import("./namespaces/auth-namespace");
        return instrumentNamespace("auth", new AuthNamespace(this._dbAdapter));
      },
      { tokens: true },
    );

    defineLazyNamespace(this, "tokens", async () => {
      const { TokensNamespace } = await import("./namespaces/auth-namespace");
      return instrumentNamespace(
        "tokens",
        new TokensNamespace(this._dbAdapter),
      );
    });

    defineLazyNamespace(this, "collections", async () => {
      const { CollectionsNamespace } =
        await import("./namespaces/collections-namespace");
      return instrumentNamespace(
        "collections",
        new CollectionsNamespace(this._dbAdapter, this._contentSystem),
      );
    });

    defineLazyNamespace(this, "media", async () => {
      const { MediaNamespace } = await import("./namespaces/media-namespace");
      return instrumentNamespace("media", new MediaNamespace(this._dbAdapter));
    });

    defineLazyNamespace(this, "widgets", async () => {
      const { WidgetsNamespace } = await import("./namespaces/misc-namespaces");
      return instrumentNamespace(
        "widgets",
        new WidgetsNamespace(this._dbAdapter),
      );
    });

    defineLazyNamespace(
      this,
      "system",
      async () => {
        const { SystemNamespace } =
          await import("./namespaces/misc-namespaces");
        return instrumentNamespace(
          "system",
          new SystemNamespace(this._dbAdapter),
        );
      },
      { settings: true, importer: true },
    );

    defineLazyNamespace(this, "automation", async () => {
      const { AutomationNamespace } =
        await import("./namespaces/misc-namespaces");
      return instrumentNamespace(
        "automation",
        new AutomationNamespace(this._dbAdapter),
      );
    });

    defineLazyNamespace(this, "telemetry", async () => {
      const { TelemetryNamespace } =
        await import("./namespaces/misc-namespaces");
      return instrumentNamespace(
        "telemetry",
        new TelemetryNamespace(this._dbAdapter),
      );
    });

    defineLazyNamespace(this, "websiteTokens", async () => {
      const { WebsiteTokensNamespace } =
        await import("./namespaces/misc-namespaces");
      return instrumentNamespace(
        "websiteTokens",
        new WebsiteTokensNamespace(this._dbAdapter),
      );
    });
  }

  /**
   * Static factory to provide an ergonomic locals bridge.
   * Preserves backward compatibility for existing controllers.
   */
  static getLocals(adapter: IDBAdapter, eventLocals: any, contentSystem?: any) {
    const cms = new LocalCMS(adapter, contentSystem);
    return {
      find: (id: string, options?: any) =>
        cms.collections.find(id, {
          tenantId: eventLocals.tenantId,
          user: eventLocals.user,
          ...options,
        }),
      findById: (id: string, entryId: string, options?: any) =>
        cms.collections.findById(id, entryId, {
          tenantId: eventLocals.tenantId,
          user: eventLocals.user,
          ...options,
        }),
      create: (id: string, data: any, options?: any) =>
        cms.collections.create(id, data, {
          tenantId: eventLocals.tenantId,
          user: eventLocals.user,
          ...options,
        }),
      update: (id: string, entryId: string, data: any, options?: any) =>
        cms.collections.update(id, entryId, data, {
          tenantId: eventLocals.tenantId,
          user: eventLocals.user,
          ...options,
        }),
      delete: (id: string, entryId: string, options?: any) =>
        cms.collections.delete(id, entryId, {
          tenantId: eventLocals.tenantId,
          user: eventLocals.user,
          ...options,
        }),
      auth: cms.auth,
      collections: cms.collections,
      media: cms.media,
      system: cms.system,
      widgets: cms.widgets,
    };
  }

  /**
   * Helper to check if the adapter is healthy
   */
  async ping(): Promise<boolean> {
    try {
      return !!(this._dbAdapter as any).db;
    } catch {
      return false;
    }
  }
}
