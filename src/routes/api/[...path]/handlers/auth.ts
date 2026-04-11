/**
 * @file src/routes/api/[...path]/handlers/auth.ts
 * @description Authentication and User management handlers for the dispatcher.
 */

import { AppError } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "../../cms";
import type { DatabaseId } from "@src/content/types";
import { SESSION_COOKIE_NAME } from "@src/databases/auth/constants";
import { TwoFactorAuthService } from "@src/databases/auth/two-factor-auth";
import {
  handleSAMLResponse,
  generateSAMLAuthUrl,
  createSAMLConnection,
} from "@src/databases/auth/saml-auth";
import { getAllPermissions } from "@src/databases/auth/permissions";
import { successResponse, rawResponse } from "./base";

export async function handleAuthUserRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const { request, locals, cookies } = event;
  const { user } = locals;
  const namespace = segments[0];
  const method = segments[1];

  // --- Auth / User Root Endpoints ---
  if (!method) {
    if (namespace === "user" && request.method === "GET")
      return handleListUsers(event, cms, tenantId);
    if (namespace === "auth" && request.method === "GET") return successResponse(event, user);
  }

  // --- 2FA Routes ---
  if (method === "2fa") return handle2FARoutes(event, cms, tenantId, user, segments);

  // --- SAML 2.0 Routes ---
  if (method === "saml") return handleSAMLRoutes(event, tenantId, segments);

  // --- Auth Standard Routes ---
  if (method === "login" && request.method === "POST")
    return handleLogin(event, cms, tenantId, cookies);
  if (method === "logout" && request.method === "POST")
    return handleLogout(event, cms, tenantId, cookies);
  if (method === "create-user" && request.method === "POST")
    return handleCreateUser(event, cms, tenantId);
  if (
    method === "update-user-attributes" &&
    (request.method === "POST" || request.method === "PUT" || request.method === "PATCH")
  )
    return handleUpdateUserAttributesRoute(event, cms, tenantId);
  if (method === "save-avatar" && request.method === "POST")
    return handleSaveAvatarRoute(event, cms, tenantId);
  if (method === "me" && request.method === "GET") return successResponse(event, user);
  if (method === "update-roles" && request.method === "POST")
    return handleUpdateRoles(event, cms, tenantId, user);

  // --- User-specific routes ---
  if (namespace === "user")
    return handleUserSpecificRoutes(event, cms, tenantId, user, method, segments);

  // --- Permission Management ---
  if (namespace === "permission") return handlePermissionRoutes(event, cms, tenantId, method);

  throw new AppError(`Auth endpoint /api/${segments.join("/")} not implemented`, 404);
}

/**
 * Lists all users with pagination and search.
 */
export async function handleListUsers(event: RequestEvent, cms: LocalCMS, tenantId: DatabaseId) {
  const { url } = event;
  const page = Number(url.searchParams.get("page")) || 1;
  const limit = Number(url.searchParams.get("limit")) || 10;
  const search = url.searchParams.get("search") || "";
  const sort = url.searchParams.get("sort") || "createdAt";
  const order = (url.searchParams.get("order") as "asc" | "desc") || "desc";
  const raw = url.searchParams.get("raw") === "true";

  const result = await cms.auth.listUsers({ tenantId, page, limit, search, sort, order });
  return raw ? rawResponse(event, result.data) : successResponse(event, result);
}

/**
 * Handles user login and session creation.
 */
export async function handleLogin(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  cookies: any,
) {
  const body = await event.request.json();
  const { email, password } = body;

  const result = await cms.auth.login({ email, password }, { tenantId });

  // Set session cookie
  const isSecure = event.url.protocol === "https:";
  const cookieName = isSecure ? `__Host-${SESSION_COOKIE_NAME}` : SESSION_COOKIE_NAME;

  cookies.set(cookieName, result.session._id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure,
    maxAge: 60 * 60 * 24, // 1 day
  });

  return successResponse(event, { user: result.user, token: result.session._id });
}

/**
 * Handles user creation.
 */
export async function handleCreateUser(event: RequestEvent, cms: LocalCMS, tenantId: DatabaseId) {
  const body = await event.request.json();
  const result = await cms.auth.createUser(body, tenantId);
  if (!result.success) {
    throw new AppError(result.message || "Failed to create user", 400);
  }
  return successResponse(event, result.data, 201);
}

/**
 * Handles user attribute updates.
 */
export async function handleUpdateUserAttributesRoute(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
) {
  const body = await event.request.json();
  const { user_id, newUserData } = body;
  const targetId = user_id === "self" ? event.locals.user?._id : user_id;

  if (!targetId) throw new AppError("User ID is required", 400);

  const result = await cms.auth.updateUserAttributes(targetId, newUserData || body, tenantId);
  return successResponse(event, result);
}

/**
 * Handles user avatar saving.
 */
export async function handleSaveAvatarRoute(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
) {
  let userId: string;
  let avatar: string;

  if (event.request.headers.get("content-type")?.includes("multipart/form-data")) {
    const formData = await event.request.formData();
    userId = (formData.get("user_id") as string) || "self";
    avatar = formData.get("avatar") as string;
  } else {
    const body = await event.request.json();
    userId = body.user_id || "self";
    avatar = body.avatar;
  }

  const targetId = userId === "self" ? event.locals.user?._id : userId;
  if (!targetId) throw new AppError("User ID is required", 400);

  const result = await cms.auth.saveAvatar(targetId, avatar, tenantId);
  return successResponse(event, result);
}

/**
 * Handles user logout and session termination.
 */
export async function handleLogout(
  event: RequestEvent,
  cms: LocalCMS,
  _tenantId: DatabaseId,
  cookies: any,
) {
  const isSecure = event.url.protocol === "https:";
  const cookieName = isSecure ? `__Host-${SESSION_COOKIE_NAME}` : SESSION_COOKIE_NAME;
  const sessionId = cookies.get(cookieName) || cookies.get(SESSION_COOKIE_NAME);

  if (sessionId) {
    await cms.auth.logout(sessionId);
    cookies.delete(cookieName, { path: "/" });
    cookies.delete(SESSION_COOKIE_NAME, { path: "/" });
  }

  return successResponse(event, { message: "Logged out successfully" });
}

/**
 * Updates system roles and permissions.
 */
export async function handleUpdateRoles(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
) {
  const roles = await event.request.json();
  const result = await cms.auth.updateRoles(roles, { user, tenantId });
  return successResponse(event, result);
}

/**
 * Handles 2FA related routes.
 */
export async function handle2FARoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
  segments: string[],
) {
  const action = segments[2];
  const auth = cms.db.auth;
  const twoFactorService = new TwoFactorAuthService(auth);

  if (action === "setup" && event.request.method === "POST") {
    const result = await twoFactorService.initiate2FASetup(user._id, user.email, tenantId);
    return successResponse(event, result);
  }

  if ((action === "enable" || action === "verify-setup") && event.request.method === "POST") {
    const { code, verificationCode, secret, backupCodes } = await event.request.json();
    const result = await twoFactorService.complete2FASetup(
      user._id,
      secret,
      code || verificationCode,
      backupCodes,
      tenantId,
    );
    if (!result) throw new AppError("Invalid verification code", 400);
    return successResponse(event, { success: result });
  }

  if (action === "verify" && event.request.method === "POST") {
    const { code } = await event.request.json();
    const result = await twoFactorService.verify2FA(user._id, code, tenantId);
    return successResponse(event, result);
  }

  if (action === "disable" && event.request.method === "POST") {
    const result = await twoFactorService.disable2FA(user._id, tenantId);
    return successResponse(event, { success: result });
  }

  if (action === "status" && event.request.method === "GET") {
    const result = await twoFactorService.get2FAStatus(user._id, tenantId);
    return successResponse(event, result);
  }

  if (action === "regenerate-backup-codes" && event.request.method === "POST") {
    const result = await twoFactorService.regenerateBackupCodes(user._id, tenantId);
    return successResponse(event, { backupCodes: result });
  }

  throw new AppError(`2FA action ${action} not found`, 404);
}

/**
 * Handles SAML 2.0 / Enterprise SSO routes.
 */
export async function handleSAMLRoutes(
  event: RequestEvent,
  tenantId: DatabaseId,
  segments: string[],
) {
  const action = segments[2];

  if (action === "acs" && event.request.method === "POST") {
    return await handleSAMLResponse(event);
  }

  if (action === "login" && event.request.method === "GET") {
    const tenant = event.url.searchParams.get("tenant") || (tenantId as string);
    const product = event.url.searchParams.get("product") || "sveltycms";
    const url = await generateSAMLAuthUrl(tenant, product);
    return successResponse(event, { url });
  }

  if (action === "config" && event.request.method === "POST") {
    const params = await event.request.json();
    const result = await createSAMLConnection(params);
    return successResponse(event, result);
  }

  throw new AppError(`SAML action ${action} not found`, 404);
}

/**
 * Handles user-specific routes (e.g. /api/user/[id]).
 */
export async function handleUserSpecificRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  _user: any,
  method: string,
  segments: string[],
) {
  const { request } = event;

  if (method === "batch" && request.method === "POST") {
    const { ids, action } = await request.json();
    const result = await cms.auth.batchAction(ids, action, tenantId);
    return successResponse(event, result);
  }

  // Assume method is userId
  const userId = method as DatabaseId;
  const subAction = segments[2];

  if (!subAction) {
    if (request.method === "GET") {
      const targetUser = await cms.auth.getUserById(userId, tenantId);
      return successResponse(event, targetUser);
    }
    if (request.method === "PATCH" || request.method === "PUT") {
      const data = await request.json();
      const result = await cms.auth.updateUserAttributes(userId, data, tenantId);
      return successResponse(event, result);
    }
  }

  if (subAction === "avatar") {
    if (request.method === "POST") {
      const { avatar } = await request.json();
      const result = await cms.auth.saveAvatar(userId, avatar, tenantId);
      return successResponse(event, result);
    }
    if (request.method === "DELETE") {
      const result = await cms.auth.deleteAvatar(userId, tenantId);
      return successResponse(event, result);
    }
  }

  throw new AppError(`User route /api/user/${segments.slice(1).join("/")} not implemented`, 404);
}

/**
 * Handles permission management routes.
 */
export async function handlePermissionRoutes(
  event: RequestEvent,
  _cms: LocalCMS,
  _tenantId: DatabaseId,
  method: string,
) {
  if (method === "list" && event.request.method === "GET") {
    const permissions = await getAllPermissions();
    return successResponse(event, permissions);
  }
  throw new AppError(`Permission route /api/permission/${method} not implemented`, 404);
}
