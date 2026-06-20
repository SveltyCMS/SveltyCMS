/**
 * @file src/databases/core/proxy-utils.ts
 * @description
 * Shared Proxy factories used across the database layer and LocalCMS SDK.
 * Extracted to eliminate duplication and enable dedicated proxy-behavior testing.
 *
 * ### Features:
 * - Self-healing root adapter proxy (survives Vite HMR, auto-recovers on connection loss)
 * - Tenant-injecting namespace proxy (auto-injects tenantId into options)
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
  const boundFunctionsCache = new WeakMap<any, Map<string | symbol, Function>>();

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
          const fn = target[prop];
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

/**
 * Wraps a namespace object in a Proxy that auto-injects `tenantId` into the
 * last argument of every function call (assuming it's an options object).
 * If the last arg is not a plain object, appends `{ tenantId }` as a new arg.
 *
 * @param namespace    The raw namespace object (e.g., adapter.crud)
 * @param injectTenant Function that merges tenantId into existing options
 */
export function createTenantInjectingProxy(
  namespace: any,
  injectTenant: (options?: Record<string, any>) => Record<string, any>,
): any {
  return new Proxy(namespace, {
    get(target, prop) {
      const original = target[prop];
      if (typeof original !== "function") return original;
      return (...args: any[]) => {
        const lastArg = args[args.length - 1];
        if (lastArg && typeof lastArg === "object" && !Array.isArray(lastArg)) {
          args[args.length - 1] = injectTenant(lastArg);
        } else {
          args.push(injectTenant({}));
        }
        return original.apply(target, args);
      };
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
        get: (_target, prop: string) => {
          if (nestedNamespaces[prop]) {
            return new Proxy(
              {},
              {
                get:
                  (_nestedTarget, nestedProp: string) =>
                  async (...args: any[]) => {
                    const targetInstance = await getInstance();
                    const nested = (targetInstance as any)[prop];
                    if (!nested || typeof nested[nestedProp] !== "function") {
                      throw new Error(
                        `Method '${String(nestedProp)}' not found on '${property}.${String(prop)}'`,
                      );
                    }
                    return nested[nestedProp].apply(nested, args);
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
