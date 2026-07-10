/**
 * @file src/services/sdk/index.ts
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
import type { VirtualCollectionsNamespace } from "./namespaces/virtual-collections-namespace";
import { traceSpan } from "@utils/context";
import { defineLazyNamespace } from "@src/databases/core/proxy-utils";

/**
 * Methods explicitly excluded from instrumentation (sync getters, non-traceable)
 */
const INSTRUMENT_SKIP: Record<string, Set<string>> = {
  collections: new Set(["db"]),
  auth: new Set(["db"]),
  media: new Set(["db"]),
  system: new Set(["formatBytes"]),
};

/**
 * Auto-detects async methods on a namespace and wraps them with tracing spans.
 * Every async function on the prototype is automatically instrumented
 * unless explicitly excluded via INSTRUMENT_SKIP.
 */
function instrumentNamespace<T extends object>(name: string, instance: T): T {
  const proto = Object.getPrototypeOf(instance);
  if (!proto) return instance;
  const skipSet = INSTRUMENT_SKIP[name];
  const keys = Object.getOwnPropertyNames(proto);
  for (const key of keys) {
    const original = (instance as any)[key];
    if (key === "constructor" || typeof original !== "function" || skipSet?.has(key)) continue;
    if (original.constructor.name !== "AsyncFunction") continue;
    (instance as any)[key] = async function (this: any, ...args: any[]) {
      return await traceSpan(`sdk:${name}:${key}`, async () => original.apply(this, args));
    };
  }
  return instance;
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
  public readonly virtualCollections!: VirtualCollectionsNamespace;

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
    // tokens are part of auth — delegate to auth.tokens
    defineLazyNamespace(this, "tokens", async () => {
      await this.auth;
      return (this.auth as any).tokens;
    });

    defineLazyNamespace(this, "collections", async () => {
      const { CollectionsNamespace } = await import("./namespaces/collections-namespace");
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
      return instrumentNamespace("widgets", new WidgetsNamespace(this._dbAdapter));
    });

    defineLazyNamespace(
      this,
      "system",
      async () => {
        const { SystemNamespace } = await import("./namespaces/misc-namespaces");
        return instrumentNamespace("system", new SystemNamespace(this._dbAdapter));
      },
      { settings: true, importer: true, websiteTokens: true },
    );

    defineLazyNamespace(this, "automation", async () => {
      const { AutomationNamespace } = await import("./namespaces/misc-namespaces");
      return instrumentNamespace("automation", new AutomationNamespace(this._dbAdapter));
    });

    defineLazyNamespace(this, "telemetry", async () => {
      const { TelemetryNamespace } = await import("./namespaces/misc-namespaces");
      return instrumentNamespace("telemetry", new TelemetryNamespace(this._dbAdapter));
    });

    defineLazyNamespace(this, "websiteTokens", async () => {
      const { WebsiteTokensNamespace } = await import("./namespaces/misc-namespaces");
      return instrumentNamespace("websiteTokens", new WebsiteTokensNamespace(this._dbAdapter));
    });

    defineLazyNamespace(this, "virtualCollections", async () => {
      const { VirtualCollectionsNamespace } =
        await import("./namespaces/virtual-collections-namespace");
      return instrumentNamespace(
        "virtualCollections",
        new VirtualCollectionsNamespace(this._dbAdapter),
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
      tokens: cms.tokens,
      automation: cms.automation,
      telemetry: cms.telemetry,
      websiteTokens: cms.websiteTokens,
      widgets: cms.widgets,
      virtualCollections: cms.virtualCollections,
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
