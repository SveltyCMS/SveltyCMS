/**
 * @file src/routes/(app)/dashboard/+page.server.ts
 * @description Server-side logic for the dashboard page.
 *
 * Features:
 * - User authentication and authorization
 * - Widget picker metadata from widget.json (no Svelte module eval)
 * - Marketplace-portable widget packages (widgets/<folder>/index.svelte + widget.json)
 * - Saved layout hydrated via LocalCMS/db so the client skips /api/system-preferences
 * - Server-side UUID v4 generation for new widgets
 */

import { error, json } from "@sveltejs/kit";
import { isAdmin } from "@src/databases/auth/constants";
import type { DashboardWidgetConfig } from "@src/content/types";
import type { DatabaseId } from "@src/databases/db-interface";
import { logger } from "@utils/logger";
import { getAuthenticatedUser } from "@utils/page-guards.server";
import { generateUUID as uuidv4 } from "@utils/native-utils";
import { getHotCollections } from "@src/services/intelligence/behavioral-learner";
import { rethrow } from "@utils/error-handling";
import type { Actions, PageServerLoad } from "./$types";
import { getInstalledDashboardWidgets } from "./widgets/manifest-registry";
import {
  filterPickerByPlugins,
  manifestsToPickerList,
  normalizeDashboardLayout,
  sortWidgetsByHotCollections,
} from "./widget-runtime";

const LAYOUT_KEY = "dashboard.layout.default";

async function loadUserDashboardLayout(
  userId: string,
  tenantId: DatabaseId | null | undefined,
): Promise<DashboardWidgetConfig[] | null> {
  try {
    const { getDb } = await import("@src/databases/db");
    const db = getDb();
    if (!db?.system?.preferences) return null;
    const result = await db.system.preferences.get(LAYOUT_KEY, {
      scope: "user",
      userId: userId as DatabaseId,
      tenantId,
    });
    if (!result.success) return null;
    if (result.data == null) return [];
    return normalizeDashboardLayout(result.data);
  } catch (err) {
    rethrow(err);
    logger.debug("Dashboard layout not available from DB; client will fetch", err);
    return null;
  }
}

export const load: PageServerLoad = async ({ locals, parent }) => {
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
  const userId = _id.toString();
  const tenant = locals.tenantId || "global";
  const hotCollections = getHotCollections(tenant, 20);
  const hotIds = new Set(hotCollections.map((c) => c.id));

  let pluginStates: Record<string, boolean> = {};
  try {
    const parentData = await parent?.();
    pluginStates = (parentData?.pluginStates ?? {}) as Record<string, boolean>;
  } catch (err) {
    rethrow(err);
    logger.debug(
      "Dashboard parent pluginStates unavailable; plugin-gated widgets stay hidden",
      err,
    );
  }

  const picker = filterPickerByPlugins(
    sortWidgetsByHotCollections(manifestsToPickerList(getInstalledDashboardWidgets()), hotIds),
    pluginStates,
  );
  logger.trace(`Discovered ${picker.length} optional dashboard widgets (widget.json)`);

  const initialPreferences = await loadUserDashboardLayout(userId, locals.tenantId);

  return {
    pageData: {
      user: { id: userId, ...rest },
      isAdmin: isAdminUser,
    },
    availableWidgets: picker,
    initialPreferences,
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
