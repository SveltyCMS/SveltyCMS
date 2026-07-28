/**
 * @file src/databases/core/proxy-utils.ts
 * @description
 * Shared Proxy factories used across the database layer and LocalCMS SDK.
 * Extracted to eliminate duplication and enable dedicated proxy-behavior testing.
 *
 * ### Features:
 * - Self-healing root adapter proxy (survives Vite HMR, auto-recovers on connection loss)
 * - Tenant-injecting namespace proxy (deep: media.files, system.jobs, content.nodes, …)
 * - Hot-swap lazy namespace definer (Object.defineProperty swap for zero Proxy tax)
 */

// ============================================================================
// 1. SELF-HEALING ROOT PROXY
// ============================================================================

/**
 * Creates a Proxy that dynamically resolves the underlying instance via `getInstance()`.
 * If the instance is missing or disconnected, it calls `reinitialize()` and retries.
 * Recursively creates sub-proxies for namespace keys (e.g., "crud", "auth").
 * Binds and caches functions to avoid repeated `.bind()` calls.
 *
 * @param getInstance  Synchronous accessor for the current adapter instance
 * @param reinitialize Async function to reinitialize the system (shutdown + reboot)
 * @param namespaceKeys Keys that trigger recursive sub-proxy creation
 * @param sharedCache   Optional shared proxy cache (Map) for namespace sub-proxies
 */
export function createSelfHealingProxy<T extends object>(
  getInstance: () => T | null,
  reinitialize: () => Promise<void>,
  namespaceKeys: string[] = ["crud", "auth", "raw", "media", "collection", "system"],
  sharedCache?: Map<string, any>,
): T {
  const proxyCache = sharedCache ?? new Map<string, any>();
  const boundFunctionsCache = new WeakMap<object, Map<string | symbol, Function>>();

  const createProxy = (targetProp?: string): any => {
    const cacheKey = targetProp || "root";
    if (proxyCache.has(cacheKey)) return proxyCache.get(cacheKey);

    const proxy = new Proxy({} as any, {
      get(_, prop) {
        if (prop === "then") return undefined;
        if (prop === "toJSON") return () => `[Proxy:${targetProp || "adapter"}]`;

        const instance = getInstance();

        // Recurse into namespace sub-proxies
        if (typeof prop === "string" && namespaceKeys.includes(prop)) {
          return createProxy(prop);
        }

        if (instance) {
          const target = targetProp ? (instance as any)[targetProp] : instance;
          if (!target) return undefined;
          const val = target[prop];

          if (typeof val === "function") {
            let targetCache = boundFunctionsCache.get(target);
            if (!targetCache) {
              targetCache = new Map();
              boundFunctionsCache.set(target, targetCache);
            }
            const cachedFn = targetCache.get(prop);
            if (cachedFn) return cachedFn;

            const boundFn = val.bind(target);
            targetCache.set(prop, boundFn);
            return boundFn;
          }
          return val;
        }

        // ASYNC RECOVERY — auto-heal on HMR reload or connection loss
        return async (...args: any[]) => {
          let inst = getInstance();
          if (!inst || !(inst as any).isConnected || !(inst as any).isConnected()) {
            try {
              await reinitialize();
              inst = getInstance();
            } catch {
              // Re-initialization failed, report original error below
            }
          }
          if (!inst) {
            if (prop === "isConnected" || prop === "connected") return false;
            throw new Error(
              `CRITICAL: Database access attempt on '${String(targetProp || "adapter")}.${String(prop)}' before initialization.`,
            );
          }
          const target = targetProp ? (inst as any)[targetProp] : inst;
          const fn = target?.[prop];
          if (typeof fn !== "function") {
            throw new Error(
              `Property '${String(prop)}' is not a function on ${String(targetProp || "adapter")}`,
            );
          }
          return fn.apply(target, args);
        };
      },
    });

    proxyCache.set(cacheKey, proxy);
    return proxy;
  };

  return createProxy() as T;
}

// ============================================================================
// 2. TENANT-INJECTING NAMESPACE PROXY
// ============================================================================

/** Marker so we never double-wrap an already tenant-injected proxy. */
const TENANT_PROXY = Symbol.for("svelty.tenantProxy");

/**
 * Deep-wrap a namespace so every method gets tenantId in the last options bag.
 * Nested objects (media.files, system.websiteTokens, content.nodes, …) recurse.
 *
 * - Last arg plain object (not Array/Date) → merge injectTenant(last)
 * - Else → append injectTenant({})
 * - Skips re-wrapping (TENANT_PROXY marker)
 * - injectTenant itself decides bypass (systemScope / bypassTenantCheck) vs stamp tenantId
 *
 * Used by {@link forTenant} in tenant-adapter.ts for request-scoped MT binding.
 */
export function createTenantInjectingProxy(
  namespace: any,
  injectTenant: (options?: Record<string, any>) => Record<string, any>,
): any {
  if (!namespace || typeof namespace !== "object") return namespace;
  // Already a tenant proxy — do not nest injectors
  if ((namespace as any)[TENANT_PROXY]) return namespace;

  const nestedCache = new Map<string | symbol, any>();

  return new Proxy(namespace, {
    get(target, prop, receiver) {
      if (prop === TENANT_PROXY) return true;

      const original = Reflect.get(target, prop, receiver);

      if (typeof original === "function") {
        return (...args: any[]) => {
          const lastArg = args[args.length - 1];
          if (
            lastArg &&
            typeof lastArg === "object" &&
            !Array.isArray(lastArg) &&
            !(lastArg instanceof Date)
          ) {
            // Options-last (or filter/data object): merge tenant into last bag
            args[args.length - 1] = injectTenant(lastArg);
          } else {
            // No options bag — append default { tenantId } (or empty inject result)
            args.push(injectTenant({}));
          }
          return original.apply(target, args);
        };
      }

      // Nested namespace (e.g. media.files, system.jobs) — recurse + cache
      if (
        original &&
        typeof original === "object" &&
        !Array.isArray(original) &&
        !(original instanceof Date) &&
        !(original instanceof Promise)
      ) {
        if (nestedCache.has(prop)) return nestedCache.get(prop);
        const nested = createTenantInjectingProxy(original, injectTenant);
        nestedCache.set(prop, nested);
        return nested;
      }

      return original;
    },
  });
}

// ============================================================================
// 3. HOT-SWAP LAZY NAMESPACE DEFINER
// ============================================================================

/**
 * Defines a lazily-initialized namespace on `target` using Object.defineProperty.
 * On first access, the factory is invoked; once resolved, the getter is replaced
 * with the resolved value, eliminating Proxy/Getter overhead for all subsequent reads.
 *
 * Supports nested namespaces (e.g., `cms.collections.find()`) via a temporary
 * Proxy that forwards method calls to the resolved instance.
 *
 * @param target            The object to define the property on
 * @param property          The property key
 * @param factory           Async function that returns the namespace instance
 * @param nestedNamespaces  Map of nested property names that should also forward to the instance
 */
export function defineLazyNamespace<T extends object>(
  target: any,
  property: string,
  factory: () => Promise<T>,
  nestedNamespaces: Record<string, boolean> = {},
): void {
  let instance: T | null = null;
  let initPromise: Promise<T> | null = null;

  const getInstance = async (): Promise<T> => {
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
        get: (_target, prop: string | symbol) => {
          const propKey = String(prop);

          if (nestedNamespaces[propKey]) {
            return new Proxy(
              {},
              {
                get:
                  (_nestedTarget, nestedProp: string | symbol) =>
                  async (...args: any[]) => {
                    const targetInstance = await getInstance();
                    const nested = (targetInstance as any)[propKey];
                    if (!nested || typeof nested[nestedProp as string] !== "function") {
                      throw new Error(
                        `Method '${String(nestedProp)}' not found on '${property}.${propKey}'`,
                      );
                    }
                    return nested[nestedProp as string].apply(nested, args);
                  },
              },
            );
          }

          return async (...args: any[]) => {
            const targetInstance = await getInstance();

            // HOT-SWAP: Replace the getter on the main target with the resolved instance.
            // Future accesses to target[property] bypass the Proxy entirely.
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
