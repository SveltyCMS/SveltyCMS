/**
 * @file src/routes/api/systemPreferences/+server.ts
 * @description Consolidated server-side API endpoint for managing system and user preferences.
 *
 * ### Usage
 * - GET /api/systemPreferences?key=... - Loads a specific preference value for the authenticated user.
 * - GET /api/systemPreferences?keys[]=...&keys[]=... - Loads multiple preference values for the user.
 * - POST /api/systemPreferences with `{ key, value }` - Saves a single preference for the user.
 * - POST /api/systemPreferences with `[{ key, value }, ...]` - Saves multiple preferences in a single request.
 * - DELETE /api/systemPreferences?key=... - Deletes a specific preference for the user.
 *
 * ### Features
 * - Unified endpoint for all user-scoped preferences (e.g., dashboard layouts, widget states).
 * - User authentication and role-based authorization.
 * - Robust validation using Valibot.
 * - Bulk operations for getting and setting multiple preferences.
 * - Consistent error handling and logging.
 */

import { dbAdapter } from "@src/databases/db";
import { getPrivateSettingSync } from "@src/services/settings-service";
import { json } from "@sveltejs/kit";
import { logger } from "@utils/logger.server";
import * as v from "valibot";

// Validation Schemas
const PREFERENCE_SCHEMA = v.object({
  key: v.pipe(v.string(), v.minLength(1, "Preference key cannot be empty.")),
  value: v.any(),
});

const SET_SINGLE_PREFERENCE_SCHEMA = PREFERENCE_SCHEMA;
const SET_MULTIPLE_PREFERENCES_SCHEMA = v.array(PREFERENCE_SCHEMA);

// GET Handler for retrieving one or more preferences
// Unified Error Handling
import { apiHandler } from "@utils/api-handler";
import { AppError } from "@utils/error-handling";

export const GET = apiHandler(async ({ locals, url }) => {
  const { user, tenantId } = locals;
  if (!user) {
    logger.warn("Unauthorized attempt to load system preferences");
    throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
  }

  if (getPrivateSettingSync("MULTI_TENANT") && !tenantId) {
    throw new AppError("Tenant ID required", 400, "TENANT_REQUIRED");
  }

  // SECURITY: Prefs are scoped to BOTH user AND tenant in multi-tenant mode
  // We use a compound identifier for userId to ensure isolation
  const effectiveUserId = tenantId ? `${tenantId}:${user._id}` : user._id;

  const singleKey = url.searchParams.get("key");
  const multipleKeys = url.searchParams.getAll("keys[]");

  try {
    // Handle request for multiple keys
    if (multipleKeys.length > 0) {
      if (!dbAdapter) {
        throw new AppError("Database adapter not available", 500, "DB_UNAVAILABLE");
      }
      const result = await dbAdapter.system.preferences.getMany(
        multipleKeys,
        "user",
        effectiveUserId as any,
      );
      if (!result.success) {
        throw new Error(result.message);
      }
      return json(result.data);
    }

    // Handle request for a single key
    if (singleKey) {
      if (!dbAdapter) {
        throw new AppError("Database adapter not available", 500, "DB_UNAVAILABLE");
      }
      const result = await dbAdapter.system.preferences.get(
        singleKey,
        "user",
        effectiveUserId as any,
      );
      if (!result.success) {
        // Return a default value for layout preferences to prevent UI breakage
        if (singleKey.startsWith("dashboard.layout.")) {
          return json({ id: singleKey, name: "Default", preferences: [] });
        }
        throw new AppError("Preference not found", 404, "NOT_FOUND");
      }
      return json(result.data);
    }

    throw new AppError(
      "Invalid request. Provide 'key' or 'keys[]' query parameter.",
      400,
      "INVALID_REQUEST",
    );
  } catch (e) {
    if (e instanceof AppError) {
      throw e;
    }
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    logger.error(
      `Failed to load preferences for user ${user._id} (tenant: ${tenantId}): ${errorMessage}`,
      e,
    );
    throw new AppError("Failed to load preferences", 500, "FETCH_FAILED");
  }
});

export const POST = apiHandler(async ({ request, locals }) => {
  const { user, tenantId } = locals;
  if (!user) {
    logger.warn("Unauthorized attempt to save system preferences");
    throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
  }

  if (getPrivateSettingSync("MULTI_TENANT") && !tenantId) {
    throw new AppError("Tenant ID required", 400, "TENANT_REQUIRED");
  }

  const data = await request.json();
  const effectiveUserId = tenantId ? `${tenantId}:${user._id}` : user._id;

  try {
    // Try parsing as a single preference
    const singleResult = v.safeParse(SET_SINGLE_PREFERENCE_SCHEMA, data);
    if (singleResult.success) {
      if (!dbAdapter) {
        throw new AppError("Database adapter not available", 500, "DB_UNAVAILABLE");
      }
      const { key, value } = singleResult.output;
      const result = await dbAdapter.system.preferences.set(
        key,
        value,
        "user",
        effectiveUserId as any,
      );
      if (!result.success) {
        throw new Error(result.message);
      }
      return json({ success: true, message: `Preference '${key}' saved.` }, { status: 200 });
    }

    // Try parsing as multiple preferences
    const multipleResult = v.safeParse(SET_MULTIPLE_PREFERENCES_SCHEMA, data);
    if (multipleResult.success) {
      if (!dbAdapter) {
        throw new AppError("Database adapter not available", 500, "DB_UNAVAILABLE");
      }
      const preferencesToSet = multipleResult.output.map((p) => ({
        ...p,
        scope: "user" as const,
        userId: effectiveUserId as any,
      }));
      const result = await dbAdapter.system.preferences.setMany(preferencesToSet);
      if (!result.success) {
        throw new Error(result.message);
      }
      return json(
        {
          success: true,
          message: `${preferencesToSet.length} preferences saved.`,
        },
        { status: 200 },
      );
    }

    // If neither schema matches
    const issues = singleResult.issues || multipleResult.issues;
    logger.warn("Invalid preference data", { issues });
    throw new AppError("Invalid request data.", 400, "INVALID_DATA");
  } catch (e) {
    if (e instanceof AppError) {
      throw e;
    }
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    logger.error(
      `Failed to save preferences for user ${user._id} (tenant: ${tenantId}): ${errorMessage}`,
      e,
    );
    throw new AppError("Failed to save preferences", 500, "SAVE_FAILED");
  }
});

export const DELETE = apiHandler(async ({ locals, url }) => {
  const { user, tenantId } = locals;
  if (!user) {
    logger.warn("Unauthorized attempt to delete a system preference");
    throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
  }

  if (getPrivateSettingSync("MULTI_TENANT") && !tenantId) {
    throw new AppError("Tenant ID required", 400, "TENANT_REQUIRED");
  }

  const key = url.searchParams.get("key");
  if (!key) {
    throw new AppError("Missing 'key' query parameter.", 400, "MISSING_KEY");
  }

  const effectiveUserId = tenantId ? `${tenantId}:${user._id}` : user._id;

  try {
    if (!dbAdapter) {
      throw new AppError("Database adapter not available", 500, "DB_UNAVAILABLE");
    }
    const result = await dbAdapter.system.preferences.delete(key, "user", effectiveUserId as any);
    if (!result.success) {
      logger.warn(
        `Attempted to delete non-existent preference key '${key}' for user ${user._id} (tenant: ${tenantId})`,
      );
    }
    return json({ success: true, message: `Preference '${key}' deleted.` }, { status: 200 });
  } catch (e) {
    if (e instanceof AppError) {
      throw e;
    }
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    logger.error(
      `Failed to delete preference '${key}' for user ${user._id} (tenant: ${tenantId}): ${errorMessage}`,
      e,
    );
    throw new AppError("Failed to delete preference", 500, "DELETE_FAILED");
  }
});
