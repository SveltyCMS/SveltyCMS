/**
 * @file src/routes/(app)/config/system-settings/+page.server.ts
 * @description Server-side logic for System Settings page authentication and authorization.
 *
 * Handles user authentication and role-based access control for the System Settings page.
 * Redirects unauthenticated users to the login page and restricts access based on user permissions.
 *
 * Responsibilities:
 * - Checks for authenticated user in locals (set by hooks.server.ts).
 * - Checks user permissions for system settings access.
 * - Loads the active group values (URL `?group=`) and derives which groups need configuration.
 * - Handles cases of unauthenticated users or insufficient permissions.
 */

import { hasPermissionWithRoles } from "@src/databases/auth/permissions";
import { isAdmin } from "@src/databases/auth/constants";
import { dbAdapter } from "@src/databases/db";
import type { DatabaseId } from "@src/databases/db-interface";
import { error, isHttpError } from "@sveltejs/kit";
// System Logs
import { logger } from "@utils/logger";
import { getAuthenticatedUser } from "@utils/page-guards.server";
import { rethrow } from "@utils/error-handling";
import { getSettingGroupsByRole } from "./settings-groups";
import { hasEmptyConfigFields } from "./settings-utils";
import type { PageServerLoad } from "./$types";

// Side-effect import: registers remote command with SvelteKit metadata for client build
import "./admin.remote";

export const load: PageServerLoad = async ({ locals, url }) => {
  try {
    const user = getAuthenticatedUser(locals);
    const isAdminUser = locals.isAdmin === true || isAdmin(user);
    const tenantRoles = locals.roles ?? [];

    // Log successful session validation
    logger.trace(`User authenticated successfully for user: ${user._id}`);

    const hasSystemSettingsPermission =
      isAdminUser || hasPermissionWithRoles(user, "config:settings", tenantRoles);

    if (!hasSystemSettingsPermission) {
      const message = `User ${user._id} does not have permission to access system settings`;
      logger.warn(message, {
        userRole: user.role,
        isAdmin: isAdminUser,
      });
      throw error(403, "Insufficient permissions");
    }

    const tenantId = (locals.tenantId ?? undefined) as DatabaseId | undefined;
    const groups = getSettingGroupsByRole(isAdminUser).sort((a, b) => a.name.localeCompare(b.name));
    const valuesByGroup: Record<string, Record<string, unknown>> = {};

    if (dbAdapter.system?.preferences) {
      const results = await Promise.all(
        groups.map(async (group) => {
          const pref = await dbAdapter.system.preferences
            .get(group.id, {
              scope: "system",
              tenantId,
            })
            .catch(() => null);
          const values =
            pref?.success && pref.data && typeof pref.data === "object"
              ? { ...(pref.data as Record<string, unknown>) }
              : {};
          // Mirror the form's historical default: an unset system timezone seeds
          // with the host timezone instead of rendering an empty required select.
          if (group.id === "site" && (!values.TIMEZONE || values.TIMEZONE === "")) {
            try {
              values.TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Berlin";
            } catch {
              values.TIMEZONE = "Europe/Berlin";
            }
          }
          return [group.id, values] as const;
        }),
      );
      for (const [groupId, values] of results) {
        valuesByGroup[groupId] = values;
      }
    }

    const requestedGroupId = url.searchParams.get("group");
    const effectiveGroupId = requestedGroupId ?? groups[0]?.id ?? null;
    const hasGroup = effectiveGroupId
      ? groups.some((group) => group.id === effectiveGroupId)
      : false;

    const groupsNeedingConfig = groups
      .filter((group) => hasEmptyConfigFields(group.fields, valuesByGroup[group.id] ?? {}))
      .map((group) => group.id);

    // Return user data with isAdmin flag for settings filtering
    const { _id, ...rest } = user;
    return {
      user: {
        _id: _id.toString(),
        ...rest,
      },
      isAdmin: isAdminUser,
      activeGroupValues:
        hasGroup && effectiveGroupId ? (valuesByGroup[effectiveGroupId] ?? {}) : null,
      groupsNeedingConfig,
    };
  } catch (err) {
    rethrow(err);
    if (isHttpError(err)) {
      throw err;
    }
    const message = `Error in load function: ${err instanceof Error ? err.message : String(err)}`;
    logger.error(message);
    throw error(500, message);
  }
};
