/**
 * @file src/routes/+page.server.ts
 * @description
 * Server-side logic for the root route, handling redirection to the first collection.
 * This version is updated to use the moderncontent-managerfor cleaner logic.
 */

import { contentSystem } from "@src/content/index.server";
import type { Role, User } from "@src/databases/auth/types";
import { dbInitPromise } from "@src/databases/db";
import { getPrivateSettingSync } from "@src/services/core/settings-service";
import { publicEnv } from "@src/stores/global-settings.svelte";
import { error, redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

// Roles

// System Logger
import { logger } from "@utils/logger";

export const load: PageServerLoad = async ({ locals, url }) => {
  const { user, tenantId, roles } = locals as {
    user: User | null;
    tenantId: string | undefined;
    roles: Role[] | undefined;
  };
  const tenantRoles = roles || [];
  if (!user) {
    logger.debug("User is not authenticated, redirecting to login");
    throw redirect(302, "/login");
  }

  try {
    // Wait for the database and content-manager to be ready
    await dbInitPromise;

    // 🚀 NEW: Specifically wait for background tasks (Content, Themes, Cache)
    // before making redirect decisions based on content availability.
    const { runBackgroundTasks } = await import("@src/databases/db-init");
    const { getDb } = await import("@src/databases/db");
    const adapter = getDb();
    if (adapter) {
      await runBackgroundTasks(adapter);
    }

    // Verify content-manager is ready (should be from hooks)
    const healthStatus = contentSystem.getHealthStatus();
    if (healthStatus.state !== "initialized") {
      logger.warn("ContentSystem not initialized in page load - still waiting...", {
        state: healthStatus.state,
      });
      // Small safety delay or retry logic could go here if needed,
      // but runBackgroundTasks should have finished.
    }
    logger.debug("System is ready, proceeding with page load.", { tenantId });

    // For any route other than the root, just return user data
    if (url.pathname !== "/") {
      const userRole = tenantRoles.find((role) => role._id === user?.role);
      const isAdmin = Boolean(userRole?.isAdmin);

      return {
        user: { ...user, isAdmin },
        permissions: locals.permissions,
      };
    }

    // --- Start of Redirect Logic for the Root Route ('/') ---
    // GLOBAL ADMIN EXEMPTION: Allow null tenantId for global administrators
    const isGlobalAdmin = user.tenantId === null || user.tenantId === undefined;
    if (getPrivateSettingSync("MULTI_TENANT") && !tenantId && !isGlobalAdmin) {
      throw error(400, "Tenant could not be identified for this operation.");
    }

    // Determine the correct language for the redirect URL
    const redirectLanguage =
      url.searchParams.get("contentLanguage") ||
      user.locale ||
      publicEnv.DEFAULT_CONTENT_LANGUAGE ||
      "en";

    // Use the new, efficient method from content-system to get the redirect URL
    const redirectUrl = await contentSystem.getFirstCollectionRedirectUrl(
      redirectLanguage,
      tenantId,
    );

    // If a valid collection URL is found, redirect the user
    if (redirectUrl) {
      logger.info(`Redirecting to first collection: ${redirectUrl}`, {
        tenantId,
      });
      throw redirect(302, redirectUrl);
    }

    // If no collections are found, redirect based on permissions.
    logger.warn("No collections found for user. Redirecting to fallback.", {
      tenantId,
    });
    const userRole = tenantRoles.find((role) => role._id === user?.role);
    const isAdmin = Boolean(userRole?.isAdmin);

    if (isAdmin) {
      throw redirect(302, "/config/collectionbuilder");
    } else {
      // Fallback for non-admins when no collections exist
      throw redirect(302, "/user/profile");
    }
  } catch (err) {
    // Re-throw SvelteKit's internal redirect and error exceptions
    const { isRedirect, isHttpError } = await import("@sveltejs/kit");
    if (isRedirect(err) || isHttpError(err)) {
      throw err;
    }

    logger.error("Unexpected error in root page load function", {
      error: err,
      tenantId,
    });
    const message = err instanceof Error ? err.message : "An unexpected error occurred";
    throw error(500, message);
  }
};
