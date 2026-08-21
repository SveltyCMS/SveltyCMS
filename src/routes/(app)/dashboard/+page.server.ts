/**
 * @file src/routes/(app)/dashboard/+page.server.ts
 * @description Server-side logic for the dashboard page.
 *
 * Features:
 * - User authentication and authorization
 * - Compile-time widget discovery via import.meta.glob (zero runtime FS scan)
 * - Marketplace-portable widget packages (widgets/<folder>/<component>.svelte + widget.json)
 * - Server-side UUID v4 generation for new widgets
 */

import { error, json } from "@sveltejs/kit";
import { isAdmin } from "@src/databases/auth/constants";
import { logger } from "@utils/logger";
import { getAuthenticatedUser } from "@utils/page-guards.server";
import { generateUUID as uuidv4 } from "@utils/native-utils";
import { getHotCollections } from "@src/services/intelligence/behavioral-learner";
import type { Actions, PageServerLoad } from "./$types";

interface WidgetInfo {
  componentName: string;
  description?: string;
  folder: string;
  icon: string;
  name: string;
}

// Compile-time widget discovery — Vite resolves this at build time.
// Each widget lives in its own package folder: widgets/<folder>/<component>.svelte.
// Zero runtime FS scan, zero dynamic imports, zero blocking I/O.
const _widgetModules = import.meta.glob<{
  widgetMeta?: { name: string; icon: string; description?: string };
}>("./widgets/*/*.svelte", { eager: true });

// Pre-compute widget list once at module load
const _widgets: WidgetInfo[] = Object.entries(_widgetModules)
  .map(([path, mod]) => {
    // path like "./widgets/system-health/system-health-widget.svelte"
    const segments = path.split("/");
    const folder = segments[segments.length - 2] ?? "";
    const componentName = segments[segments.length - 1]!.replace(".svelte", "");
    if (mod.widgetMeta) {
      return {
        componentName,
        folder,
        name: mod.widgetMeta.name,
        icon: mod.widgetMeta.icon,
        description: mod.widgetMeta.description,
      };
    }
    // Fallback: derive name from filename
    const name = componentName
      .replace(/-widget$/, "")
      .split("-")
      .filter(Boolean)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ");
    return {
      componentName,
      folder,
      name,
      icon: "mdi:widgets",
      description: "Dashboard widget",
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

logger.trace(`Discovered ${_widgets.length} dashboard widgets (compile-time)`);

export const load: PageServerLoad = async ({ locals }) => {
  const user = getAuthenticatedUser(locals);
  // Prefer hook flag; only treat role as admin when locals.isAdmin is undefined
  const isAdminUser = locals.isAdmin === true || isAdmin(user);
  const tenantRoles = locals.roles ?? [];

  // Check if user has permission to access dashboard.
  // Guard tenantRoles: locals.roles can be undefined (e.g. roles not yet loaded), and calling
  // .some() on undefined would 500 the whole dashboard instead of doing a clean permission check.
  const hasDashboardPermission =
    isAdminUser ||
    tenantRoles.some((role) =>
      role.permissions?.some((p) => {
        const [resource, action] = p.split(":");
        return resource === "dashboard" && action === "read";
      }),
    );

  if (!hasDashboardPermission) {
    logger.warn(
      `User ${user._id} (${user.email}) does not have permission to access dashboard. Redirecting.`,
    );
    throw error(403, "Insufficient permissions to access dashboard");
  }

  logger.trace(`User authenticated successfully for dashboard: ${user._id}`);

  const { _id, ...rest } = user;

  // Behavioral learning: sort available widgets by usage frequency.
  // Collections that are frequently accessed get boosted to the top.
  const tenant = locals.tenantId || "global";
  const hotCollections = getHotCollections(tenant, 20);

  let sortedWidgets = _widgets;
  if (hotCollections.length > 0) {
    const hotIds = new Set(hotCollections.map((c) => c.id));
    sortedWidgets = [..._widgets].sort((a, b) => {
      const aHot = hotIds.has(a.folder) || hotIds.has(a.componentName);
      const bHot = hotIds.has(b.folder) || hotIds.has(b.componentName);
      if (aHot && !bHot) return -1;
      if (!aHot && bHot) return 1;
      return 0;
    });
  }

  return {
    pageData: {
      user: { id: _id.toString(), ...rest },
      isAdmin: isAdminUser,
    },
    availableWidgets: sortedWidgets,
    hotCollections,
  };
};

export const actions: Actions = {
  default: async ({ request, locals }) => {
    const user = getAuthenticatedUser(locals);

    const data = await request.json();
    const { userId, component, label, icon, size } = data;

    if (userId !== user._id.toString()) {
      logger.warn(`User ID mismatch: ${userId} vs ${user._id}`);
      throw error(403, "Forbidden");
    }

    if (
      !(component && label && icon && size) ||
      typeof size.w !== "number" ||
      typeof size.h !== "number"
    ) {
      logger.error("Invalid widget data:", data);
      throw error(400, "Invalid widget data");
    }

    const widget = {
      id: uuidv4(),
      component,
      label,
      icon,
      size,
      gridPosition: 0,
      movable: true,
      resizable: true,
    };

    logger.trace(`Created widget ${widget.id} for user ${userId}`);
    return json(widget);
  },
};
