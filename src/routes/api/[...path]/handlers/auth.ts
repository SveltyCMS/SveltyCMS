/**
 * @file src/routes/api/[...path]/handlers/auth.ts
 * @description Authentication and User management handlers for the dispatcher.
 */

import { AppError, handleApiError } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "../../cms";
import type { DatabaseId } from "@src/content/types";
import { getAuth } from "@src/databases/db";
import { SESSION_COOKIE_NAME } from "@src/databases/auth/constants";
import { successResponse, rawResponse } from "./base";

export async function handleAuthUserRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  namespace: string,
  segments: string[],
) {
  const { request, url, locals, cookies } = event;
  const { user } = locals;
  const method = segments[1];

  // --- Auth / User Root Endpoints ---
  if (!method) {
    if (namespace === "user" && request.method === "GET") {
      const search = url.searchParams.get("search") || undefined;
      const page = Number(url.searchParams.get("page")) || 1;
      const limit = Number(url.searchParams.get("limit")) || 10;
      const sort = url.searchParams.get("sort") || undefined;
      const order = (url.searchParams.get("order") as "asc" | "desc") || "desc";

      const result = await cms.auth.listUsers({
        tenantId,
        search,
        page,
        limit,
        sort,
        order,
      });

      return url.searchParams.get("raw") === "true"
        ? rawResponse(event, result.data)
        : successResponse(event, result);
    }

    if (namespace === "auth" && method === "me" && request.method === "GET") {
      return successResponse(event, user);
    }
  }

  // --- 2FA Routes ---
  if (method === "2fa") {
    const action = segments[2];
    const { getDefaultTwoFactorAuthService } = await import("@src/databases/auth/two-factor-auth");
    const twoFactorService = getDefaultTwoFactorAuthService(cms.db.auth);

    if (action === "setup" && request.method === "POST") {
      if (!user) throw new AppError("Authentication required", 401);
      const result = await twoFactorService.initiate2FASetup(
        user._id as DatabaseId,
        user.email,
        tenantId,
      );
      return successResponse(event, result);
    }
    if (action === "verify-setup" && request.method === "POST") {
      if (!user) throw new AppError("Authentication required", 401);
      const { code, secret, backupCodes } = await request.json();
      const result = await twoFactorService.complete2FASetup(
        user._id as DatabaseId,
        secret,
        code,
        backupCodes,
        tenantId,
      );
      if (!result) throw new AppError("Invalid verification code format or code", 400);
      return rawResponse(event, { success: true });
    }
    if (action === "verify" && request.method === "POST") {
      const { userId, code } = await request.json();
      const result = await twoFactorService.verify2FA(userId as DatabaseId, code, tenantId);
      if (!result.success) throw new AppError(result.message, 400);
      return rawResponse(event, result);
    }
    if (action === "disable" && request.method === "POST") {
      if (!user) throw new AppError("Authentication required", 401);
      const result = await twoFactorService.disable2FA(user._id as DatabaseId, tenantId);
      if (!result) throw new AppError("Failed to disable 2FA", 400);
      return rawResponse(event, { success: true });
    }
    if (action === "backup-codes") {
      if (!user) throw new AppError("Authentication required", 401);
      if (request.method === "GET") {
        const result = await twoFactorService.get2FAStatus(user._id as DatabaseId, tenantId);
        return successResponse(event, result);
      }
      if (request.method === "POST") {
        const result = await twoFactorService.regenerateBackupCodes(
          user._id as DatabaseId,
          tenantId,
        );
        return successResponse(event, result);
      }
    }
  }

  // --- SAML 2.0 Routes ---
  if (method === "saml") {
    const action = segments[2];
    const samlModule = await import("@src/databases/auth/saml-auth");

    if (action === "config") {
      if (request.method === "GET") {
        const config = await samlModule.getJackson();
        return successResponse(event, config);
      }
      if (request.method === "POST") {
        const body = await request.json();
        const result = await samlModule.createSAMLConnection(body);
        return successResponse(event, result);
      }
    }
    if (action === "login" && request.method === "POST") {
      await request.json().catch(() => ({}));
      const url = await samlModule.generateSAMLAuthUrl(tenantId || "default", "sveltycms");
      return successResponse(event, { url });
    }
    if (action === "acs" && request.method === "POST") {
      return samlModule.handleSAMLResponse(event as any);
    }
  }

  // --- User-specific routes ---
  if (namespace === "user") {
    if (method === "create-user" && request.method === "POST") {
      const body = await request.json();
      const newUser = await cms.auth.createUser(body, tenantId);
      if (!newUser.success) {
        return handleApiError(new Error(newUser.message), event);
      }
      return successResponse(event, newUser.data, 201);
    }
    if (method === "batch" && request.method === "POST") {
      const { userIds, action: batchAction } = await request.json();
      const result = await cms.auth.batchAction(userIds, batchAction, tenantId);
      return rawResponse(event, result);
    }
    if (
      method === "update-user-attributes" &&
      (request.method === "PUT" || request.method === "PATCH")
    ) {
      const { user_id, newUserData } = await request.json();
      const resolvedUserId = user_id === "self" ? user?._id : user_id;
      const result = await cms.auth.updateUserAttributes(
        resolvedUserId as DatabaseId,
        newUserData,
        tenantId,
      );
      return rawResponse(event, result);
    }
    if (method === "save-avatar" && request.method === "POST") {
      const formData = await request.formData();
      const avatarFile = formData.get("avatar") as File;
      const { saveAvatarImage } = await import("@utils/media/media-storage.server");
      const avatarUrl = await saveAvatarImage(avatarFile, user?._id || "guest");
      const result = await cms.auth.saveAvatar(user?._id as DatabaseId, avatarUrl, tenantId);

      // Return consistent avatarUrl property for test compatibility
      return rawResponse(event, { success: result.success, avatarUrl });
    }
    if (method === "delete-avatar" && request.method === "DELETE") {
      const { userId } = await request.json().catch(() => ({}));
      const result = await cms.auth.deleteAvatar((userId || user?._id) as DatabaseId, tenantId);
      return rawResponse(event, result);
    }
    if (method && method !== "me" && !segments[2] && request.method === "GET") {
      const result = await cms.auth.getUserById(method as DatabaseId, tenantId);
      return successResponse(event, result);
    }
  }

  // --- Auth Standard Routes ---
  if (method === "login" && request.method === "POST") {
    const credentials = await request.json();
    const { user: authedUser, session } = await cms.auth.login(credentials, { tenantId });
    const authInstance = getAuth();
    if (!authInstance) throw new AppError("Auth system not initialized", 500);
    const sessionCookie = authInstance.createSessionCookie(session._id);
    cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes as any);
    return successResponse(event, { user: authedUser });
  }

  if (method === "logout" && request.method === "POST") {
    const sessionCookieKey = cookies.get(SESSION_COOKIE_NAME);
    if (sessionCookieKey) {
      const authInstance = getAuth();
      if (authInstance) await authInstance.logOut(sessionCookieKey as DatabaseId);

      // CRITICAL: Invalidate the in-memory cache in the authentication hook
      const { invalidateSessionCache } = await import("@src/hooks/handle-authentication");
      invalidateSessionCache(sessionCookieKey, tenantId as DatabaseId);

      cookies.delete(SESSION_COOKIE_NAME, { path: "/" });
    }
    return successResponse(event, { message: "Logged out successfully" });
  }

  if (method === "me" && request.method === "GET") {
    return successResponse(event, user);
  }

  if (method === "update-roles" && request.method === "POST") {
    const { roles } = await request.json();
    const result = await cms.auth.updateRoles(roles, { user: user!, tenantId });
    return rawResponse(event, result);
  }

  throw new AppError(`Auth endpoint /api/${segments.join("/")} not implemented`, 404);
}
