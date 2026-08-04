/**
 * @file src/routes/(app)/plugin/[...path]/+page.server.ts
 * @description Server load for plugin-contributed admin pages.
 *
 * Resolves the page by path from the plugin page registry, enforces
 * `requiredCapabilities` (403 fail-closed), and runs the page's optional
 * `load` hook (server-only — never exposes secrets to the client).
 */

import { error } from "@sveltejs/kit";
import { pluginPageRegistry } from "@src/plugins/plugin-page-registry.svelte.ts";
import { getAuthenticatedUser } from "@utils/page-guards.server";
import { logger } from "@utils/logger";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, params, url }) => {
  const user = getAuthenticatedUser(locals);

  const page = pluginPageRegistry.getByPath(params.path ?? "");
  if (!page) {
    logger.warn(`[PluginPage] No plugin page registered for path: ${params.path}`);
    throw error(404, "Plugin page not found");
  }

  // RBAC gate — admins bypass via fast-path; otherwise roles must carry every
  // required capability. Mirrors the dashboard permission pattern.
  const isAdmin =
    locals.isAdmin === true ||
    (user as any)?.isAdmin === true ||
    (locals.isAdmin == null && (user.role === "admin" || user.role === "super-admin"));
  const tenantRoles = locals.roles ?? [];

  const hasCapabilities =
    page.requiredCapabilities.length === 0 ||
    isAdmin ||
    tenantRoles.some((role) =>
      role.permissions?.some((p) => page.requiredCapabilities.includes(p)),
    );

  if (!hasCapabilities) {
    logger.warn(
      `[PluginPage] User ${user._id} denied access to plugin page "${page.id}" (${page.path})`,
    );
    throw error(403, "Insufficient permissions to view this plugin page");
  }

  let props: Record<string, unknown> = {};
  if (page.load) {
    props = await page.load({
      tenantId: (locals.tenantId as string) || "default",
      user,
      params,
      url,
    });
  }

  return {
    pageId: page.id,
    title: page.title ?? page.nav?.label ?? "Plugin",
    props,
  };
};
