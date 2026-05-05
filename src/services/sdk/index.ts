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
import type { AuthNamespace, TokensNamespace } from "./namespaces/auth-namespace";
import type { CollectionsNamespace } from "./namespaces/collections-namespace";
import type { MediaNamespace } from "./namespaces/media-namespace";
import type {
  WidgetsNamespace,
  SystemNamespace,
  TelemetryNamespace,
  AutomationNamespace,
  WebsiteTokensNamespace,
} from "./namespaces/misc-namespaces";

/**
 * Creates a lazy-loaded Proxy for a namespace to defer dynamic imports.
 */
function createLazyNamespace<T extends object>(
  factory: () => Promise<T>,
  nestedNamespaces: Record<string, boolean> = {},
): T {
  let instance: T | null = null;
  let initPromise: Promise<T> | null = null;
  const nestedProxies: Record<string, any> = {};

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

  return new Proxy({} as T, {
    get: (_, prop: string) => {
      // Handle nested namespaces (e.g. auth.tokens)
      if (nestedNamespaces[prop]) {
        if (!nestedProxies[prop]) {
          nestedProxies[prop] = new Proxy(
            {},
            {
              get:
                (_, nestedProp: string) =>
                async (...args: any[]) => {
                  const targetInstance = await getInstance();
                  const nested = (targetInstance as any)[prop];
                  const targetFn = nested[nestedProp];
                  if (typeof targetFn === "function") {
                    return targetFn.apply(nested, args);
                  }
                  return targetFn;
                },
            },
          );
        }
        return nestedProxies[prop];
      }

      // Handle direct method calls
      return async (...args: any[]) => {
        const targetInstance = await getInstance();
        const targetProp = (targetInstance as any)[prop];
        if (typeof targetProp === "function") {
          return targetProp.apply(targetInstance, args);
        }
        return targetProp;
      };
    },
  });
}

/**
 * LocalCMS SDK
 * Orchestrator for all modular CMS namespaces.
 */
export class LocalCMS {
  private _contentSystem: any;

  public readonly auth: AuthNamespace;
  public readonly tokens: TokensNamespace;
  public readonly collections: CollectionsNamespace;
  public readonly media: MediaNamespace;
  public readonly widgets: WidgetsNamespace;
  public readonly system: SystemNamespace;
  public readonly telemetry: TelemetryNamespace;
  public readonly automation: AutomationNamespace;
  public readonly websiteTokens: WebsiteTokensNamespace;

  /**
   * Access the underlying database adapter directly.
   * Required for backward compatibility with some legacy handlers.
   */
  public get db(): IDBAdapter {
    return this._dbAdapter;
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

    // Initialize Namespaces lazily using Proxies
    this.auth = createLazyNamespace<AuthNamespace>(
      async () => {
        const { AuthNamespace } = await import("./namespaces/auth-namespace");
        return new AuthNamespace(this._dbAdapter);
      },
      { tokens: true },
    );

    this.tokens = createLazyNamespace<TokensNamespace>(async () => {
      const { TokensNamespace } = await import("./namespaces/auth-namespace");
      return new TokensNamespace(this._dbAdapter);
    });

    this.collections = createLazyNamespace<CollectionsNamespace>(async () => {
      const { CollectionsNamespace } = await import("./namespaces/collections-namespace");
      return new CollectionsNamespace(this._dbAdapter, this._contentSystem);
    });

    this.media = createLazyNamespace<MediaNamespace>(async () => {
      const { MediaNamespace } = await import("./namespaces/media-namespace");
      return new MediaNamespace(this._dbAdapter);
    });

    this.widgets = createLazyNamespace<WidgetsNamespace>(async () => {
      const { WidgetsNamespace } = await import("./namespaces/misc-namespaces");
      return new WidgetsNamespace(this._dbAdapter);
    });

    this.system = createLazyNamespace<SystemNamespace>(
      async () => {
        const { SystemNamespace } = await import("./namespaces/misc-namespaces");
        return new SystemNamespace(this._dbAdapter);
      },
      { settings: true, importer: true },
    );

    this.automation = createLazyNamespace<AutomationNamespace>(async () => {
      const { AutomationNamespace } = await import("./namespaces/misc-namespaces");
      return new AutomationNamespace(this._dbAdapter);
    });

    this.telemetry = createLazyNamespace<TelemetryNamespace>(async () => {
      const { TelemetryNamespace } = await import("./namespaces/misc-namespaces");
      return new TelemetryNamespace(this._dbAdapter);
    });

    this.websiteTokens = createLazyNamespace<WebsiteTokensNamespace>(async () => {
      const { WebsiteTokensNamespace } = await import("./namespaces/misc-namespaces");
      return new WebsiteTokensNamespace(this._dbAdapter);
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
