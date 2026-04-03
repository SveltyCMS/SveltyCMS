/**
 * @file src/routes/api/[...path]/+server.ts
 * @description
 * Unified HTTP API Gatekeeper for SveltyCMS.
 * Dispatches all external API requests to the LocalCMS logic core.
 */

import { json } from "@sveltejs/kit";
import { dev } from "$app/environment";
import { validateCsrfForRequest } from "@utils/security/csrf-utils";
import type { RequestEvent } from "@sveltejs/kit";
import { apiHandler } from "@utils/api-handler";
import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger.server";
import { dbAdapter, getDbInitPromise, getAuth } from "@src/databases/db";
import { LocalCMS } from "../cms";
import { SESSION_COOKIE_NAME } from "@src/databases/auth/constants";
import { getPrivateSettingSync } from "@src/services/settings-service";
import { settingsGroups } from "../../(app)/config/system-settings/settings-groups";
import crypto from "node:crypto";
import type { DatabaseId } from "@src/content/types";
import { hasPermissionWithRoles } from "@src/databases/auth/permissions";

/**
 * Granular mapping of API endpoints to required permissions.
 * Format: "METHOD /api/path/subpath" -> "required:permission"
 */
/**
 * Granular mapping of API endpoints to required permissions.
 * Format: "METHOD /api/path/subpath" -> "required:permission"
 */
const ENDPOINT_PERMISSIONS: Record<string, string> = {
  // --- User & Role Management ---
  "GET /user": "user:read",
  "POST /user/create-user": "user:create",
  "POST /user/batch": "user:delete",
  "PUT /user/update-user-attributes": "user:update",
  "PATCH /user/update-user-attributes": "user:update",
  "POST /auth/update-roles": "user:manage",

  // --- Collections ---
  "GET /collections": "collections:read",
  "POST /collections": "collections:create",
  "PUT /collections": "collections:update",
  "PATCH /collections": "collections:update",
  "DELETE /collections": "collections:delete",
  "GET /collections/search": "search:read",
  "GET /collections/revisions": "collections:read",

  // --- Media ---
  "GET /media": "media:read",
  "POST /media/upload": "media:write",
  "POST /media/process": "media:write",
  "PATCH /media": "media:write",
  "DELETE /media": "media:delete",

  // --- Widgets ---
  "GET /widgets/list": "api:widgets",
  "GET /widgets/active": "api:widgets",
  "POST /widgets/activate": "config:widgetManagement",
  "POST /widgets/deactivate": "config:widgetManagement",
  "POST /widgets/install": "config:widgetManagement",
  "POST /widgets/uninstall": "config:widgetManagement",

  // --- System & Settings ---
  "GET /settings/all": "system:settings",
  "GET /search": "search:read",

  // --- Tokens ---
  "GET /token": "api:user",
  "POST /token/create-token": "user:manage",
  "PATCH /token": "user:manage",
  "DELETE /token": "user:manage",
  "POST /token/batch": "user:manage",
  "POST /token/resolve": "api:user",
  "GET /auth/2fa/backup-codes": "user:read",
  "POST /auth/2fa/backup-codes": "user:update",
  "POST /auth/2fa/setup": "user:update",
  "POST /auth/2fa/verify-setup": "user:update",
  "POST /auth/2fa/disable": "user:update",

  // --- SAML 2.0 ---
  "GET /auth/saml/config": "system:settings",
  "POST /auth/saml/config": "system:settings",

  // --- SCIM 2.0 ---
  "GET /scim/v2/Users": "user:manage",
  "POST /scim/v2/Users": "user:manage",
  "GET /scim/v2/Users/[id]": "user:manage",
  "PUT /scim/v2/Users/[id]": "user:manage",
  "PATCH /scim/v2/Users/[id]": "user:manage",
  "DELETE /scim/v2/Users/[id]": "user:manage",
  "GET /scim/v2/Groups": "user:manage",
  "POST /scim/v2/Groups": "user:manage",
  "GET /scim/v2/Groups/[id]": "user:manage",
  "PUT /scim/v2/Groups/[id]": "user:manage",
  "PATCH /scim/v2/Groups/[id]": "user:manage",
  "DELETE /scim/v2/Groups/[id]": "user:manage",
};

/**
 * Validates if the current user has the required permission for an endpoint.
 * Implements a FAIL-CLOSED strategy (default-deny).
 */
function checkEndpointPermission(
  user: any,
  roles: any[],
  httpMethod: string,
  namespace: string,
  subPath: string,
  entryId: string,
  fullSegments: string[],
): boolean {
  // --- EXEMPTIONS: Publicly accessible endpoints (even if unauthenticated) ---
  if (namespace === "auth" && subPath === "login") return true;
  if (namespace === "auth" && subPath === "2fa" && fullSegments[2] === "verify") return true;
  if (namespace === "auth" && subPath === "saml" && fullSegments[2] === "acs") return true;
  if (namespace === "auth" && subPath === "saml" && fullSegments[2] === "config") return true;
  if (namespace === "auth" && subPath === "saml" && fullSegments[2] === "login") return true;
  if (namespace === "system" && subPath === "health") return true;

  // Global Admins bypass all checks
  if (user?.isAdmin) return true;

  // --- IMPLICIT: Self-service routes (authenticated users only) ---
  if (user) {
    if (namespace === "auth" && (subPath === "logout" || subPath === "me" || subPath === "2fa"))
      return true;
    if (namespace === "user" && (subPath === "save-avatar" || subPath === "delete-avatar"))
      return true;
    if (namespace === "get-tokens-provided") return true;
  }

  const baseKey = `/${namespace}${subPath ? `/${subPath}` : ""}`;
  const keyWithEntry = `${httpMethod} ${baseKey}${entryId ? `/${entryId}` : ""}`;
  const fallbackKey = `${httpMethod} ${baseKey}`;
  const namespaceKey = `${httpMethod} /${namespace}`;

  const requiredPermission =
    ENDPOINT_PERMISSIONS[keyWithEntry] ||
    ENDPOINT_PERMISSIONS[fallbackKey] ||
    ENDPOINT_PERMISSIONS[namespaceKey];

  // FAIL-CLOSED: If no explicit permission is mapped, assume forbidden
  if (!requiredPermission) {
    logger.warn(
      `Unmapped API endpoint access attempt: ${keyWithEntry} (namespace fallback: ${namespaceKey})`,
    );
    return false;
  }

  // Authenticated check: Required for any remaining non-exempt/non-implicit routes
  if (!user || !roles) {
    throw new AppError("Authentication required", 401, "UNAUTHORIZED");
  }

  return hasPermissionWithRoles(user, requiredPermission, roles);
}

/**
 * Main Dispatcher handles all HTTP methods (GET, POST, PATCH, DELETE)
 */
const dispatch = async ({ request, url, params, locals, cookies }: RequestEvent) => {
  const { path } = params;
  const { user, tenantId } = locals;

  // --- CSRF Protection (Critical for state-changing endpoints) ---
  const isSecure = url.protocol === "https:" || (!dev && url.hostname !== "localhost");
  const csrfCriticalEndpoints = ["POST", "PUT", "PATCH", "DELETE"];

  if (
    process.env.TEST_MODE !== "true" &&
    csrfCriticalEndpoints.includes(request.method) &&
    !path.includes("/auth/login") &&
    !path.includes("/auth/saml/acs")
  ) {
    const csrfValidation = validateCsrfForRequest(cookies, request, isSecure);
    if (!csrfValidation.isValid) {
      logger.warn(`CSRF validation failed for ${request.method} ${path}: ${csrfValidation.error}`);
      throw new AppError(`Security violation: ${csrfValidation.error}`, 403, "CSRF_VIOLATION");
    }
  }

  // Dispatch logic based on path segments
  const segments = path.split("/");
  const namespace = segments[0];
  const method = segments[1] || "";
  const _entryId = segments[2] || "";

  const MULTI_TENANT = getPrivateSettingSync("MULTI_TENANT");
  const isExemptFromTenant =
    namespace === "auth" ||
    namespace === "setup" ||
    namespace === "system" ||
    namespace === "health";

  if (MULTI_TENANT && !tenantId && !isExemptFromTenant) {
    throw new AppError("Tenant ID required", 400, "TENANT_MISSING");
  }

  // SPECIAL CASE: Health check must work even without a DB to allow orchestrators to wait for boot
  if (namespace === "system" && method === "health") {
    const health = {
      status: dbAdapter ? "healthy" : "initializing",
      overallStatus: dbAdapter ? "READY" : "SETUP", // Match setup-system.ts expectations
      database: !!dbAdapter,
      uptime: process.uptime(),
      timestamp: Date.now(),
    };
    // Always return 200 during health check to let benchmark runner proceed
    return json(health, { status: 200 });
  }

  // Ensure DB is initialized for all other routes
  await getDbInitPromise();

  // Re-import or access the latest dbAdapter from the module to ensure it's not the stale initial null
  const { dbAdapter: latestAdapter } = await import("@src/databases/db");
  const adapter = (locals as any).dbAdapter || latestAdapter;

  if (!adapter) {
    logger.error("Database adapter still null after initialization promise resolved");
    throw new AppError("Database adapter not initialized. System may require setup.", 503);
  }

  const cms = new LocalCMS(adapter);

  // --- API AUTHORIZATION CHECK ---
  // Ensure the user has granular permission for the requested endpoint
  const isAuthorized = checkEndpointPermission(
    user,
    (locals as any).roles || [],
    request.method,
    namespace,
    method,
    _entryId,
    segments,
  );

  if (!isAuthorized) {
    logger.warn(`Forbidden API access attempt: ${request.method} ${path} by user ${user?._id}`);
    throw new AppError("Forbidden: Insufficient permissions", 403, "FORBIDDEN");
  }

  try {
    // --- ROOT-LEVEL ENDPOINTS (Directly under /api/) ---
    if (!method) {
      if (namespace === "search" && request.method === "GET") {
        const query = url.searchParams.get("q") || "";
        const collectionsParam = url.searchParams.get("collections");
        const collections = collectionsParam
          ? collectionsParam.split(",").map((c: string) => c.trim())
          : undefined;
        const result = await cms.collections.search(query, {
          collections,
          tenantId: tenantId as any,
          user,
          isAdmin: (locals as any).isAdmin,
        });
        if (url.searchParams.get("raw") === "true") {
          return json(result);
        }
        return json({ success: true, data: result });
      }

      if (namespace === "get-tokens-provided" && request.method === "GET") {
        const tokensProvided = {
          google: Boolean(getPrivateSettingSync("GOOGLE_API_KEY", tenantId!)),
          twitch: Boolean(getPrivateSettingSync("TWITCH_TOKEN", tenantId!)),
          tiktok: Boolean(getPrivateSettingSync("TIKTOK_TOKEN", tenantId!)),
        };
        return json(tokensProvided);
      }
    }

    // --- WAVE 1: AUTH, USER, 2FA, SAML ---
    if (namespace === "auth" || namespace === "user") {
      // Root namespace request (e.g. GET /api/user)
      if (!method) {
        if (namespace === "user" && request.method === "GET") {
          const data = await cms.auth.listUsers({ tenantId: tenantId as any });
          if (url.searchParams.get("raw") === "true") {
            return json(data);
          }
          // Flatten pagination for AdminArea.svelte
          return json({ success: true, ...data });
        }
      }

      // 2FA Routes
      if (method === "2fa") {
        const action = segments[2];
        const { getDefaultTwoFactorAuthService } =
          await import("@src/databases/auth/two-factor-auth");
        const twoFactorService = getDefaultTwoFactorAuthService(adapter.auth);

        if (action === "setup" && request.method === "POST") {
          if (!user) throw new AppError("Authentication required", 401);
          const result = await twoFactorService.initiate2FASetup(
            user._id as DatabaseId,
            user.email,
            tenantId as DatabaseId,
          );
          // Tests expect result.success to be true at root of response
          return json(result);
        }

        if (action === "verify-setup" && request.method === "POST") {
          if (!user) throw new AppError("Authentication required", 401);
          const { code, secret, backupCodes } = await request.json();
          const result = await twoFactorService.complete2FASetup(
            user._id as DatabaseId,
            secret,
            code,
            backupCodes,
            tenantId as DatabaseId,
          );
          return json({ success: result });
        }

        if (action === "verify" && request.method === "POST") {
          const { userId, code } = await request.json();
          if (getPrivateSettingSync("MULTI_TENANT") && !tenantId) {
            throw new AppError("Tenant context is required", 400);
          }
          const result = await twoFactorService.verify2FA(
            userId as DatabaseId,
            code,
            (tenantId || undefined) as DatabaseId | undefined,
          );
          return json(result);
        }

        if (action === "disable" && request.method === "POST") {
          if (!user) throw new AppError("Authentication required", 401);
          const result = await twoFactorService.disable2FA(
            user._id as DatabaseId,
            tenantId as DatabaseId,
          );
          return json({ success: result });
        }

        if (action === "backup-codes") {
          if (!user) throw new AppError("Authentication required", 401);
          if (request.method === "GET") {
            const result = await twoFactorService.get2FAStatus(
              user._id as DatabaseId,
              tenantId as DatabaseId,
            );
            return json({ success: true, data: result });
          }
          if (request.method === "POST") {
            const result = await twoFactorService.regenerateBackupCodes(
              user._id as DatabaseId,
              tenantId as DatabaseId,
            );
            return json({ success: true, backupCodes: result });
          }
        }
      }

      // SAML Routes
      if (method === "saml") {
        const action = segments[2];
        const samlModule = await import("@src/databases/auth/saml-auth");

        if (action === "config") {
          if (request.method === "GET") {
            const config = await samlModule.getJackson();
            return json({ success: true, data: config });
          }
          if (request.method === "POST") {
            const body = await request.json();
            const result = await samlModule.createSAMLConnection(body);
            return json({ success: true, data: result });
          }
        }
        if (action === "login" && request.method === "POST") {
          await request.json().catch(() => ({})); // Consume body safely
          const url = await samlModule.generateSAMLAuthUrl(tenantId || "default", "sveltycms");
          return json({ success: true, url });
        }
        if (action === "acs" && request.method === "POST") {
          const { handleSAMLResponse } = await import("@src/databases/auth/saml-auth");
          return handleSAMLResponse({ request, url, params, locals, cookies } as any);
        }
      }

      // User routes (batch, update, avatar)
      if (namespace === "user") {
        if (!method && request.method === "GET") {
          const search = url.searchParams.get("search") || undefined;
          const page = Number(url.searchParams.get("page")) || 1;
          const limit = Number(url.searchParams.get("limit")) || 10;
          const sort = url.searchParams.get("sort") || undefined;
          const order = (url.searchParams.get("order") as "asc" | "desc") || "desc";

          const result = await cms.auth.listUsers({
            tenantId: tenantId as DatabaseId,
            search,
            page,
            limit,
            sort,
            order,
          });

          if (url.searchParams.get("raw") === "true") {
            return json(result.data);
          }
          return json({ success: true, ...result });
        }
        if (method === "create-user" && request.method === "POST") {
          const body = await request.json();
          const newUser = await adapter.auth.createUser({
            ...body,
            tenantId: tenantId as DatabaseId,
          });
          return json({ ...newUser }, { status: 201 });
        }
        if (method === "batch" && request.method === "POST") {
          const { userIds, action: batchAction } = await request.json();
          const result = await cms.auth.batchAction(userIds, batchAction, tenantId as DatabaseId);
          return json(result);
        }
        if (
          method === "update-user-attributes" &&
          (request.method === "PUT" || request.method === "PATCH")
        ) {
          const { user_id, newUserData } = await request.json();
          const result = await cms.auth.updateUserAttributes(
            user_id as DatabaseId,
            newUserData,
            tenantId as DatabaseId,
          );
          return json(result);
        }
        if (method === "save-avatar" && request.method === "POST") {
          const formData = await request.formData();
          const avatarFile = formData.get("avatar") as File;
          const { saveAvatarImage } = await import("@utils/media/media-storage.server");
          const avatarUrl = await saveAvatarImage(avatarFile, user?._id || "guest");
          const result = await cms.auth.saveAvatar(
            user?._id as DatabaseId,
            avatarUrl,
            tenantId as DatabaseId,
          );
          return json(result);
        }
        if (method === "delete-avatar" && request.method === "DELETE") {
          const { userId } = await request.json().catch(() => ({}));
          const result = await cms.auth.deleteAvatar(
            (userId || user?._id) as DatabaseId,
            tenantId as DatabaseId,
          );
          return json(result);
        }
        if (method && !segments[2] && request.method === "GET") {
          const result = await cms.auth.getUserById(method as DatabaseId, tenantId as DatabaseId);
          return json({ success: true, data: result });
        }
      }

      // Standard Auth Routes
      if (method === "login" && request.method === "POST") {
        const credentials = await request.json();
        const { user: authedUser, session } = await cms.auth.login(credentials, {
          tenantId: tenantId as DatabaseId,
        });

        const authInstance = getAuth();
        if (!authInstance) throw new AppError("Auth system not initialized", 500);
        const sessionCookie = authInstance.createSessionCookie(session._id);
        cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes as any);

        return json({ success: true, data: { user: authedUser } });
      }

      if (method === "logout" && request.method === "POST") {
        const sessionCookie = cookies.get(SESSION_COOKIE_NAME);
        if (sessionCookie) {
          const authInstance = getAuth();
          if (authInstance) {
            await authInstance.logOut(sessionCookie as DatabaseId);
          }
          cookies.delete(SESSION_COOKIE_NAME, { path: "/" });
        }
        return json({ success: true, message: "Logged out successfully" });
      }

      if (method === "me" && request.method === "GET") {
        return json({ success: true, data: user });
      }

      if (method === "update-roles" && request.method === "POST") {
        const { roles } = await request.json();
        const result = await cms.auth.updateRoles(roles, {
          user,
          tenantId: tenantId as DatabaseId,
        });
        return json(result);
      }

      if (namespace === "user" && !method && request.method === "GET") {
        const data = await cms.auth.listUsers({ tenantId: tenantId as DatabaseId });
        if (url.searchParams.get("raw") === "true") {
          return json(data);
        }
        return json({ success: true, data });
      }
    }

    if (namespace === "collections") {
      // /api/collections/search
      if (method === "search" && request.method === "GET") {
        const query = url.searchParams.get("q") || "";
        const collectionsParam = url.searchParams.get("collections");
        const collections = collectionsParam
          ? collectionsParam.split(",").map((c: string) => c.trim())
          : undefined;
        const page = Number(url.searchParams.get("page") ?? 1);
        const limit = Number(url.searchParams.get("limit") ?? 25);
        const sortField = url.searchParams.get("sortField") || "updatedAt";
        const sortDirection = (url.searchParams.get("sortDirection") as "asc" | "desc") || "desc";
        const status = url.searchParams.get("status") || undefined;
        const filterParam = url.searchParams.get("filter");
        let filter = {};
        if (filterParam) {
          try {
            filter = JSON.parse(filterParam);
          } catch {
            /* ignore */
          }
        }

        const result = await cms.collections.search(query, {
          collections,
          tenantId: tenantId as DatabaseId,
          user,
          page,
          limit,
          sortField,
          sortDirection,
          filter,
          status,
          isAdmin: (locals as any).isAdmin,
        });
        return json({ success: true, data: result });
      }

      const collectionId = method;
      const entryId = segments[2];

      // /api/collections/[collectionId]/revisions
      if (request.method === "GET" && collectionId && entryId === "revisions") {
        const result = await cms.collections.getRevisions(
          collectionId,
          entryId,
          tenantId as DatabaseId,
        );
        return json({ success: true, data: result });
      }

      if (request.method === "GET") {
        if (!method || method === "list") {
          const includeFields = url.searchParams.get("includeFields") === "true";
          const includeStats = url.searchParams.get("includeStats") === "true";
          const collections = await cms.collections.list({
            tenantId: tenantId as DatabaseId,
            includeFields,
            includeStats,
          });

          // If explicitly requested via internal list or search, return raw array.
          // Otherwise wrap for standard API consistency expected by unit tests.
          if (url.searchParams.get("raw") === "true") {
            return json(collections);
          }
          return json({ success: true, data: collections });
        }

        if (entryId) {
          const data = await cms.collections.findById(collectionId, entryId, {
            tenantId: tenantId as DatabaseId,
          });
          return json({ success: true, data });
        } else {
          const limit = Number(url.searchParams.get("limit")) || 50;
          const offset = Number(url.searchParams.get("offset")) || 0;
          const data = await cms.collections.find(collectionId, {
            tenantId: tenantId as DatabaseId,
            limit,
            offset,
          });
          return json({ success: true, data });
        }
      }

      if (request.method === "POST") {
        const data = await request.json();
        const result = await cms.collections.create(collectionId, data, {
          user,
          tenantId: tenantId as DatabaseId,
        });
        return json(result);
      }

      if (request.method === "PATCH" && entryId) {
        const data = await request.json();
        const result = await cms.collections.update(collectionId, entryId, data, {
          user,
          tenantId: tenantId as DatabaseId,
        });
        return json(result);
      }

      if (request.method === "DELETE" && entryId) {
        const permanent = url.searchParams.get("permanent") === "true";
        const result = await cms.collections.delete(collectionId, entryId, {
          user,
          tenantId: tenantId as DatabaseId,
          permanent,
        });
        return json(result);
      }
    }

    // --- WAVE 2: MEDIA, WIDGETS, SYSTEM, ETC ---
    if (namespace === "media") {
      const limit = Number(url.searchParams.get("limit")) || 100;
      const folderId = url.searchParams.get("folderId") || undefined;
      const recursive = url.searchParams.get("recursive") === "true";

      if (request.method === "GET") {
        const fileId = method;
        if (!fileId || fileId === "list") {
          const result = await cms.media.find({
            tenantId: tenantId as DatabaseId,
            limit,
            folderId,
            recursive,
          });
          return json(result);
        }
        const data = await cms.media.findById(fileId, { tenantId: tenantId as DatabaseId });
        return json({ success: true, data });
      }

      if (request.method === "POST") {
        // /api/media/upload or /api/media (legacy)
        if (method === "upload" || !method) {
          const formData = await request.formData();
          const files = formData.getAll("files");
          const results = [];
          for (const file of files) {
            if (file instanceof File) {
              const res = await cms.media.upload(file, {
                userId: (user?._id as string) || "",
                tenantId: tenantId as DatabaseId,
              });
              results.push({ fileName: file.name, success: true, data: res });
            }
          }
          return json({ success: true, data: results });
        }

        if (method === "process") {
          const formData = await request.formData();
          const processType = formData.get("processType");

          if (processType === "save") {
            const files = formData.getAll("files");
            const results = [];
            for (const file of files) {
              if (file instanceof File) {
                const res = await cms.media.upload(file, {
                  userId: (user?._id as string) || "",
                  tenantId: tenantId as DatabaseId,
                });
                results.push({ fileName: file.name, success: true, data: res });
              }
            }
            return json({ success: true, data: results });
          }

          if (processType === "delete") {
            const mediaId = formData.get("mediaId") as string;
            await cms.media.delete(mediaId, { tenantId: tenantId as DatabaseId });
            return json({ success: true });
          }

          if (processType === "batch") {
            const mediaIds = JSON.parse(formData.get("mediaIds") as string);
            const options = JSON.parse(formData.get("options") as string);
            const result = await cms.media.batchProcess(
              mediaIds,
              options,
              (user?._id as string) || "",
              tenantId as DatabaseId,
            );
            return json({ success: true, data: result });
          }
        }
      }

      if (request.method === "PATCH" && method) {
        const data = await request.json();
        const result = await cms.media.update(method, data, tenantId as DatabaseId);
        return json(result);
      }

      if (request.method === "DELETE" && method) {
        const result = await cms.media.delete(method, { tenantId: tenantId as DatabaseId });
        return json(result);
      }
    }

    if (namespace === "widgets") {
      if (request.method === "GET") {
        if (method === "active") {
          const widgetList = await cms.widgets.list(tenantId as string);
          const activeWidgets = widgetList.filter((w: any) => w.isActive);
          return json({ success: true, data: activeWidgets });
        }

        if (method === "list") {
          const widgetList = await cms.widgets.list(tenantId as string);
          return json({
            success: true,
            data: {
              widgets: widgetList,
              summary: {
                total: widgetList.length,
                active: widgetList.filter((w: any) => w.isActive).length,
                core: widgetList.filter((w: any) => w.isCore).length,
                custom: widgetList.filter((w: any) => !w.isCore).length,
              },
              tenantId: tenantId || "default-tenant",
            },
            message: "Widget list retrieved successfully",
          });
        }
      }

      if (request.method === "POST" && method === "activate" && segments[2]) {
        const result = await cms.widgets.activate(segments[2]);
        return json(result);
      }

      if (request.method === "POST" && method === "deactivate" && segments[2]) {
        const result = await cms.widgets.deactivate(segments[2]);
        return json(result);
      }

      // /api/widgets/install
      if (request.method === "POST" && method === "install") {
        const { widgetId } = await request.json();
        // Forward to activate for now as a mock or implement real install
        const result = await cms.widgets.activate(widgetId);
        return json({ success: result.success, data: { widgetId } });
      }

      // /api/widgets/uninstall
      if (request.method === "POST" && method === "uninstall") {
        const { widgetName } = await request.json();
        const result = await cms.widgets.deactivate(widgetName);
        return json({ success: result.success, data: { widgetName } });
      }
    }

    if (namespace === "system") {
      if (method === "health") {
        const data = cms.system.getHealth();
        return json({ success: true, data });
      }

      if (method === "reinitialize" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const result = await cms.system.reinitialize(body.force ?? true);
        return json(result);
      }
    }

    if (namespace === "token") {
      if (request.method === "GET") {
        const tokenId = method; // /api/token/[tokenId]
        if (!tokenId || tokenId === "list") {
          const search = url.searchParams.get("search") || undefined;
          const page = Number(url.searchParams.get("page")) || 1;
          const limit = Number(url.searchParams.get("limit")) || 10;
          const sort = url.searchParams.get("sort") || undefined;
          const order = (url.searchParams.get("order") as "asc" | "desc") || "desc";

          const result = await cms.auth.tokens.list({
            tenantId: tenantId as DatabaseId,
            search,
            page,
            limit,
            sort,
            order,
          });

          if (url.searchParams.get("raw") === "true") {
            return json(result.data);
          }
          return json({ success: true, ...result });
        }
        const result = await cms.auth.tokens.findById(tokenId, tenantId as DatabaseId);
        return json(result);
      }

      if (request.method === "PATCH" && method) {
        const data = await request.json();
        const result = await cms.auth.tokens.update(method, data, tenantId as DatabaseId);
        return json(result);
      }

      if (request.method === "POST" && method === "create-token") {
        const data = await request.json();
        // Map frontend expiresIn to backend expires
        if (data.expiresIn && !data.expires) {
          data.expires = data.expiresIn;
        }
        const result = await cms.auth.tokens.create({ ...data, tenantId: tenantId as DatabaseId });
        if (result.success) {
          return json({ success: true, token: result.data });
        }
        return json(result, { status: 400 });
      }

      if (request.method === "POST" && method === "batch") {
        const body = await request.json();
        const result = await cms.auth.tokens.batchAction(
          body.tokenIds,
          body.action,
          tenantId as DatabaseId,
        );
        return json(result);
      }

      if (request.method === "POST" && method === "resolve") {
        const { text } = await request.json();
        const locale = (locals as any).locale || "en";
        const resolved = await cms.auth.tokens.resolve(text, user, tenantId as DatabaseId, locale);
        return json({ resolved });
      }

      if (request.method === "DELETE" && method) {
        const result = await cms.auth.tokens.delete(method, tenantId as DatabaseId);
        return json(result);
      }
    }

    if (namespace === "settings") {
      if (request.method === "GET" && method === "all") {
        const data = await cms.system.settings.getAll(tenantId as string);
        const groups: Record<string, Record<string, any>> = {};

        // Merge public and private settings for flat lookup
        const flatSettings = { ...(data.public as any), ...(data.private as any) };

        for (const group of settingsGroups) {
          groups[group.id] = {};
          for (const field of group.fields) {
            groups[group.id][field.key] = flatSettings[field.key];
          }
        }

        return json({ success: true, groups });
      }

      if (request.method === "GET" && method === "public") {
        const data = await cms.system.settings.getAll(tenantId as string);
        const publicSettings = data.public || {};

        if (_entryId === "stream") {
          // SSE for public settings
          const stream = new ReadableStream({
            start(controller) {
              let isClosed = false;
              controller.enqueue(`data: ${JSON.stringify(publicSettings)}\n\n`);
              // We could add an event listener here if settings-service supported it
              // For now, just send initial and keep alive
              const interval = setInterval(() => {
                if (!isClosed) {
                  try {
                    controller.enqueue(`: keep-alive\n\n`);
                  } catch {
                    isClosed = true;
                    clearInterval(interval);
                  }
                }
              }, 30000);

              request.signal.addEventListener("abort", () => {
                if (!isClosed) {
                  isClosed = true;
                  clearInterval(interval);
                  try {
                    controller.close();
                  } catch {}
                }
              });
            },
            cancel() {
              // This is called when the client closes the connection
            },
          });

          return new Response(stream, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
            },
          });
        }

        return json({ success: true, data: publicSettings });
      }

      if (request.method === "POST" && method === "import") {
        const snapshot = await request.json();
        const result = await cms.system.settings.updateFromSnapshot(snapshot);
        return json({ success: true, result });
      }
    }

    if (namespace === "system-settings") {
      if (request.method === "POST" && method === "import") {
        const body = await request.json();
        const result = await cms.system.importer.importData(body, tenantId as DatabaseId);
        return json(result);
      }
    }

    if (namespace === "importer") {
      if (request.method === "POST" && method === "scaffold") {
        const body = await request.json();
        const result = await cms.system.importer.scaffold(body);
        return json(result);
      }

      if (request.method === "POST" && method === "external") {
        const body = await request.json();
        const result = await cms.system.importer.importExternal(body, user, tenantId as DatabaseId);
        return json(result);
      }
    }

    if (namespace === "import-data" && request.method === "POST") {
      const body = await request.json();
      const result = await cms.system.importer.importData(body, tenantId as DatabaseId);
      return json(result);
    }

    if (namespace === "ai") {
      if (method === "chat") {
        const body = await request.json();
        const result = await cms.ai.chat(body.userMessage, body.history);
        return json({ success: true, data: result });
      }
      if (method === "enrich") {
        const body = await request.json();
        const result = await cms.ai.enrichText(body.text, body.action, body.language);
        return json({ success: true, data: result });
      }
    }

    if (namespace === "automations") {
      if (request.method === "GET") {
        const result = await cms.automation.getFlows(tenantId || "default");
        return json({ success: true, data: result });
      }
    }

    if (namespace === "metrics") {
      const result = await cms.metrics.getReport();
      return json({ success: true, data: result });
    }

    if (namespace === "telemetry") {
      if (method === "stats") {
        const result = await cms.telemetry.checkUpdateStatus();
        return json({ success: true, data: result });
      }
    }

    if (namespace === "website-tokens") {
      const { withTenant } = await import("@src/databases/db-adapter-wrapper");
      if (request.method === "GET") {
        const page = Number(url.searchParams.get("page") ?? 1);
        const limit = Number(url.searchParams.get("limit") ?? 10);
        const sort = url.searchParams.get("sort") ?? "createdAt";
        const order = url.searchParams.get("order") ?? "desc";

        const result = await withTenant(
          tenantId,
          async () => {
            return await adapter.system.websiteTokens.getAll({
              limit,
              skip: (page - 1) * limit,
              sort,
              order,
            });
          },
          { collection: "websiteTokens" },
        );
        if (url.searchParams.get("raw") === "true") {
          return json(result.data.data);
        }
        return json({ data: result.data.data, pagination: { totalItems: result.data.total } });
      }

      if (request.method === "POST") {
        const body = await request.json();
        const { name, permissions, expiresAt } = body;
        const result = await withTenant(
          tenantId,
          async () => {
            const token = `sv_${crypto.randomBytes(24).toString("hex")}`;
            return await adapter.system.websiteTokens.create({
              name,
              token,
              updatedAt: new Date().toISOString(),
              createdBy: user!._id,
              permissions: permissions || [],
              expiresAt: expiresAt || undefined,
            });
          },
          { collection: "websiteTokens" },
        );
        return json(result.data, { status: 201 });
      }

      if (request.method === "DELETE" && method) {
        await withTenant(
          tenantId,
          async () => {
            return await adapter.system.websiteTokens.delete(method as any);
          },
          { collection: "websiteTokens" },
        );
        return new Response(null, { status: 204 });
      }
    }

    if (namespace === "events") {
      const { eventBus } = await import("@utils/event-bus");
      const stream = new ReadableStream({
        start(controller) {
          let isClosed = false;
          const handler = (event: any) => {
            if (!isClosed) {
              try {
                controller.enqueue(`data: ${JSON.stringify(event)}\n\n`);
              } catch {
                isClosed = true;
                eventBus.off("*", handler);
              }
            }
          };
          eventBus.on("*", handler);
          request.signal.addEventListener("abort", () => {
            if (!isClosed) {
              isClosed = true;
              eventBus.off("*", handler);
              try {
                controller.close();
              } catch {}
            }
          });
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    if (namespace === "content") {
      if (method === "events") {
        const { eventBus } = await import("@utils/event-bus");
        const stream = new ReadableStream({
          start(controller) {
            let isClosed = false;
            // Send initial connection event
            try {
              controller.enqueue(
                `event: connected\ndata: ${JSON.stringify({ status: "active", timestamp: Date.now() })}\n\n`,
              );
            } catch {
              isClosed = true;
            }

            const handler = (event: any) => {
              if (!isClosed) {
                try {
                  controller.enqueue(`data: ${JSON.stringify(event)}\n\n`);
                } catch {
                  isClosed = true;
                  eventBus.off("*", handler);
                }
              }
            };

            eventBus.on("*", handler);

            const interval = setInterval(() => {
              if (!isClosed) {
                try {
                  controller.enqueue(`: keep-alive\n\n`);
                } catch {
                  isClosed = true;
                  clearInterval(interval);
                  eventBus.off("*", handler);
                }
              }
            }, 30000);
            request.signal.addEventListener("abort", () => {
              if (!isClosed) {
                isClosed = true;
                eventBus.off("*", handler);
                clearInterval(interval);
                try {
                  controller.close();
                } catch {
                  // Ignore if already closed
                }
              }
            });
          },
        });
        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      }

      if (method === "version") {
        const { contentManager } = await import("@src/content");
        return json({ version: contentManager.getContentVersion() });
      }
    }

    // --- FALLBACK ---
    throw new AppError(`Endpoint /api/${path} not implemented in dispatcher`, 404);
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    logger.error(`Unified Dispatcher Error: ${err.message}`, { path, stack: err.stack });
    throw new AppError(err.message || "Internal Server Error", err.status || 500);
  }
};

/** @type {import('./$types').RequestHandler} */
export const _handler = dispatch;

export const GET = apiHandler(dispatch);
export const POST = apiHandler(dispatch);
export const PUT = apiHandler(dispatch);
export const PATCH = apiHandler(dispatch);
export const DELETE = apiHandler(dispatch);
export const OPTIONS = apiHandler(dispatch);
