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
  PluginStorageNamespace,
} from "./namespaces/misc-namespaces";
import type {
  ConfigurationNamespace,
  ContentTransferNamespace,
  MigrationNamespace,
  ImportersNamespace,
  BackupNamespace,
  ContentSyncNamespace,
  ContentStructureNamespace,
} from "./namespaces/data-operations";
import type { VirtualCollectionsNamespace } from "./namespaces/virtual-collections-namespace";
import type { WorkflowNamespace } from "./namespaces/workflow-namespace";
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
    // Keep the original Promise — an extra `async` wrapper is a microtask per SDK call.
    // Use the `arguments` object instead of a rest parameter: the rest-array
    // allocation (`...args`) on every SDK call is garbage on the write hot path.
    // The arrow captures `this` lexically, so no this-alias is needed.
    (instance as any)[key] = function (this: unknown) {
      const args = arguments;
      return traceSpan(`sdk:${name}:${key}`, () => original.apply(this, args));
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
  public readonly config!: ConfigurationNamespace;
  public readonly contentTransfer!: ContentTransferNamespace;
  public readonly migrations!: MigrationNamespace;
  public readonly importers!: ImportersNamespace;
  public readonly backups!: BackupNamespace;
  public readonly contentSync!: ContentSyncNamespace;
  public readonly contentStructure!: ContentStructureNamespace;
  public readonly pluginStorage!: PluginStorageNamespace;
  public readonly workflow!: WorkflowNamespace;

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
   *
   * The second argument is EITHER a legacy content-system instance OR an
   * options bag (`{ tenantId, user, contentSystem? }`). Distinguish by shape:
   * an options bag exposes `contentSystem` as a property, or carries SDK
   * option keys (tenantId) and no content-system methods. Passing a bare
   * options bag as the legacy form made every namespace resolve against a
   * broken "content system" ({ tenantId }) — getSchema threw "Collection not
   * found" for ALL collections on that path.
   */
  constructor(
    private _dbAdapter: IDBAdapter,
    contentSystemOrOptions?: any,
  ) {
    const candidate = contentSystemOrOptions;
    const isLegacyContentSystem =
      candidate !== null &&
      typeof candidate === "object" &&
      typeof (candidate as { getCollection?: unknown }).getCollection === "function";
    const hasContentSystemKey =
      candidate !== null &&
      typeof candidate === "object" &&
      (candidate as { contentSystem?: unknown }).contentSystem !== undefined;

    this._contentSystem = hasContentSystemKey
      ? candidate.contentSystem
      : isLegacyContentSystem
        ? candidate
        : undefined;

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

    // ── Data Operation Namespaces ──────────────────────────────────────────
    defineLazyNamespace(this, "config", async () => {
      const { ConfigurationNamespace } = await import("./namespaces/data-operations");
      return instrumentNamespace("config", new ConfigurationNamespace(this._dbAdapter));
    });

    defineLazyNamespace(this, "contentTransfer", async () => {
      const { ContentTransferNamespace } = await import("./namespaces/data-operations");
      return instrumentNamespace("contentTransfer", new ContentTransferNamespace(this._dbAdapter));
    });

    defineLazyNamespace(this, "migrations", async () => {
      const { MigrationNamespace } = await import("./namespaces/data-operations");
      return instrumentNamespace("migrations", new MigrationNamespace(this._dbAdapter));
    });

    defineLazyNamespace(this, "importers", async () => {
      const { ImportersNamespace } = await import("./namespaces/data-operations");
      return instrumentNamespace("importers", new ImportersNamespace(this._dbAdapter));
    });

    defineLazyNamespace(this, "backups", async () => {
      const { BackupNamespace } = await import("./namespaces/data-operations");
      return instrumentNamespace("backups", new BackupNamespace(this._dbAdapter));
    });

    defineLazyNamespace(this, "contentSync", async () => {
      const { ContentSyncNamespace } = await import("./namespaces/data-operations");
      return instrumentNamespace("contentSync", new ContentSyncNamespace(this._dbAdapter));
    });

    defineLazyNamespace(this, "contentStructure", async () => {
      const { ContentStructureNamespace } = await import("./namespaces/data-operations");
      return instrumentNamespace(
        "contentStructure",
        new ContentStructureNamespace(this._dbAdapter),
      );
    });

    defineLazyNamespace(this, "pluginStorage", async () => {
      const { PluginStorageNamespace } = await import("./namespaces/misc-namespaces");
      return instrumentNamespace("pluginStorage", new PluginStorageNamespace(this._dbAdapter));
    });

    defineLazyNamespace(this, "workflow", async () => {
      const { WorkflowNamespace } = await import("./namespaces/workflow-namespace");
      return instrumentNamespace("workflow", new WorkflowNamespace(this._dbAdapter));
    });
  }

  /**
   * Static factory to provide an ergonomic locals bridge.
   * Preserves backward compatibility for existing controllers.
   *
   * The namespace props are installed as shared enumerable getters (see
   * `LOCALS_NAMESPACE_KEYS` below): a handler that uses one namespace never
   * reads — and therefore never instantiates or awaits — the other sixteen.
   * Method signatures, resolved value shapes, and `Object.keys` order are
   * unchanged from the previous eager facade.
   */
  static getLocals(adapter: IDBAdapter, eventLocals: any, contentSystem?: any): LocalsFacade {
    const cms = new LocalCMS(adapter, contentSystem);
    const facade = {
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
    } as LocalsFacade;
    localsCmsBinding.set(facade, cms);
    for (const key of LOCALS_NAMESPACE_KEYS) {
      Object.defineProperty(facade, key, localsNamespaceDescriptors[key]);
    }
    return facade;
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

/**
 * Namespace props of the `getLocals()` facade, in the exact `Object.keys`
 * order of the previous eager facade (auth, collections, media, system, tokens
 * first — the legacy controller order, not the constructor order).
 */
export const LOCALS_NAMESPACE_KEYS = [
  "auth",
  "collections",
  "media",
  "system",
  "tokens",
  "automation",
  "telemetry",
  "websiteTokens",
  "widgets",
  "virtualCollections",
  "pluginStorage",
  "config",
  "contentTransfer",
  "migrations",
  "importers",
  "backups",
  "contentSync",
] as const;

export type LocalsNamespaceKey = (typeof LOCALS_NAMESPACE_KEYS)[number];

/** Namespace props of the facade — the same async-resolved shapes as `LocalCMS`. */
type LocalsNamespaceProps = Pick<LocalCMS, LocalsNamespaceKey>;

/** Observable shape of `LocalCMS.getLocals()`: five CRUD closures + lazy namespaces. */
export interface LocalsFacade extends LocalsNamespaceProps {
  find(id: string, options?: any): ReturnType<CollectionsNamespace["find"]>;
  findById(
    id: string,
    entryId: string,
    options?: any,
  ): ReturnType<CollectionsNamespace["findById"]>;
  create(id: string, data: any, options?: any): ReturnType<CollectionsNamespace["create"]>;
  update(
    id: string,
    entryId: string,
    data: any,
    options?: any,
  ): ReturnType<CollectionsNamespace["update"]>;
  delete(id: string, entryId: string, options?: any): ReturnType<CollectionsNamespace["delete"]>;
}

/** Per-facade LocalCMS binding; the shared getters resolve it via `this`. */
const localsCmsBinding = new WeakMap<object, LocalCMS>();

/**
 * One getter closure + one descriptor per namespace, created once at module
 * scope and reused by every facade. `getLocals()` therefore allocates only the
 * facade object and the five CRUD closures per request; the previous eager
 * literal also materialized seventeen forwarding proxies it rarely used. The
 * getters stay plain pass-throughs: `defineLazyNamespace` already caches the
 * proxy and hot-swaps it for the resolved instance after the first method
 * call, so reads after resolution are plain property reads on the `LocalCMS`.
 */
const localsNamespaceDescriptors = {} as Record<LocalsNamespaceKey, PropertyDescriptor>;
for (const key of LOCALS_NAMESPACE_KEYS) {
  localsNamespaceDescriptors[key] = {
    enumerable: true,
    configurable: true,
    get(this: object): LocalCMS[LocalsNamespaceKey] | undefined {
      const cms = localsCmsBinding.get(this);
      return cms ? cms[key] : undefined;
    },
  };
}
