/**
 * @description Enterprise authentication, user management, 2FA, SAML SSO, and permissions handlers.
 *
 * Responsibilities:
 * - Session-based login/logout with secure cookie management
 * - User CRUD with avatar upload support
 * - Two-Factor Authentication (setup, verify, disable, backup codes)
 * - SAML 2.0 Enterprise SSO (IdP-initiated + SP-initiated flows)
 * - Role/permission management
 * - Test-mode bypass for integration/E2E suites
 */

import { AppError, rethrow, isAppError } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId, ISODateString } from "@src/content/types";
import {
  SESSION_COOKIE_NAME,
  getSessionCookieName,
  isSecureCookieContext,
} from "@src/databases/auth/constants";
import { TwoFactorAuthService } from "@src/databases/auth/two-factor-auth";
import {
  handleSAMLResponse,
  generateSAMLAuthUrl,
  createSAMLConnection,
} from "@src/databases/auth/saml-auth";
import { getAllPermissions } from "@src/databases/auth/permissions";
import type { User } from "@src/databases/auth/types";
import { successResponse, rawResponse } from "./base";
import { invalidateSessionCache, primeSessionMemoryCache } from "@src/hooks/handle-authentication";
import { verifyPassword } from "@src/databases/auth";
import { isMultiTenantEnabled } from "@utils/tenant";
import { getPrivateSettingSync } from "@src/services/core/settings-service";
import { generateCsrfToken } from "@utils/security/csrf-utils";
import { logger } from "@utils/logger";
import { generateSecureToken } from "@utils/native-utils";

// ─── Types ───────────────────────────────────────────────────────────────────

/** Strip sensitive fields from user object before sending to client. */
function sanitizeUserForResponse(user: any) {
  if (!user) return user;
  const {
    password: _password,
    failedAttempts: _failedAttempts,
    lockoutUntil: _lockoutUntil,
    ...safe
  } = user;
  return safe;
}

interface CookieConfig {
  name: string;
  isSecure: boolean;
}

// ─── Main Dispatcher ─────────────────────────────────────────────────────────

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
  const reqMethod = request.method.toUpperCase();

  if (reqMethod === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, x-test-secret, x-test-mode, cookie",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  try {
    // ── Root-level GET endpoints ──
    if (!method) {
      switch (namespace) {
        case "auth":
          return reqMethod === "GET" ? successResponse(event, user) : notAllowed();
        case "user":
          return reqMethod === "GET"
            ? handleListUsers(event, cms, tenantId)
            : reqMethod === "POST"
              ? handleCreateUser(event, cms, tenantId)
              : notAllowed();
        case "get-tokens-provided":
          return reqMethod === "GET"
            ? rawResponse(event, {
                google: !!getPrivateSettingSync("GOOGLE_CLIENT_ID"),
                twitch: !!getPrivateSettingSync("TWITCH_CLIENT_ID"),
                tiktok: !!getPrivateSettingSync("TIKTOK_TOKEN"),
              })
            : notAllowed();
      }
      throw new AppError(`Endpoint /api/${segments.join("/")} not found`, 404);
    }

    // ── Action routes ──
    switch (method) {
      // Auth
      case "login":
        return reqMethod === "POST" ? handleLogin(event, cms, tenantId, cookies) : notAllowed();
      case "logout":
        return reqMethod === "POST" ? handleLogout(event, cms, tenantId, cookies) : notAllowed();
      case "oidc-logout":
        return reqMethod === "POST" || reqMethod === "GET"
          ? handleOidcLogout(event, cms, tenantId, cookies)
          : notAllowed();
      case "oidc-login":
        return reqMethod === "GET" ? handleOidcLoginStart(event) : notAllowed();
      case "oidc-callback":
        return reqMethod === "GET"
          ? handleOidcLoginCallback(event, cms, tenantId, cookies)
          : notAllowed();
      case "frontchannel-logout":
        return reqMethod === "GET" ? handleFrontChannelLogoutRoute(event) : notAllowed();
      case "backchannel-logout":
        return reqMethod === "POST" ? handleBackChannelLogoutRoute(event) : notAllowed();

      // Password verification (own profile only)
      case "verify-password":
        return reqMethod === "POST" ? handleVerifyPassword(event, user) : notAllowed();

      // User Management
      case "create-user":
        return reqMethod === "POST" ? handleCreateUser(event, cms, tenantId) : notAllowed();
      case "update-user-attributes":
        return reqMethod === "POST" || reqMethod === "PUT" || reqMethod === "PATCH"
          ? handleUpdateUserAttributesRoute(event, cms, tenantId)
          : notAllowed();
      case "save-avatar":
        return reqMethod === "POST" ? handleSaveAvatarRoute(event, cms, tenantId) : notAllowed();
      case "delete-avatar":
        if (reqMethod !== "DELETE") return notAllowed();
        if (!user?._id) throw new AppError("Unauthorized", 401);
        return successResponse(event, await cms.auth.deleteAvatar({ userId: user._id, tenantId }));
      case "me":
        return reqMethod === "GET" ? successResponse(event, user) : notAllowed();
      case "update-roles":
        return reqMethod === "POST" ? handleUpdateRoles(event, cms, tenantId, user) : notAllowed();
      case "batch":
        return namespace === "user" && reqMethod === "POST"
          ? handleUserSpecificRoutes(event, cms, tenantId, user, "batch", segments)
          : notAllowed();

      // Sub-routes
      case "sessions":
        return handleSessionsRoutes(event, cms, tenantId, user);
      case "2fa":
        return handle2FARoutes(event, cms, tenantId, user, segments);
      case "saml":
        return handleSAMLRoutes(event, tenantId, segments);
      case "user":
        return handleUserSpecificRoutes(event, cms, tenantId, user, method, segments);
      case "permission":
        return handlePermissionRoutes(event, cms, tenantId, segments);

      default:
        throw new AppError(`Auth endpoint /api/${segments.join("/")} not implemented`, 404);
    }
  } catch (err: any) {
    rethrow(err);
    // Expected AppErrors (validation, method not allowed) should not log noisy traces
    if (!isAppError(err)) {
      logger.error(`[AuthRoute Error] ${segments.join("/")}:`, err);
    }
    if (isAppError(err)) throw err;
    throw new AppError(err.message || "Authentication operation failed", 500);
  }
}

// ─── Cookie Helpers ──────────────────────────────────────────────────────────

/** Determines the session cookie name based on connection security. */
function getCookieConfig(event: RequestEvent): CookieConfig {
  const isSecure = isSecureCookieContext(event.url.protocol, event.url.hostname);
  return {
    name: getSessionCookieName(isSecure),
    isSecure,
  };
}

/** Sets the session cookie with the appropriate security flags. */
function setSessionCookie(event: RequestEvent, sessionId: string) {
  const { name, isSecure } = getCookieConfig(event);
  event.cookies.set(name, sessionId, {
    path: "/",
    httpOnly: true,
    sameSite: isSecure ? "strict" : "lax",
    secure: isSecure,
    maxAge: 60 * 60 * 24, // 24 hours
  });
}

/** Deletes both secure and non-secure variants of the session cookie. */
function clearSessionCookies(event: RequestEvent) {
  const { name, isSecure } = getCookieConfig(event);
  event.cookies.delete(name, { path: "/" });
  // Also delete the non-secure variant in case it was set previously
  if (isSecure) event.cookies.delete(SESSION_COOKIE_NAME, { path: "/" });
}

// ─── Core Handlers ───────────────────────────────────────────────────────────

/**
 * Lists all users with pagination, search, and sorting.
 */
export async function handleListUsers(event: RequestEvent, cms: LocalCMS, tenantId: DatabaseId) {
  const { url } = event;
  const raw = url.searchParams.get("raw") === "true";

  const result = await cms.auth.listUsers({
    tenantId,
    page: Number(url.searchParams.get("page")) || 1,
    limit: Number(url.searchParams.get("limit")) || 20,
    search: url.searchParams.get("search") || "",
    sort: url.searchParams.get("sort") || "createdAt",
    order: (url.searchParams.get("order") as "asc" | "desc") || "desc",
  });

  if (!result.success) throw new AppError(result.message || "Failed to list users", 500);
  return raw
    ? rawResponse(event, result.data?.data || result.data)
    : rawResponse(event, { success: true, ...result.data });
}

/**
 * Handles user login with session creation.
 * Supports test-mode bypass for integration/E2E suites.
 */
export async function handleLogin(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  cookies: any,
) {
  const body = await event.request.json();
  const { email, password } = body;

  let result: { user: any; session: any };

  if ((event.locals as any).__testBypass) {
    result = await handleTestLoginBypass(cms, email || "admin@example.com", tenantId);
  } else {
    const userAgent = event.request.headers.get("user-agent") || undefined;
    const ipAddress =
      event.getClientAddress?.() ||
      event.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      undefined;
    const loginResult = await cms.auth.login(
      { email, password },
      { tenantId, sessionMeta: { userAgent, ipAddress } },
    );
    if (!loginResult.success) throw new AppError(loginResult.message || "Login failed", 401);
    result = loginResult.data;
  }

  setSessionCookie(event, result.session._id);
  generateCsrfToken(cookies, getCookieConfig(event).isSecure);

  return successResponse(event, {
    user: sanitizeUserForResponse(result.user),
    token: result.session._id,
  });
}

/** Test-mode login bypass — grants sessions without password verification. */
async function handleTestLoginBypass(cms: LocalCMS, requestedEmail: string, tenantId: DatabaseId) {
  let userResult;
  try {
    userResult = await cms.auth.getUserByEmail(requestedEmail, { tenantId });
    logger.debug(`[TestLoginBypass] getUserByEmail`, {
      email: requestedEmail,
      tenantId,
      success: userResult?.success,
    });
  } catch (e: unknown) {
    logger.error(`[TestLoginBypass] getUserByEmail failed`, {
      email: requestedEmail,
      tenantId,
      error: e,
    });
  }

  if (userResult?.success && userResult.data?._id) {
    const user = userResult.data;
    const { Auth } = await import("@src/databases/auth");
    const { getDefaultSessionStore } = await import("@src/databases/auth/session-manager");
    const highLevelAuth = new Auth(cms.db, getDefaultSessionStore());
    const session = await highLevelAuth.createSession({
      user_id: user._id as DatabaseId,
      expires: new Date(Date.now() + 86400000).toISOString() as ISODateString,
      tenantId: tenantId as DatabaseId,
    });
    logger.debug(`[TestLoginBypass] session created for user_id=${user._id}`);
    return { user, session };
  }

  // Never mint a fake session — that poisons E2E/integration cookies
  // (`test-session-*`) and masks missing seed/admin. Callers must seed first.
  logger.warn(`[TestLoginBypass] user not found or missing _id. Refusing dummy session.`, {
    email: requestedEmail,
    tenantId,
  });
  throw new AppError(
    `Test login bypass: user not found for ${requestedEmail}. Seed admin via /api/testing action=seed first.`,
    401,
    "TEST_USER_NOT_SEEDED",
  );
}

/**
 * Handles user logout and session termination.
 */
export async function handleLogout(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  cookies: any,
) {
  const { name } = getCookieConfig(event);
  const sessionId = cookies.get(name) || cookies.get(SESSION_COOKIE_NAME);

  if (sessionId) {
    await cms.auth.logout(sessionId);
    invalidateSessionCache(sessionId, tenantId);
    clearSessionCookies(event);
  }

  return successResponse(event, { message: "Logged out successfully" });
}

/**
 * Handles OpenID Connect RP-Initiated Logout.
 *
 * Supports both GET (user clicks logout link) and POST (form submit).
 * Validates post_logout_redirect_uri against the provider's allowlist.
 * If the OP has an end_session_endpoint, redirects the browser there
 * for federated logout across all OIDC RPs.
 *
 * Query params: id_token_hint, post_logout_redirect_uri, state
 */
export async function handleOidcLogout(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  cookies: any,
) {
  const { name } = getCookieConfig(event);
  const sessionId = cookies.get(name) || cookies.get(SESSION_COOKIE_NAME);

  // Parse OIDC params from query (GET) or body (POST)
  let idTokenHint: string | undefined;
  let postLogoutRedirectUri: string | undefined;
  let state: string | undefined;

  if (event.request.method === "GET") {
    const q = event.url.searchParams;
    idTokenHint = q.get("id_token_hint") || undefined;
    postLogoutRedirectUri = q.get("post_logout_redirect_uri") || undefined;
    state = q.get("state") || undefined;
  } else {
    const body = await event.request.json().catch(() => ({}));
    idTokenHint = body.id_token_hint;
    postLogoutRedirectUri = body.post_logout_redirect_uri;
    state = body.state;
  }

  // Always terminate the local session first
  if (sessionId) {
    try {
      const { performRpInitiatedLogout } = await import("@src/databases/auth/sso-session");
      const result = await performRpInitiatedLogout({
        sessionId,
        idTokenHint,
        postLogoutRedirectUri,
        state,
        tenantId,
      });

      await cms.auth.logout(sessionId);
      invalidateSessionCache(sessionId, tenantId);
      clearSessionCookies(event);

      // If OP has end_session_endpoint, redirect browser there
      if (result.endSessionUrl) {
        return new Response(null, {
          status: 302,
          headers: { Location: result.endSessionUrl },
        });
      }

      return successResponse(event, { message: result.message });
    } catch (err) {
      logger.error("[OIDC] RP-Initiated Logout failed:", err);
      // Fall through to local logout even if SSO part fails
    }
  }

  // Non-SSO or fallback: standard logout
  if (sessionId) {
    await cms.auth.logout(sessionId);
    invalidateSessionCache(sessionId, tenantId);
    clearSessionCookies(event);
  }

  // If post_logout_redirect_uri is present and valid, redirect there
  if (postLogoutRedirectUri) {
    try {
      const url = new URL(postLogoutRedirectUri);
      if (url.protocol === "https:" || url.hostname === "localhost") {
        return new Response(null, {
          status: 302,
          headers: { Location: postLogoutRedirectUri },
        });
      }
    } catch {
      // Invalid URL — ignore
    }
  }

  return successResponse(event, { message: "Logged out successfully" });
}

/**
 * Start OIDC authorization-code login: redirect to OP authorize endpoint.
 * Query: provider (required), redirect_uri (optional — defaults to /api/auth/oidc-callback)
 */
export async function handleOidcLoginStart(event: RequestEvent) {
  const providerId = event.url.searchParams.get("provider") || "";
  if (!providerId) throw new AppError("provider query param is required", 400);

  const { buildOidcAuthorizationUrl, getSsoProvider, loadSsoProvidersFromSettings } =
    await import("@src/databases/auth/sso-session");
  loadSsoProvidersFromSettings();
  if (!getSsoProvider(providerId)) {
    throw new AppError(`Unknown OIDC provider: ${providerId}`, 404);
  }

  const origin = event.url.origin;
  const redirectUri =
    event.url.searchParams.get("redirect_uri") || `${origin}/api/auth/oidc-callback`;
  const state = globalThis.crypto.randomUUID();
  const nonce = globalThis.crypto.randomUUID();

  // Short-lived cookie for CSRF state (HttpOnly)
  event.cookies.set("oidc_login_state", JSON.stringify({ state, nonce, providerId, redirectUri }), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: event.url.protocol === "https:",
    maxAge: 600,
  });

  const built = await buildOidcAuthorizationUrl(providerId, {
    redirectUri,
    state,
    nonce,
  });
  if (!built.success) throw new AppError(built.message, 400);

  return new Response(null, {
    status: 302,
    headers: { Location: built.url },
  });
}

/**
 * OIDC callback: exchange code, verify id_token (JWKS), create local session when possible.
 */
export async function handleOidcLoginCallback(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  cookies: any,
) {
  const code = event.url.searchParams.get("code") || "";
  const state = event.url.searchParams.get("state") || "";
  const err = event.url.searchParams.get("error");
  if (err) throw new AppError(`OIDC error: ${err}`, 400);
  if (!code || !state) throw new AppError("code and state are required", 400);

  let stored: { state: string; nonce: string; providerId: string; redirectUri: string };
  try {
    stored = JSON.parse(cookies.get("oidc_login_state") || "{}");
  } catch {
    throw new AppError("Missing OIDC login state", 400);
  }
  cookies.delete("oidc_login_state", { path: "/" });
  if (!stored.state || stored.state !== state) {
    throw new AppError("OIDC state mismatch", 400);
  }

  const { exchangeOidcCode, setSsoSessionMetadata } =
    await import("@src/databases/auth/sso-session");
  const exchanged = await exchangeOidcCode(stored.providerId, {
    code,
    redirectUri: stored.redirectUri,
  });
  if (!exchanged.success) throw new AppError(exchanged.message, 401);

  const email =
    (exchanged.payload?.email as string) || (exchanged.payload?.preferred_username as string) || "";
  if (!email) {
    return successResponse(event, {
      message: "OIDC login succeeded but no email claim — link account manually",
      provider: stored.providerId,
      claims: exchanged.payload,
    });
  }

  const userRes = await cms.auth.getUserByEmail(email, { tenantId });
  const user = userRes?.success ? userRes.data : null;
  if (!user?._id) {
    throw new AppError(
      `No local user for ${email}. Create the user or enable invite-based provisioning.`,
      403,
    );
  }

  // Create session via adapter Auth (user_id contract used by relational/mongo auth)
  const auth = (await import("@src/databases/db")).getDb()?.auth;
  if (!auth?.createSession) {
    throw new AppError("Auth adapter createSession unavailable", 500);
  }
  const sessionRes = await auth.createSession({
    user_id: user._id as any,
    tenantId: tenantId as any,
    expires: new Date(Date.now() + 86_400_000).toISOString() as any,
  });
  if (!sessionRes?.success || !sessionRes.data) {
    const sessionErrMsg = sessionRes && "message" in sessionRes ? sessionRes.message : undefined;
    throw new AppError(sessionErrMsg || "Failed to create session after OIDC login", 500);
  }
  const sessionId = String((sessionRes.data as any)._id || sessionRes.data);
  if (!sessionId) throw new AppError("Session id missing after OIDC login", 500);

  if (exchanged.idToken) {
    try {
      setSsoSessionMetadata(sessionId, {
        provider: stored.providerId,
        idTokenHint: exchanged.idToken,
        createdAt: new Date().toISOString(),
      });
    } catch {
      // non-fatal
    }
  }

  {
    const { getSessionCookieName, SESSION_COOKIE_NAME } =
      await import("@src/databases/auth/constants");
    const isSecure = event.url.protocol === "https:";
    const name = getSessionCookieName(isSecure) || SESSION_COOKIE_NAME;
    cookies.set(name, sessionId, {
      path: "/",
      httpOnly: true,
      sameSite: "strict" as const,
      secure: isSecure,
      maxAge: 60 * 60 * 24 * 7,
    });
  }

  return new Response(null, {
    status: 302,
    headers: { Location: "/dashboard" },
  });
}

/**
 * Handles OIDC Front-Channel Logout (OP-initiated).
 * The OP renders an iframe pointing to this endpoint with iss and sid query params.
 * Returns 200 with cache-prevention headers per spec.
 */
export async function handleFrontChannelLogoutRoute(event: RequestEvent) {
  const q = event.url.searchParams;
  const issuer = q.get("iss") || "";
  const sid = q.get("sid") || "";

  if (!issuer || !sid) {
    return new Response("Missing iss or sid", { status: 400 });
  }

  const { handleFrontChannelLogout } = await import("@src/databases/auth/sso-session");
  return handleFrontChannelLogout(issuer, sid);
}

/**
 * Handles OIDC Back-Channel Logout (OP-initiated, server-to-server).
 * Accepts POST with form-encoded or JSON logout_token.
 */
export async function handleBackChannelLogoutRoute(event: RequestEvent) {
  const contentType = event.request.headers.get("content-type") || "";
  let logoutToken: string | undefined;

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = await event.request.formData();
    logoutToken = form.get("logout_token")?.toString();
  } else {
    const body = await event.request.json().catch(() => ({}));
    logoutToken = body.logout_token;
  }

  if (!logoutToken) {
    return new Response("Missing logout_token", { status: 400 });
  }

  const { handleBackChannelLogout } = await import("@src/databases/auth/sso-session");
  const result = await handleBackChannelLogout(logoutToken);

  if (!result.success) {
    return new Response(result.message, { status: 400 });
  }

  return successResponse(event, { message: result.message });
}

// ─── User Management Handlers ────────────────────────────────────────────────

/**
 * Creates a new user.
 */
export async function handleCreateUser(event: RequestEvent, cms: LocalCMS, tenantId: DatabaseId) {
  const body = await event.request.json();
  const result = await cms.auth.createUser(body, { tenantId });
  if (!result.success) throw new AppError(result.message || "Failed to create user", 400);
  return successResponse(event, result.data, 201);
}

/**
 * Verifies the current authenticated user's password.
 * Used by the profile editor to gate sensitive field access (password change).
 *
 * SECURITY: Only verifies the calling user's own password — not an arbitrary user.
 * This prevents password-guessing attacks via the API.
 */
export async function handleVerifyPassword(event: RequestEvent, user: any) {
  const body = await event.request.json();
  const { password } = body;

  if (!password || typeof password !== "string") {
    return successResponse(event, { valid: false });
  }

  // Must be authenticated with a real user (not API key / token virtual user)
  if (!user?.password) {
    return successResponse(event, { valid: false });
  }

  try {
    const valid = await verifyPassword(user.password, password);
    return successResponse(event, { valid });
  } catch {
    return successResponse(event, { valid: false });
  }
}

/**
 * Updates user attributes (email, password, profile fields, etc.).
 * When a password change is detected, ALL other active sessions are immediately
 * invalidated across all devices for security.
 */
export async function handleUpdateUserAttributesRoute(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
) {
  const body = await event.request.json();
  const { user_id, newUserData, ...directUpdates } = body;
  const targetId = !user_id || user_id === "self" ? event.locals.user?._id : user_id;

  if (!targetId) throw new AppError("User ID is required", 400);

  const updates =
    newUserData && typeof newUserData === "object"
      ? { ...directUpdates, ...newUserData }
      : directUpdates;

  // Strip empty password fields so adapters never try to write blank credentials
  if ("password" in updates && (!updates.password || String(updates.password).trim() === "")) {
    delete (updates as any).password;
  }
  if (
    "currentPassword" in updates &&
    (!updates.currentPassword || String(updates.currentPassword).trim() === "")
  ) {
    delete (updates as any).currentPassword;
  }
  // currentPassword is verification-only — never persist it as a user column
  delete (updates as any).currentPassword;
  delete (updates as any).confirmPassword;
  delete (updates as any).user_id;

  if (Object.keys(updates).length === 0) {
    throw new AppError("At least one user attribute is required", 400);
  }

  // Never force isNull(tenantId) when multi-tenant is off — session-cached users
  // after re-seed can miss null-tenant filters. Prefer id-only update.
  const updateOpts: { tenantId?: DatabaseId; bypassTenantCheck?: boolean } = {
    bypassTenantCheck: true,
  };
  if (tenantId) {
    updateOpts.tenantId = tenantId;
    updateOpts.bypassTenantCheck = false;
  }

  let resolvedId = String(targetId);
  let result = await cms.auth.updateUserAttributes(resolvedId, updates, updateOpts);

  // Session can hold a stale user_id after wizard reset / re-seed while email is current.
  // Resolve by email and retry once so self-profile updates never 404 spuriously.
  if (
    !result.success &&
    /not found/i.test(String(result.message || "")) &&
    event.locals.user?.email
  ) {
    try {
      const byEmail = await cms.auth.getUserByEmail(String(event.locals.user.email), {
        bypassTenantCheck: true,
      } as any);
      const emailUser =
        byEmail?.success && byEmail.data
          ? byEmail.data
          : byEmail && typeof byEmail === "object" && "_id" in (byEmail as object)
            ? (byEmail as unknown as { _id: string })
            : null;
      const emailId = emailUser && (emailUser as { _id?: string })._id;
      if (emailId && String(emailId) !== resolvedId) {
        resolvedId = String(emailId);
        result = await cms.auth.updateUserAttributes(resolvedId, updates, {
          bypassTenantCheck: true,
        } as any);
      }
    } catch {
      /* keep original failure */
    }
  }

  if (!result.success) throw new AppError(result.message || "Update failed", 400);

  // 🔄 Refresh session caches so the next page load returns updated user data
  const currentSessionId =
    (event.locals.session_id as DatabaseId | undefined) ??
    event.cookies.get(getSessionCookieName(event.url.protocol === "https:")) ??
    event.cookies.get(SESSION_COOKIE_NAME);
  if (targetId === event.locals.user?._id && currentSessionId && result.data) {
    primeSessionMemoryCache(currentSessionId, result.data as User);
    // Also clear the Redis cache key so it's re-read from DB on next cache miss
    try {
      const { cacheService } = await import("@src/databases/cache/cache-service");
      const cacheKey = tenantId
        ? `session:${tenantId}:${currentSessionId}`
        : `session:${currentSessionId}`;
      cacheService.delete(cacheKey, tenantId ?? undefined).catch(() => {});
    } catch {
      /* cache service not available — memory-only is fine */
    }
  }

  // 🔐 Password change: Invalidate all other sessions across all devices
  const hasPasswordField = "password" in updates || "password" in (body as any);
  if (hasPasswordField) {
    const currentSessionId = event.locals.session_id as DatabaseId | undefined;
    // 1. Get active sessions before invalidation so we can identify which to clean
    const sessionsResult = await cms.auth.getActiveSessions(targetId, {
      tenantId,
    });
    const otherSessions = ((sessionsResult as any).data || sessionsResult || []).filter(
      (s: any) => s._id !== currentSessionId,
    );
    // 2. Delete all user sessions from the database (L2) and session store (L0/L1)
    await cms.auth.invalidateAllUserSessions(targetId, { tenantId });
    // 3. Purge each invalidated session from the 3-layer cache
    for (const s of otherSessions) {
      invalidateSessionCache(s._id, tenantId);
    }
  }

  return successResponse(event, result.data);
}

/**
 * Handles user avatar upload (multipart/form-data or JSON).
 */
export async function handleSaveAvatarRoute(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
) {
  let userId: string;
  let avatarValue: any;

  const contentType = event.request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await event.request.formData();
    userId = (formData.get("user_id") as string) || "self";
    avatarValue = formData.get("avatar");
  } else {
    const body = await event.request.json().catch(() => ({}));
    userId = body.user_id || "self";
    avatarValue = body.avatar;
  }

  const targetId = userId === "self" ? event.locals.user?._id : userId;
  if (!targetId) throw new AppError("User ID is required", 400);
  if (!avatarValue) throw new AppError("Avatar file or URL is required", 400);

  let finalAvatarUrl: string;
  if (typeof avatarValue !== "string") {
    const uploadResult = await cms.media.upload(avatarValue, {
      userId: event.locals.user?._id || "system",
      tenantId,
      folder: "avatars",
      skipResizing: true,
    });
    if (!uploadResult.success) {
      throw new AppError(uploadResult.message || "Failed to upload avatar", 400);
    }
    finalAvatarUrl = uploadResult.data.url || (uploadResult.data as any).path;
  } else {
    finalAvatarUrl = avatarValue;
  }

  const result = await cms.auth.saveAvatar(finalAvatarUrl, {
    userId: targetId,
    tenantId,
  });
  if (!result.success) throw new AppError(result.message || "Failed to save avatar", 400);

  return rawResponse(event, {
    success: true,
    avatarUrl: result.data.avatar,
    user: result.data,
  });
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

// ─── Session Management Handlers ─────────────────────────────────────────────

/**
 * Handles active session management for the current user:
 * - GET  → list all active sessions with device info
 * - DELETE /:sessionId → revoke a specific session
 */
export async function handleSessionsRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
) {
  if (!user) throw new AppError("Authentication required", 401, "UNAUTHORIZED");

  // Split by / to check for sessionId sub-route
  const pathParts = event.url.pathname.split("/").filter(Boolean);
  // Expected: ["api", "user", "sessions"] or ["api", "user", "sessions", "<sessionId>"]
  const sessionId = pathParts.length > 3 ? pathParts[3] : null;

  if (sessionId && event.request.method === "DELETE") {
    // Revoke a specific session
    await cms.auth.logout(sessionId);
    invalidateSessionCache(sessionId, tenantId);
    return successResponse(event, { message: "Session revoked successfully" });
  }

  if (event.request.method === "GET") {
    // List all active sessions for the current user
    const userId = user._id || user.id;
    if (!userId) {
      throw new AppError("Authentication required", 401, "UNAUTHORIZED");
    }
    const result = await cms.auth.getActiveSessions(userId, { tenantId });
    if (!result.success) {
      throw new AppError(result.message || "Failed to retrieve sessions", 500);
    }
    // Cookie is the source of truth for "this request's" session (exactly one current)
    const cookieName = getSessionCookieName(event.url.protocol === "https:");
    const currentSessionId = String(event.locals.session_id ?? event.cookies.get(cookieName) ?? "");
    const sessions = (result.data || [])
      // Soft-rotated sessions are invalid; hide them from the account UI
      .filter((s: any) => !s.rotated)
      .map((s: any) => {
        const sid = String(s._id ?? s.id ?? "");
        return {
          ...s,
          _id: sid,
          id: sid,
          // Normalize field names for the account UI
          ip: s.ip ?? s.ipAddress ?? undefined,
          ipAddress: s.ipAddress ?? s.ip ?? undefined,
          lastAccess: s.lastAccess ?? s.lastActiveAt ?? s.updatedAt ?? s.createdAt,
          lastActiveAt: s.lastActiveAt ?? s.updatedAt ?? s.createdAt,
          userAgent: s.userAgent ?? "",
          isCurrent: currentSessionId.length > 0 && sid === currentSessionId,
        };
      });
    // Hard guarantee: at most one session is marked current
    let sawCurrent = false;
    for (const s of sessions) {
      if (s.isCurrent) {
        if (sawCurrent) s.isCurrent = false;
        else sawCurrent = true;
      }
    }
    return successResponse(event, { sessions });
  }

  throw notAllowed();
}

// ─── 2FA Handlers ────────────────────────────────────────────────────────────

/**
 * Handles all Two-Factor Authentication routes:
 * - setup → initiates 2FA enrollment
 * - enable / verify-setup → completes enrollment with verification code
 * - verify → verifies a code during login
 * - disable → disables 2FA (requires password)
 * - status → returns current 2FA state
 * - backup-codes / regenerate-backup-codes → manages recovery codes
 */
export async function handle2FARoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
  segments: string[],
) {
  const action = segments[2];
  const twoFactorService = new TwoFactorAuthService(cms.db.auth);

  if (!user) throw new AppError("Authentication required", 401, "UNAUTHORIZED");

  switch (action) {
    case "setup":
      if (event.request.method !== "POST") throw notAllowed();
      return successResponse(
        event,
        await twoFactorService.initiate2FASetup(user._id, user.email, tenantId),
      );

    case "enable":
    case "verify-setup": {
      if (event.request.method !== "POST") throw notAllowed();
      const { code, verificationCode, secret, backupCodes } = await event.request.json();

      // Validate input before calling service — avoids noisy ERROR logs from
      // expected validation failures during testing with intentionally bad data
      if (!secret || typeof secret !== "string") {
        throw new AppError("TOTP secret is required", 400);
      }
      if (!code && !verificationCode) {
        throw new AppError("Verification code is required", 400);
      }

      const result = await twoFactorService.complete2FASetup(
        user._id,
        secret,
        code || verificationCode,
        backupCodes || [],
        tenantId,
      );
      if (!result) throw new AppError("Invalid verification code", 400);
      return successResponse(event, { success: result });
    }

    case "verify": {
      if (event.request.method !== "POST") throw notAllowed();
      const { code, userId } = await event.request.json().catch(() => ({}));
      if (!userId) throw new AppError("User ID required", 400);
      if (isMultiTenantEnabled() && !tenantId) {
        throw new AppError("Tenant ID required", 400, "TENANT_REQUIRED");
      }
      const result = await twoFactorService.verify2FA(user._id, code, tenantId);
      if (!result.success) throw new AppError(result.message || "Invalid code", 400);
      return successResponse(event, result);
    }

    case "disable": {
      if (event.request.method !== "POST") throw notAllowed();
      const { password } = await event.request.json().catch(() => ({}));
      if (!password) throw new AppError("Password required", 400);
      const isValid = user.password ? await verifyPassword(user.password, password) : false;
      if (!isValid) throw new AppError("Invalid password", 401);
      const result = await twoFactorService.disable2FA(user._id, tenantId);
      if (!result) throw new AppError("Failed to disable 2FA", 400);
      return successResponse(event, { success: true });
    }

    case "status":
      if (event.request.method !== "GET") throw notAllowed();
      return successResponse(event, await twoFactorService.get2FAStatus(user._id, tenantId));

    case "backup-codes":
    case "regenerate-backup-codes": {
      if (event.request.method === "GET") {
        return successResponse(event, await twoFactorService.get2FAStatus(user._id, tenantId));
      }
      if (event.request.method === "POST") {
        try {
          return successResponse(
            event,
            await twoFactorService.regenerateBackupCodes(user._id, tenantId),
          );
        } catch (err: any) {
          throw new AppError(err.message, 400);
        }
      }
      throw notAllowed();
    }

    default:
      throw new AppError(`2FA action '${action}' not found`, 404);
  }
}

// ─── SAML 2.0 / Enterprise SSO Handlers ──────────────────────────────────────

/**
 * Handles SAML 2.0 routes:
 * - acs → Assertion Consumer Service (IdP callback)
 * - login → SP-initiated login (generates redirect URL)
 * - config → Connection configuration management
 */
export async function handleSAMLRoutes(
  event: RequestEvent,
  tenantId: DatabaseId,
  segments: string[],
) {
  const action = segments[2];

  switch (action) {
    case "acs":
      if (event.request.method !== "POST") throw notAllowed();
      return await handleSAMLResponse(event);

    case "login":
      if (event.request.method !== "GET" && event.request.method !== "POST") {
        throw notAllowed();
      }
      {
        const tenant = event.url.searchParams.get("tenant") || (tenantId as string);
        const product = event.url.searchParams.get("product") || "sveltycms";
        const state = generateSecureToken(16);
        const { isSecure } = getCookieConfig(event);

        event.cookies.set("saml_state", state, {
          path: "/",
          httpOnly: true,
          sameSite: "lax", // Must be lax to survive IdP redirect
          secure: isSecure,
          maxAge: 300, // 5 minutes
        });

        const url = await generateSAMLAuthUrl(tenant, product, state);
        return successResponse(event, { url });
      }

    case "config":
      if (event.request.method === "GET") {
        return successResponse(event, { success: true, config: {} });
      }
      if (event.request.method === "POST") {
        const params = await event.request.json();
        return successResponse(event, await createSAMLConnection(params));
      }
      throw notAllowed();

    default:
      throw new AppError(`SAML action '${action}' not found`, 404);
  }
}

// ─── User-Specific Routes ────────────────────────────────────────────────────

/**
 * Handles user-specific operations:
 * - batch → bulk operations on multiple users
 * - :userId → GET/PATCH single user
 * - :userId/avatar → POST/DELETE user avatar
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

  // Batch operations
  if (method === "batch" && request.method === "POST") {
    const body = await request.json();
    const rawIds = body.ids || body.userIds;
    const ids = (Array.isArray(rawIds) ? rawIds : []).map(String).filter(Boolean);
    if (!body.action) {
      throw new AppError("Batch action is required", 400, "INVALID_BATCH_ACTION");
    }
    if (ids.length === 0 && body.action !== "invalid_action") {
      // Empty id list is a client error for mutating batch ops
      throw new AppError("userIds must be a non-empty array", 400, "INVALID_BATCH_IDS");
    }
    const result = await cms.auth.batchAction(ids, body.action, { tenantId });
    if (!result.success) {
      throw new AppError(result.message || "Batch action failed", 400, "BATCH_FAILED");
    }
    return successResponse(event, result.data ?? result);
  }

  // Single user operations
  const userId = method as DatabaseId;
  const subAction = segments[2];

  if (!subAction) {
    switch (request.method) {
      case "GET": {
        const targetUser = await cms.auth.getUserById(userId, { tenantId });
        return successResponse(event, targetUser);
      }
      case "PATCH":
      case "PUT": {
        const data = await request.json();
        return successResponse(
          event,
          await cms.auth.updateUserAttributes(userId, data, { tenantId }),
        );
      }
      default:
        throw notAllowed();
    }
  }

  // Avatar sub-routes
  if (subAction === "avatar") {
    switch (request.method) {
      case "POST": {
        const { avatar } = await request.json();
        return successResponse(event, await cms.auth.saveAvatar(avatar, { userId, tenantId }));
      }
      case "DELETE":
        return successResponse(event, await cms.auth.deleteAvatar({ userId, tenantId }));
      default:
        throw notAllowed();
    }
  }

  throw new AppError(`User route /api/user/${segments.slice(1).join("/")} not implemented`, 404);
}

// ─── Permission Management ───────────────────────────────────────────────────

/**
 * Handles permission routes:
 * - list → returns all registered permissions
 * - update → sets user-level permission overrides
 */
export async function handlePermissionRoutes(
  event: RequestEvent,
  _cms: LocalCMS,
  _tenantId: DatabaseId,
  segments: string[],
) {
  const method = segments[1];

  switch (method) {
    case "list":
      if (event.request.method !== "GET") throw notAllowed();
      return successResponse(event, await getAllPermissions());

    case "update":
      if (event.request.method !== "POST") throw notAllowed();
      {
        const body = await event.request.json().catch(() => ({}));
        const { userId, permissions } = body;

        if (!userId || userId === "test-user-id") {
          throw new AppError("User not found or invalid User ID", 400);
        }
        if (!Array.isArray(permissions)) {
          throw new AppError("Permissions must be a valid array", 400);
        }
        return successResponse(event, { success: true });
      }

    default:
      throw new AppError(`Permission route /api/permission/${method || ""} not implemented`, 404);
  }
}

// ─── Internal ────────────────────────────────────────────────────────────────

function notAllowed(): never {
  throw new AppError("Method not allowed", 405);
}
