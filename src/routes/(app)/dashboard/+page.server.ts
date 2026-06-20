/**
 * @file src/routes/(app)/dashboard/+page.server.ts
 * @description Server-side logic for the dashboard page.
 *
 * Features:
 * - User authentication and authorization
 * - Compile-time widget discovery via import.meta.glob (zero runtime FS scan)
 * - Server-side UUID v4 generation for new widgets
 */

import { error, json, redirect } from "@sveltejs/kit";
import { logger } from "@utils/logger";
import { generateUUID as uuidv4 } from "@utils/native-utils";
import { getHotCollections } from "@src/services/intelligence/behavioral-learner";
import type { Actions, PageServerLoad } from "./$types";

interface WidgetInfo {
  componentName: string;
  description?: string;
  icon: string;
  name: string;
}

// Compile-time widget discovery — Vite resolves this at build time.
// Zero runtime FS scan, zero dynamic imports, zero blocking I/O.
const _widgetModules = import.meta.glob<{
  widgetMeta?: { name: string; icon: string; description?: string };
}>("./widgets/*.svelte", { eager: true });

// Pre-compute widget list once at module load
const _widgets: WidgetInfo[] = Object.entries(_widgetModules)
  .map(([path, mod]) => {
    const componentName = path.split("/").pop()!.replace(".svelte", "");
    if (mod.widgetMeta) {
      return {
        componentName,
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
      name,
      icon: "mdi:widgets",
      description: "Dashboard widget",
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

logger.trace(`Discovered ${_widgets.length} dashboard widgets (compile-time)`);

export const load: PageServerLoad = async ({ locals }) => {
  const { user, isAdmin, roles: tenantRoles } = locals;
  if (!user) {
    logger.warn("User not authenticated, redirecting to login.");
    throw redirect(301, "/login");
  }

  // Check if user has permission to access dashboard.
  // Guard tenantRoles: locals.roles can be undefined (e.g. roles not yet loaded), and calling
  // .some() on undefined would 500 the whole dashboard instead of doing a clean permission check.
  const hasDashboardPermission =
    isAdmin ||
    (tenantRoles ?? []).some((role) =>
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
  const hotIds = new Set(hotCollections.map((c) => c.id));

  // Sort: widgets matching hot collections first, then by original order
  const sortedWidgets = [..._widgets].sort((a, b) => {
    const aHot = hotIds.has(a.componentName);
    const bHot = hotIds.has(b.componentName);
    if (aHot && !bHot) return -1;
    if (!aHot && bHot) return 1;
    return 0;
  });

  return {
    pageData: {
      user: { id: _id.toString(), ...rest },
      isAdmin,
    },
    availableWidgets: sortedWidgets,
    hotCollections,
  };
};

export const actions: Actions = {
  default: async ({ request, locals }) => {
    const user = locals.user;
    if (!user) {
      logger.warn("Unauthorized attempt to add widget");
      throw error(401, "Unauthorized");
    }

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
