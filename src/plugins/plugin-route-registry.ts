/**
 * @file src/plugins/plugin-route-registry.ts
 * @description Runtime table for `definePlugin` `{ type: "route" }` parts.
 *
 * This is not a fifth extension type. Plugins declare HTTP routes;
 * the catch-all dispatcher looks them up when the namespace is not a core
 * handler. Commerce still uses a dedicated gated handler because guest CSRF
 * and tenant rules are domain-specific.
 *
 * ### Features:
 * - exact path + method match with O(1) fast path
 * - literal segment-based parameter matching (:param segments) with zero-regex / zero-ReDoS
 * - public vs capability-gated entries
 * - plugin id for enablement checks
 */

import type { PluginRoute } from "./define-plugin";

export interface MatchedPluginRoute extends PluginRoute {
  pluginId: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  params?: Record<string, string>;
}

export interface RegisteredPluginRoute extends PluginRoute {
  pluginId: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  segments?: string[];
}

function normalizePath(path: string): string {
  return path.replace(/\/+$/, "") || "/";
}

function key(method: string, path: string): string {
  return `${method.toUpperCase()} ${normalizePath(path)}`;
}

class PluginRouteRegistry {
  private readonly exactRoutes = new Map<string, RegisteredPluginRoute>();
  private readonly parameterizedRoutes: RegisteredPluginRoute[] = [];

  register(pluginId: string, route: PluginRoute): void {
    const method = (route.method || "GET") as RegisteredPluginRoute["method"];
    const normalized = normalizePath(route.path);

    if (normalized.includes(":")) {
      const segments = normalized.split("/").filter(Boolean);
      this.parameterizedRoutes.push({ ...route, pluginId, method, segments });
    } else {
      this.exactRoutes.set(key(method, normalized), { ...route, pluginId, method });
    }
  }

  match(method: string, pathname: string): MatchedPluginRoute | undefined {
    const normalized = normalizePath(pathname);
    const upperMethod = method.toUpperCase();

    // ⚡ Fast path: O(1) exact match
    const exact = this.exactRoutes.get(`${upperMethod} ${normalized}`);
    if (exact) return { ...exact, params: {} };

    if (this.parameterizedRoutes.length === 0) return undefined;

    const pathSegments = normalized.split("/").filter(Boolean);

    // Literal segment matching (zero RegExp, zero ReDoS risk)
    for (const route of this.parameterizedRoutes) {
      if (route.method !== upperMethod) continue;
      const routeSegments = route.segments;
      if (!routeSegments || routeSegments.length !== pathSegments.length) continue;

      let matched = true;
      const params: Record<string, string> = {};

      for (let i = 0; i < routeSegments.length; i++) {
        const rSeg = routeSegments[i];
        const pSeg = pathSegments[i];
        if (rSeg.startsWith(":")) {
          params[rSeg.slice(1)] = pSeg;
        } else if (rSeg !== pSeg) {
          matched = false;
          break;
        }
      }

      if (matched) {
        return { ...route, params };
      }
    }

    return undefined;
  }

  clear(): void {
    this.exactRoutes.clear();
    this.parameterizedRoutes.length = 0;
  }

  size(): number {
    return this.exactRoutes.size + this.parameterizedRoutes.length;
  }
}

export const pluginRouteRegistry = new PluginRouteRegistry();
