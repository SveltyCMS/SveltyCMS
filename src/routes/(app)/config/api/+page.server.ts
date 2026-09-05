/**
 * @file src/routes/(app)/config/api/+page.server.ts
 * @description Server-side load for the interactive Developer & API Playground.
 *
 * Features:
 * - Developer & Admin RBAC gating
 * - Serves endpoint configurations for REST (OpenAPI 3.1) and GraphQL
 * - Pre-loads collection catalog for live query and code generation
 */

import { isAppError, raise, rethrow } from "@utils/error-handling";
import { logger } from "@utils/logger";
import { getAuthenticatedUser } from "@utils/page-guards.server";
import { contentSystem } from "@src/content/index.server";
import { isAdmin as isAdminUser } from "@src/databases/auth/constants";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  try {
    const user = getAuthenticatedUser(locals);
    const isAdmin = isAdminUser(user);
    const isDeveloper = user.role === "developer" || isAdmin;

    if (!isDeveloper) {
      logger.warn(`User ${user._id} denied access to API Playground (developer or admin required)`);
      raise(403, "Developer or admin privileges required");
    }

    let collectionsList: { id: string; name: string; icon?: string }[] = [];
    try {
      const rawCollections = await contentSystem.getCollections(locals.tenantId);
      collectionsList = rawCollections.map((c) => ({
        id: String(c._id ?? c.name ?? ""),
        name: String(c.name ?? c.label ?? c._id ?? ""),
        icon: c.icon || "mdi:folder",
      }));
    } catch (err) {
      logger.debug("[API Playground] Could not load collections catalog", err);
    }

    return {
      isAdmin,
      tenantId: locals.tenantId || null,
      openapiSpecUrl: "/api/openapi.json",
      graphqlEndpoint: "/api/graphql",
      collections: collectionsList,
    };
  } catch (err) {
    rethrow(err);
    if (isAppError(err)) throw err;
    logger.error("[API Playground Server Load] Unexpected error:", err);
    raise(500, "Failed to load API playground context");
  }
};
