/**
 * @file src/plugins/plugin-route-registry.ts
 * @description Runtime table for `definePlugin` `{ type: "route" }` parts.
 *
 * This is not a fifth extension type. Plugins already declare HTTP routes;
 * the catch-all dispatcher looks them up when the namespace is not a core
 * handler. Commerce still uses a dedicated gated handler because guest CSRF
 * and tenant rules are domain-specific.
 *
 * ### Features:
 * - exact path + method match
 * - public vs capability-gated entries
 * - plugin id for enablement checks
 */

import type { PluginRoute } from "./define-plugin";

export interface RegisteredPluginRoute extends PluginRoute {
  pluginId: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
}

function key(method: string, path: string): string {
  const normalized = path.replace(/\/+$/, "") || "/";
  return `${method.toUpperCase()} ${normalized}`;
}

class PluginRouteRegistry {
  private readonly routes = new Map<string, RegisteredPluginRoute>();

  register(pluginId: string, route: PluginRoute): void {
    const method = route.method || "GET";
    this.routes.set(key(method, route.path), { ...route, pluginId, method });
  }

  match(method: string, pathname: string): RegisteredPluginRoute | undefined {
    return this.routes.get(key(method, pathname));
  }

  clear(): void {
    this.routes.clear();
  }

  size(): number {
    return this.routes.size;
  }
}

export const pluginRouteRegistry = new PluginRouteRegistry();
