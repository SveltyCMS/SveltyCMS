/**
 * @file src/routes/login/+page.server.ts
 * @description Server-side logic for the login page.
 *
 * ### Features
 * - User authentication and authorization
 * - Invite-token based registration (mandatory except in open multi-tenant demo mode)
 * - Google OAuth support with invite-token threading
 * - Rate limiting per IP, IP+UA and cookie
 * - 2FA verification flow
 * - Forgot / reset password flows
 * - Demo mode: open signup only when MULTI_TENANT + DEMO are both active
 * - Cached database health checks (30s TTL) to avoid hammering the DB
 * - User-enumeration-safe password reset flow
 */

import fs from "node:fs/promises";
import path from "node:path";
// Auth
import { generateGoogleAuthUrl, googleAuth } from "@src/databases/auth/google-auth";
import { generateGithubAuthUrl } from "@src/databases/auth/github-auth";
import type { User } from "@src/databases/auth/types";
import { auth, dbInitPromise } from "@src/databases/db";
// Cache invalidation
import { invalidateUserCountCache } from "@src/hooks/handle-authorization";
import { isHttpError, isRedirect, type Actions, type Cookies, fail, redirect } from "@sveltejs/kit";
// valibot schemas
import {
  forgotFormSchema,
  loginFormSchema,
  resetFormSchema,
  signUpFormSchema,
} from "@utils/schemas";
import { invalidateSetupCache } from "@utils/setup-check";
// Rate Limiter
import { RateLimiter } from "sveltekit-rate-limiter/server";
import { flatten, safeParse } from "valibot";
import { dev } from "$app/environment";
import type { PageServerLoad } from "./$types";

// Content Manager for redirects
import { contentSystem } from "@src/content/index.server";
// Utils
import type { ISODateString, DatabaseId } from "@src/content/types";
// Stores
import type { Locale } from "@src/paraglide/runtime";
import { getPrivateSettingSync } from "@src/services/core/settings-service";
// Tenant Service
import { tenantService } from "@src/services/core/tenant-service";
import { publicEnv } from "@src/stores/global-settings.svelte";
import { app } from "@src/stores/store.svelte";
// System Logger
import { logger } from "@utils/logger";
// Email Utility
import { sendMail } from "@utils/email.server";
import { getCachedFirstCollectionPath } from "@utils/server/collection-utils.server";
import { getClientIp } from "@utils/hook-utils";
import type { RequestEvent } from "@sveltejs/kit";
// Security — static imports to avoid cold-start disk I/O on the login path
import { auditLogService, AuditEventType } from "@src/services/security/audit-service";
import { hash, verify } from "argon2";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Pre-computed dummy argon2 hash for timing-attack mitigation.
 *  Generated once at module load. On user-not-found paths we run a
 *  verify against this hash to prevent email-enumeration via timing. */
const DUMMY_ARGON2_HASH = (() => {
  try {
    // Fast low-memory hash — only used for timing padding, not stored anywhere
    return hash("dummy-password-for-timing-defense");
  } catch {
    return Promise.resolve("$argon2id$dummy");
  }
})();

/** Timeout when polling for the auth service to become ready. */
const AUTH_SERVICE_TIMEOUT_MS = 10_000;

/** Session lifetime for all sign-in paths (password, token, OAuth, post-2FA). */
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1_000; // 7 days

/** How long to trust the result of a database health check before re-querying. */
const DB_HEALTH_CACHE_TTL_MS = 30_000; // 30 seconds

// ---------------------------------------------------------------------------
// Rate limiter
// ---------------------------------------------------------------------------

const rateLimitSecret =
  getPrivateSettingSync("RATE_LIMIT_SECRET") ||
  getPrivateSettingSync("JWT_SECRET_KEY") + "-ratelimit";

const limiter = new RateLimiter({
  IP: [200, "h"],
  IPUA: [100, "m"],
  cookie: {
    name: "ratelimit",
    secret: rateLimitSecret as string,
    rate: [50, "m"],
    preflight: true,
  },
});

// ---------------------------------------------------------------------------
// Password helpers
// ---------------------------------------------------------------------------

const MIN_PASSWORD_LENGTH = publicEnv.PASSWORD_MIN_LENGTH || 8;
const YELLOW_LENGTH = MIN_PASSWORD_LENGTH + 3;
const GREEN_LENGTH = YELLOW_LENGTH + 4;

function calculatePasswordStrength(password: string): number {
  if (password.length >= GREEN_LENGTH) return 3;
  if (password.length >= YELLOW_LENGTH) return 2;
  if (password.length >= MIN_PASSWORD_LENGTH) return 1;
  return 0;
}

// ---------------------------------------------------------------------------
// Language helper — replaces ~5 lines duplicated in every action
// ---------------------------------------------------------------------------

/**
 * Resolve a validated locale from the current system language store, falling
 * back to BASE_LOCALE when the stored value is absent or unsupported.
 */
function getUserLanguage(): Locale {
  const langFromStore = app.systemLanguage as Locale | null;
  const supportedLocales = (publicEnv.LOCALES || [publicEnv.BASE_LOCALE || "en"]) as Locale[];
  return langFromStore && supportedLocales.includes(langFromStore)
    ? langFromStore
    : (publicEnv.BASE_LOCALE as Locale) || "en";
}

// ---------------------------------------------------------------------------
// Database health check (with short-lived module-level cache)
// ---------------------------------------------------------------------------

/** Cached result of the last database health check. */
let _dbHealthCache: {
  healthy: boolean;
  reason?: string;
  timestamp: number;
} | null = null;

/**
 * Verifies the database is reachable and seeded (roles exist).
 * Results are cached for DB_HEALTH_CACHE_TTL_MS to avoid hammering the DB on
 * every login page load.
 */
async function checkDatabaseHealth(): Promise<{
  healthy: boolean;
  reason?: string;
}> {
  const now = Date.now();
  if (_dbHealthCache && now - _dbHealthCache.timestamp < DB_HEALTH_CACHE_TTL_MS) {
    return { healthy: _dbHealthCache.healthy, reason: _dbHealthCache.reason };
  }

  try {
    const { getSystemState, isServiceHealthy } = await import("@src/stores/system/state.svelte");
    const systemState = getSystemState();

    if (!isServiceHealthy("database")) {
      const dbStatus = systemState.services.database;
      const reason = dbStatus.message || dbStatus.error || "Database service is unhealthy";
      _dbHealthCache = { healthy: false, reason, timestamp: now };
      return { healthy: false, reason };
    }

    if (systemState.overallState === "FAILED") {
      const lastFailure = systemState.performanceMetrics.stateTransitions
        .slice()
        .reverse()
        .find((t) => t.to === "FAILED");
      if (lastFailure?.reason) {
        _dbHealthCache = {
          healthy: false,
          reason: lastFailure.reason,
          timestamp: now,
        };
        return { healthy: false, reason: lastFailure.reason };
      }
    }

    await dbInitPromise;

    const { auth } = await import("@src/databases/db");
    if (!auth) {
      const reason = "Authentication service not initialized";
      _dbHealthCache = { healthy: false, reason, timestamp: now };
      return { healthy: false, reason };
    }

    // Lightweight COUNT probe — avoids fetching all role rows just to check existence
    const roleCount: number = await (auth as any).getRoleCount?.({
      bypassTenantCheck: true,
    });
    if (!roleCount) {
      const reason = "Database is empty — no roles found. Setup may not have completed.";
      _dbHealthCache = { healthy: false, reason, timestamp: now };
      return { healthy: false, reason };
    }

    _dbHealthCache = { healthy: true, timestamp: now };
    return { healthy: true };
  } catch (error) {
    const reason = `Database connection error: ${error instanceof Error ? error.message : String(error)}`;
    _dbHealthCache = { healthy: false, reason, timestamp: now };
    return { healthy: false, reason };
  }
}

// ---------------------------------------------------------------------------
// Auth service readiness poller
// ---------------------------------------------------------------------------

async function waitForAuthService(maxWaitMs = AUTH_SERVICE_TIMEOUT_MS): Promise<boolean> {
  const startTime = Date.now();
  logger.debug(`Waiting for auth service (timeout: ${maxWaitMs}ms)…`);

  while (Date.now() - startTime < maxWaitMs) {
    try {
      if (dbInitPromise) {
        const dbStatus = await Promise.race([
          dbInitPromise.then(() => "ready" as const),
          new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 100)),
        ]);
        if (dbStatus === "timeout") {
          logger.debug("Database initialisation still in progress…");
        }
      }

      if (auth && typeof auth.validateSession === "function") {
        logger.debug(`Auth service ready after ${Date.now() - startTime}ms`);
        return true;
      }

      const elapsed = Date.now() - startTime;
      if (elapsed % 5_000 < 100) {
        logger.debug(`Auth service not ready yet — elapsed: ${elapsed}ms`);
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      logger.error(
        `Error while waiting for auth service: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  logger.error(`Auth service not ready after ${maxWaitMs}ms timeout`);
  return false;
}

// ---------------------------------------------------------------------------
// OAuth availability helper
// ---------------------------------------------------------------------------

async function shouldShowGoogleOAuth(hasInviteToken: boolean): Promise<boolean> {
  const { getPrivateSettingSync } = await import("@src/services/core/settings-service");
  if (!getPrivateSettingSync("GOOGLE_CLIENT_ID")) return false;
  if (hasInviteToken) return true;

  try {
    await dbInitPromise;
    if (!auth) {
      logger.warn("Auth service not available for OAuth check");
      return false;
    }
    return true;
  } catch (error) {
    logger.error("Error checking OAuth availability:", error);
    return true; // Fail open to allow login attempts
  }
}

async function shouldShowGithubOAuth(hasInviteToken: boolean): Promise<boolean> {
  const { getPrivateSettingSync } = await import("@src/services/core/settings-service");
  if (!getPrivateSettingSync("GITHUB_CLIENT_ID")) return false;
  if (hasInviteToken) return true;

  try {
    await dbInitPromise;
    if (!auth) {
      logger.warn("Auth service not available for OAuth check");
      return false;
    }
    return true;
  } catch (error) {
    logger.error("Error checking OAuth availability:", error);
    return true; // Fail open to allow login attempts
  }
}

// ---------------------------------------------------------------------------
// Session cookie helper
// ---------------------------------------------------------------------------

async function createSessionAndSetCookie(userId: DatabaseId, cookies: Cookies): Promise<void> {
  if (!auth) throw new Error("Auth service is not initialised when creating session.");

  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const session = await auth.createSession({
    user_id: userId,
    expires: expiresAt.toISOString() as ISODateString,
  });
  logger.debug(`Session created: ${session._id} for user ${userId}`);

  const sessionCookie = auth.createSessionCookie(session._id as DatabaseId);
  cookies.set(sessionCookie.name, sessionCookie.value, {
    ...(sessionCookie.attributes as Record<string, unknown>),
    path: "/",
  });
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

export const load: PageServerLoad = async ({ url, cookies, fetch, request, locals }) => {
  // Resolve these once — used in multiple code paths below
  const demoMode = getPrivateSettingSync("DEMO");
  const multiTenant = getPrivateSettingSync("MULTI_TENANT");
  const userLanguage = getUserLanguage();

  /**
   * isOpenSignup — when true the registration token field is suppressed on
   * the client and the server skips token validation (demo multi-tenant mode).
   * Exported to the client so SignUp.svelte can make the same decision.
   */
  const isOpenSignup = !!(multiTenant && demoMode);

  // Shared early-return shape so every branch stays consistent.
  const errorDefaults = {
    firstUserExists: true,
    showGoogleOAuth: false,
    showGithubOAuth: false,
    hasExistingOAuthUsers: false,
    isOpenSignup,
    loginForm: {},
    forgotForm: {},
    resetForm: {},
    signUpForm: {},
    demoMode,
  } as const;

  try {
    const { getSystemState } = await import("@src/stores/system/state.svelte");
    const systemState = getSystemState();

    // If system is FAILED, surface a detailed error immediately.
    if (systemState.overallState === "FAILED") {
      logger.error("System is in FAILED state — cannot proceed with login");
      const lastFailure = systemState.performanceMetrics.stateTransitions
        .slice()
        .reverse()
        .find((t) => t.to === "FAILED");

      return {
        ...errorDefaults,
        showDatabaseError: true,
        authNotReady: true,
        errorReason:
          lastFailure?.reason ||
          "System initialisation failed. Check the database connection and configuration.",
        authNotReadyMessage:
          lastFailure?.reason ||
          "System initialisation failed. Check the database connection and configuration.",
        canReset: true,
      };
    }

    await dbInitPromise;

    const dbHealth = await checkDatabaseHealth();
    if (!dbHealth.healthy) {
      logger.error(`Database health check failed: ${dbHealth.reason}`);
      return {
        ...errorDefaults,
        showDatabaseError: true,
        authNotReady: true,
        errorReason: dbHealth.reason,
        authNotReadyMessage: dbHealth.reason,
        canReset: true,
      };
    }

    const authReady = await waitForAuthService();
    if (!(authReady && auth)) {
      logger.warn("Authentication system not ready — checking whether database is empty");

      const { isSetupCompleteAsync } = await import("@utils/setup-check");
      const setupComplete = await isSetupCompleteAsync();

      if (!setupComplete) {
        logger.error(
          "Database is empty but config exists — database may have been dropped manually.",
        );
        return {
          ...errorDefaults,
          authNotReady: true,
          authNotReadyMessage:
            "Database is empty. Please restore from backup or delete config/private.ts to run setup again.",
        };
      }

      return {
        ...errorDefaults,
        authNotReady: true,
        authNotReadyMessage: "System is still initialising. Please wait a moment and try again.",
      };
    }

    if (!locals) locals = {} as App.Locals;

    // Already authenticated — redirect to the first collection.
    if (locals.user) {
      logger.debug("User already authenticated — redirecting");
      let finalCollectionPath: string | null = null;
      try {
        finalCollectionPath = await getCachedFirstCollectionPath(userLanguage);
      } catch {
        throw redirect(302, "/");
      }
      throw redirect(302, finalCollectionPath ?? "/config/collectionbuilder");
    }

    if (limiter.cookieLimiter?.preflight) {
      await limiter.cookieLimiter.preflight({ request, cookies } as any);
    }

    // --- Invite flow ---
    const inviteToken = url.searchParams.get("invite_token");
    if (inviteToken) {
      const tokenData = await auth.validateRegistrationToken(inviteToken);

      if (tokenData.isValid && tokenData.details) {
        logger.info("Valid invite token detected — preparing invite signup form.");
        return {
          ...errorDefaults,
          firstUserExists: locals.isFirstUser === false,
          showGoogleOAuth: await shouldShowGoogleOAuth(true),
          showGithubOAuth: await shouldShowGithubOAuth(true),
          isInviteFlow: true,
          token: inviteToken,
          invitedEmail: tokenData.details.email,
          roleId: tokenData.details.role,
        };
      }

      // Invalid / expired token — allow form access with pre-filled token so the
      // user can see what went wrong rather than hitting a blank wall.
      logger.warn("Invalid invite token — allowing form access with pre-filled token.");
      return {
        ...errorDefaults,
        firstUserExists: locals.isFirstUser === false,
        showGoogleOAuth: await shouldShowGoogleOAuth(true),
        showGithubOAuth: await shouldShowGithubOAuth(true),
        inviteError:
          "This invitation token appears to be invalid, expired, or already used. Please check with your administrator or enter a different token.",
        signUpForm: { token: inviteToken },
      };
    }

    const firstUserExists = locals.isFirstUser === false;
    logger.debug(`firstUserExists: ${firstUserExists} (locals.isFirstUser: ${locals.isFirstUser})`);

    // --- Google OAuth callback ---
    const code = url.searchParams.get("code");
    if (publicEnv.USE_GOOGLE_OAUTH && code) {
      logger.debug("Entering Google OAuth callback flow");
      try {
        const googleAuthInstance = await googleAuth();
        if (!googleAuthInstance) throw new Error("Google OAuth client is not initialised");

        const { tokens } = await googleAuthInstance.getToken(code);
        if (!tokens) throw new Error("Failed to retrieve Google OAuth tokens.");
        googleAuthInstance.setCredentials(tokens);

        const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        if (!userInfoResponse.ok) throw new Error("Failed to retrieve Google user information.");
        const googleUser = await userInfoResponse.json();
        // Log only non-PII fields (GDPR: full name, email, picture are PII)
        logger.debug("Google OAuth user authenticated", {
          sub: googleUser.sub,
        });

        const { verifyOAuthState } = await import("@src/databases/auth/google-auth");
        const stateParam = url.searchParams.get("state");
        const oauthInviteToken = verifyOAuthState(stateParam);

        if (stateParam && !oauthInviteToken) {
          throw new Error("Invalid or tampered OAuth state parameter.");
        }
        if (!auth) throw new Error("Auth service is not initialised");

        const getUser = async (): Promise<[User | null, boolean]> => {
          const email = googleUser.email;
          if (!email) throw new Error("Google did not return an email address.");

          const existingUser = await auth?.checkUser({ email });
          if (existingUser) return [existingUser, false];

          if (!oauthInviteToken) {
            logger.warn("OAuth registration attempt without invite token in state");
            return [null, false];
          }

          const tokenData: any = await auth?.validateRegistrationToken(oauthInviteToken);
          if (!(tokenData.isValid && tokenData.details)) {
            logger.warn("Invalid/expired invite token in OAuth registration");
            return [null, false];
          }

          if (tokenData.details.email.toLowerCase() !== email.toLowerCase()) {
            logger.warn("Invite token email mismatch in OAuth registration", {
              tokenEmail: tokenData.details.email,
              googleEmail: email,
            });
            return [null, false];
          }

          const roleId = tokenData.details.role || "user";
          const newUser = await auth?.createUser({
            email,
            username: googleUser.name || email.split("@")[0],
            role: roleId,
            permissions: [],
            isRegistered: true,
            lastAuthMethod: "google",
          });

          await auth?.consumeRegistrationToken(oauthInviteToken);
          logger.info(`OAuth: Invited user created: ${newUser?.username}`);

          const hostLink = publicEnv.HOST_PROD || `https://${request.headers.get("host")}`;
          const sitename = publicEnv.SITE_NAME || "SveltyCMS";
          try {
            const mailResult = await sendMail({
              recipientEmail: email,
              subject: `Welcome to ${sitename}`,
              templateName: "welcomeUser",
              props: {
                username: googleUser.name || newUser?.username || "",
                email,
                hostLink,
                sitename,
              },
              languageTag: app.systemLanguage as string,
            });
            if (mailResult.success) {
              logger.info("OAuth: Welcome email sent", { email });
            } else {
              logger.error("OAuth: Failed to send welcome email", {
                email,
                message: mailResult.message,
              });
            }
          } catch (emailError) {
            logger.error("OAuth: Error sending welcome email", {
              email,
              error: emailError,
            });
          }
          return [newUser ?? null, false];
        };

        const [user] = await getUser();
        if (user?._id) {
          await createSessionAndSetCookie(user._id, cookies);
          await auth?.updateUserAttributes(user._id, {
            lastAuthMethod: "google",
          });

          let finalCollectionPath: string | null = null;
          try {
            finalCollectionPath = await getCachedFirstCollectionPath(userLanguage);
          } catch {
            throw redirect(303, "/");
          }
          throw redirect(303, finalCollectionPath ?? "/config/collectionbuilder");
        }

        logger.warn(`OAuth: Processing ended without session for ${googleUser.email}.`);
        return {
          ...errorDefaults,
          firstUserExists,
          showGoogleOAuth: await shouldShowGoogleOAuth(false),
          showGithubOAuth: await shouldShowGithubOAuth(false),
          oauthError:
            "OAuth processing failed. Please try signing in with email or contact support.",
        };
      } catch (oauthError) {
        if (isRedirect(oauthError) || isHttpError(oauthError)) throw oauthError;

        const err = oauthError as Error;
        logger.error(`Error during Google OAuth login: ${err.message}`, {
          stack: err.stack,
        });
        return {
          ...errorDefaults,
          firstUserExists,
          showGoogleOAuth: await shouldShowGoogleOAuth(false),
          showGithubOAuth: await shouldShowGithubOAuth(false),
          oauthError: `OAuth failed: ${err.message}. Please try again or use email login.`,
        };
      }
    }

    // --- Normal login flow ---
    const showGoogleOAuth = await shouldShowGoogleOAuth(false);
    const showGithubOAuth = await shouldShowGithubOAuth(false);
    let hasExistingOAuthUsers = false;
    try {
      if (auth) {
        const count = await auth.getUserCount(undefined, {
          bypassTenantCheck: true,
        });
        hasExistingOAuthUsers = count > 0;
      }
    } catch (error) {
      logger.error("Error checking for existing OAuth users:", error);
    }

    const firstCollectionPath = await getCachedFirstCollectionPath(userLanguage);

    return {
      ...errorDefaults,
      firstUserExists,
      showGoogleOAuth,
      showGithubOAuth,
      hasExistingOAuthUsers,
      pkgVersion: publicEnv.PKG_VERSION || "0.0.0",
      firstCollectionPath,
    };
  } catch (initialError) {
    if (isRedirect(initialError) || isHttpError(initialError)) throw initialError;

    const err =
      initialError instanceof Error
        ? initialError
        : new Error(String(initialError || "Unknown error"));
    logger.error(`Critical error in load: ${err.message}`, {
      stack: err.stack,
    });

    return {
      ...errorDefaults,
      pkgVersion: publicEnv.PKG_VERSION || "0.0.0",
      error: "The login system encountered an unexpected error. Please try again later.",
    };
  }
};

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export const actions: Actions = {
  // -------------------------------------------------------------------------
  // signUp
  // -------------------------------------------------------------------------
  signUp: async (event) => {
    const userLanguage = getUserLanguage();

    const isTestSecurity = event.request.headers.get("x-test-security") === "true";
    if ((process.env.TEST_MODE !== "true" || isTestSecurity) && (await limiter.isLimited(event))) {
      event.setHeaders({ "Retry-After": "60" });
      return fail(429, {
        message: "Too many requests. Please try again later.",
      });
    }

    try {
      await dbInitPromise;
    } catch (error) {
      logger.error("Database initialisation failed for signUp:", error);
      return fail(503, { message: "Database system is not ready." });
    }

    const authReady = await waitForAuthService();
    if (!(authReady && auth)) {
      logger.error("Authentication system not ready for signUp");
      return fail(503, { message: "Authentication system is not ready." });
    }

    const formData = await event.request.formData();
    const form = Object.fromEntries(formData);
    const result = safeParse(signUpFormSchema, form);
    if (!result.success) {
      logger.warn("SignUp form invalid:", { errors: result.issues });
      return fail(400, { form, errors: flatten(result.issues).nested });
    }

    const { email, username, password, token } = result.output;

    const multiTenant = getPrivateSettingSync("MULTI_TENANT");
    const demoMode = getPrivateSettingSync("DEMO");
    let role = "user";
    let isInvited = false;
    let tenantId: string | undefined;
    const isOpenSignup = !!(multiTenant && demoMode);

    // --- Scenario 1: Open multi-tenant demo signup (no token required) ---
    if (isOpenSignup && !token) {
      const MAX_DEMO_TENANTS = 100;
      const tenantCount = await auth.getUserCount({}, { bypassTenantCheck: true });
      if (tenantCount >= MAX_DEMO_TENANTS) {
        return fail(403, {
          message: "Demo system has reached maximum capacity. Please try again later.",
          form,
        });
      }
      role = "admin";
      tenantId = crypto.randomUUID();
      logger.info(`Demo signup — new tenant: ${tenantId}`);
    }
    // --- Scenario 2: Invited user (token mandatory) ---
    else {
      if (!token) {
        return fail(403, {
          message: "A valid invitation is required to create an account.",
          form,
        });
      }

      const tokenData = await auth.validateRegistrationToken(token);
      if (!(tokenData.isValid && tokenData.details)) {
        return fail(403, {
          message: "This invitation is invalid, expired, or has already been used.",
          form,
        });
      }

      // Security: submitted email must match the invitation.
      if (email.toLowerCase() !== tokenData.details.email.toLowerCase()) {
        return fail(403, {
          message: "The provided email does not match the invitation.",
          form,
        });
      }

      role = tokenData.details.role || "user";
      tenantId = tokenData.details.tenantId ?? undefined;
      isInvited = true;
    }

    const isAdminUser = role === "admin";

    // Guard against duplicate accounts.
    try {
      const existingUser = await auth.getUserByEmail({
        email,
        tenantId: tenantId as DatabaseId,
      });
      if (existingUser) {
        logger.warn("SignUp attempt for existing user", { email, tenantId });
        return fail(400, {
          message: "An account with this email already exists. Please sign in instead.",
          form,
        });
      }
    } catch {
      // Non-fatal — database-level constraints will catch actual duplicates.
    }

    try {
      const sessionExpires = new Date(Date.now() + SESSION_DURATION_MS);
      const userAndSessionResult = await auth.createUserAndSession(
        {
          email,
          username,
          password,
          role,
          isAdmin: isAdminUser,
          tenantId: tenantId as DatabaseId,
          isRegistered: true,
          lastAuthMethod: "security",
          lastActiveAt: new Date().toISOString() as ISODateString,
        },
        {
          expires: sessionExpires.toISOString() as ISODateString,
          tenantId: tenantId as DatabaseId,
        },
      );

      if (!(userAndSessionResult.success && userAndSessionResult.data)) {
        const errorMessage =
          !userAndSessionResult.success && "error" in userAndSessionResult
            ? userAndSessionResult.error?.message
            : "Failed to create user and session";
        throw new Error(errorMessage);
      }

      const { user: newUser, session: newSession } = userAndSessionResult.data;

      if (auth && newSession) {
        const sessionCookie = auth.createSessionCookie(newSession._id as DatabaseId);
        event.cookies.set(sessionCookie.name, sessionCookie.value, {
          ...(sessionCookie.attributes as Record<string, unknown>),
          path: "/",
        });
        logger.debug(`Session cookie set for new user: ${newUser._id}`);
      }

      logger.info(`User created via ${isInvited ? "token" : "open demo"} registration`, {
        userId: newUser._id,
        sessionId: newSession._id,
        email,
        tenantId: newUser.tenantId,
      });

      invalidateUserCountCache();

      // Create tenant entity for new demo signups.
      if (multiTenant && !token && tenantId) {
        logger.info(`Creating Tenant entity for demo signup: ${tenantId}`);
        try {
          await tenantService.createTenant(username || "My Organisation", newUser._id, tenantId);
        } catch (tenantErr) {
          logger.error("Failed to create Tenant entity after user signup", tenantErr);
        }
      }

      if (isInvited && token) {
        await auth?.consumeRegistrationToken(token);
      }

      // Welcome email — best-effort, never blocks signup.
      try {
        const hostLink = publicEnv.HOST_PROD || `https://${event.request.headers.get("host")}`;
        const sitename = publicEnv.SITE_NAME || "SveltyCMS";
        const mailResult = await sendMail({
          recipientEmail: email,
          subject: `Welcome to ${sitename}`,
          templateName: "welcome-user",
          props: { username: username || email, email, hostLink, sitename },
          languageTag: userLanguage,
        });
        if (mailResult.success) {
          logger.info("Welcome email sent", { email });
        } else {
          logger.error("Failed to send welcome email", {
            email,
            message: mailResult.message,
          });
        }
      } catch (emailError) {
        logger.error("Error sending welcome email", {
          email,
          error: emailError,
        });
      }

      let finalCollectionPath: string | null = null;
      try {
        finalCollectionPath = await getCachedFirstCollectionPath(userLanguage);
      } catch {
        throw redirect(303, "/");
      }
      throw redirect(303, finalCollectionPath ?? "/config/collectionbuilder");
    } catch (error) {
      // SvelteKit redirects and HTTP errors must be re-thrown.
      if (isRedirect(error) || isHttpError(error)) throw error;

      const err = error as Error;
      logger.error("Error during invited user signup", {
        email,
        message: err.message,
        stack: err.stack,
      });
      return fail(500, {
        message: "Failed to create account. Please try again later.",
        form,
      });
    }
  },

  // -------------------------------------------------------------------------
  // signInOAuth
  // -------------------------------------------------------------------------
  signInOAuth: async (event) => {
    if (process.env.TEST_MODE !== "true" && (await limiter.isLimited(event))) {
      event.setHeaders({ "Retry-After": "60" });
      return fail(429, { message: "Too many requests." });
    }
    const inviteToken = event.url.searchParams.get("invite_token");
    const authUrl = await generateGoogleAuthUrl(inviteToken, undefined);
    throw redirect(303, authUrl);
  },

  signInOAuthGithub: async (event) => {
    if (process.env.TEST_MODE !== "true" && (await limiter.isLimited(event))) {
      event.setHeaders({ "Retry-After": "60" });
      return fail(429, { message: "Too many requests." });
    }
    const inviteToken = event.url.searchParams.get("invite_token");
    const authUrl = await generateGithubAuthUrl(inviteToken, undefined);
    throw redirect(303, authUrl);
  },

  // -------------------------------------------------------------------------
  // signIn
  // -------------------------------------------------------------------------
  signIn: async (event) => {
    const userLanguage = getUserLanguage();
    const startTime = performance.now();

    const isTestSecurity = event.request.headers.get("x-test-security") === "true";
    if ((process.env.TEST_MODE !== "true" || isTestSecurity) && (await limiter.isLimited(event))) {
      event.setHeaders({ "Retry-After": "60" });
      return fail(429, {
        message: "Too many requests. Please try again later.",
      });
    }

    try {
      await dbInitPromise;
    } catch (error) {
      logger.error("Database initialisation failed for signIn:", error);
      return fail(503, { message: "Database system is not ready." });
    }

    const authReady = await waitForAuthService();
    if (!(authReady && auth)) {
      logger.error("Authentication system not ready for signIn");
      return fail(503, {
        message: "Authentication system is not ready. Please wait and try again.",
      });
    }

    const formData = await event.request.formData();
    const emailRaw = formData.get("email")?.toString() ?? "";
    const passwordRaw = formData.get("security")?.toString() ?? "";
    const isTokenRaw = formData.get("isToken");
    const isToken = isTokenRaw === "true" || isTokenRaw === "on";
    const form = { email: emailRaw, password: passwordRaw, isToken };

    const result = safeParse(loginFormSchema, form);
    if (!result.success) {
      return fail(400, { form, errors: flatten(result.issues).nested });
    }

    const { email, password } = result.output;
    let redirectPath: string | undefined;

    try {
      const authResult = await signInUser(email, password, isToken, event.cookies, event);

      if (authResult?.requires2FA) {
        logger.debug("2FA required", { userId: authResult.userId });
        return fail(401, {
          requires2FA: true,
          userId: authResult.userId,
          message: "Please enter your 2FA code to continue.",
        });
      }

      if (authResult?.status) {
        let finalCollectionPath: string | null = null;
        try {
          finalCollectionPath = await getCachedFirstCollectionPath(userLanguage);
        } catch {
          throw redirect(303, "/");
        }
        redirectPath = finalCollectionPath ?? "/config/collectionbuilder";
        logger.debug(
          `Login redirect to: ${redirectPath} (${(performance.now() - startTime).toFixed(2)}ms)`,
        );
      } else {
        const errorMessage = authResult?.message || "Invalid credentials or an error occurred.";
        logger.warn("Sign-in failed", { email, errorMessage });
        return fail(401, { message: errorMessage, form });
      }
    } catch (e) {
      if (isRedirect(e) || isHttpError(e)) throw e;
      const err = e as Error;
      logger.error("Unexpected error in signIn", {
        email,
        message: err.message,
        stack: err.stack,
      });
      return fail(500, {
        message: "An unexpected server error occurred.",
        form,
      });
    }

    if (redirectPath) throw redirect(303, redirectPath);
  },

  // -------------------------------------------------------------------------
  // verify2FA
  // -------------------------------------------------------------------------
  verify2FA: async (event) => {
    const userLanguage = getUserLanguage();

    const isTestSecurity = event.request.headers.get("x-test-security") === "true";
    if ((process.env.TEST_MODE !== "true" || isTestSecurity) && (await limiter.isLimited(event))) {
      event.setHeaders({ "Retry-After": "60" });
      return fail(429, {
        message: "Too many requests. Please try again later.",
      });
    }

    try {
      await dbInitPromise;
    } catch (error) {
      logger.error("Database initialisation failed for verify2FA:", error);
      return fail(503, { message: "Database system is not ready." });
    }

    const authReady = await waitForAuthService();
    if (!(authReady && auth)) {
      logger.error("Authentication system not ready for verify2FA");
      return fail(503, { message: "Authentication system is not ready." });
    }

    try {
      const formData = await event.request.formData();
      const userId = formData.get("userId") as string;
      const code = formData.get("code") as string;

      if (!(userId && code)) {
        return fail(400, { message: "Missing required fields." });
      }

      const { getDefaultTwoFactorAuthService } =
        await import("@src/databases/auth/two-factor-auth");
      if (!auth) return fail(500, { message: "Auth service is not initialised" });

      const twoFactorService = getDefaultTwoFactorAuthService(
        auth as unknown as import("@src/databases/db-interface").IAuthAdapter,
      );
      const twoFaResult = await twoFactorService.verify2FA(userId as any, code);
      if (!twoFaResult.success) {
        logger.warn("2FA verification failed", {
          userId,
          reason: twoFaResult.message,
        });
        return fail(400, { message: twoFaResult.message });
      }

      const user = await auth.getUserById(userId as DatabaseId);
      if (!user) {
        logger.error("User not found after successful 2FA", { userId });
        return fail(500, { message: "User not found." });
      }

      await createSessionAndSetCookie(userId as DatabaseId, event.cookies);

      auth
        .updateUserAttributes(userId as DatabaseId, {
          lastAuthMethod: "password+2fa",
          lastActiveAt: new Date().toISOString() as ISODateString,
        })
        .catch((err: any) => {
          logger.error(`Failed to update attributes after 2FA for ${userId}:`, err);
        });

      logger.info(`User logged in with 2FA: ${user.username} (${userId})`);

      let finalCollectionPath: string | null = null;
      try {
        finalCollectionPath = await getCachedFirstCollectionPath(userLanguage);
      } catch {
        throw redirect(303, "/");
      }
      throw redirect(303, finalCollectionPath ?? "/config/collectionbuilder");
    } catch (e) {
      if (isRedirect(e) || isHttpError(e)) throw e;
      const err = e as Error;
      logger.error("Unexpected error in verify2FA", {
        message: err.message,
        stack: err.stack,
      });
      return fail(500, { message: "An unexpected server error occurred." });
    }
  },

  // -------------------------------------------------------------------------
  // forgotPW
  // -------------------------------------------------------------------------
  forgotPW: async (event) => {
    const userLanguage = getUserLanguage();

    if (process.env.TEST_MODE !== "true" && (await limiter.isLimited(event))) {
      event.setHeaders({ "Retry-After": "60" });
      return fail(429, { message: "Too many requests." });
    }

    try {
      await dbInitPromise;
    } catch (error) {
      logger.error("Database initialisation failed for forgotPW:", error);
      return fail(503, { message: "Database system is not ready." });
    }

    const authReady = await waitForAuthService();
    if (!(authReady && auth)) {
      logger.error("Authentication system not ready for forgotPW");
      return fail(503, { message: "Authentication system is not ready." });
    }

    const formData = await event.request.formData();
    const form = Object.fromEntries(formData);
    const result = safeParse(forgotFormSchema, form);
    if (!result.success) {
      return fail(400, { form, errors: flatten(result.issues).nested });
    }

    const email = result.output.email.toLowerCase().trim();

    try {
      const checkMail = await forgotPWCheck(email, event);

      if (checkMail.success && checkMail.token && checkMail.expiresIn) {
        const baseUrl = dev ? publicEnv.HOST_DEV : publicEnv.HOST_PROD;
        const resetLink = `${baseUrl}/login?token=${checkMail.token}&email=${encodeURIComponent(email)}`;
        const sitename = publicEnv.SITE_NAME || "SveltyCMS";

        const mailResult = await sendMail({
          recipientEmail: email,
          subject: `Password Reset Request for ${sitename}`,
          templateName: "forgottenPassword",
          props: {
            email,
            token: checkMail.token,
            expiresIn: checkMail.expiresIn,
            resetLink,
            username: checkMail.username || email,
            sitename,
          },
          languageTag: userLanguage,
        });

        if (mailResult.success) {
          logger.info("Password reset email sent", { email });
        } else {
          logger.warn("Password reset email failed to send", {
            email,
            message: mailResult.message,
          });
        }

        // Return a plain object (not fail()) so result.type === "success" on the client.
        // The ForgotPW component's onResult handler should check for type === "success".
        return {
          message: "If an account exists for that address, a password reset email has been sent.",
          emailSent: mailResult.success,
        };
      }

      logger.warn("Forgot password check failed", {
        email,
        message: checkMail.message,
      });
      // Same generic message regardless of whether the user exists — prevents
      // user-enumeration via differing responses.
      return {
        message: "If an account exists for that address, a password reset email has been sent.",
        emailSent: false,
      };
    } catch (e) {
      if (isRedirect(e) || isHttpError(e)) throw e;
      const err = e as Error;
      logger.error("Error in forgotPW", {
        email,
        message: err.message,
        stack: err.stack,
      });
      return fail(500, {
        message: "An error occurred. Please try again.",
        form,
      });
    }
  },

  // -------------------------------------------------------------------------
  // resetPW
  // -------------------------------------------------------------------------
  resetPW: async (event) => {
    const userLanguage = getUserLanguage();

    if (process.env.TEST_MODE !== "true" && (await limiter.isLimited(event))) {
      event.setHeaders({ "Retry-After": "60" });
      return fail(429, { message: "Too many requests." });
    }

    try {
      await dbInitPromise;
    } catch (error) {
      logger.error("Database initialisation failed for resetPW:", error);
      return fail(503, { message: "Database system is not ready." });
    }

    const authReady = await waitForAuthService();
    if (!(authReady && auth)) {
      logger.error("Authentication system not ready for resetPW");
      return fail(503, { message: "Authentication system is not ready." });
    }

    const formData = await event.request.formData();
    const form = Object.fromEntries(formData);
    const result = safeParse(resetFormSchema, form);
    if (!result.success) {
      return fail(400, { form, errors: flatten(result.issues).nested });
    }

    const { password, token, email } = result.output;

    try {
      const resp = await resetPWCheck(password, token, email, event);
      if (resp.status) {
        const hostLink = publicEnv.HOST_PROD || `https://${event.request.headers.get("host")}`;
        const sitename = publicEnv.SITE_NAME || "SveltyCMS";
        try {
          const mailResult = await sendMail({
            recipientEmail: email,
            subject: `Your ${sitename} Password Has Been Updated`,
            templateName: "updatedPassword",
            props: {
              username: resp.username || email,
              email,
              hostLink,
              sitename,
            },
            languageTag: userLanguage,
          });
          if (mailResult.success) {
            logger.info("Password updated confirmation email sent", { email });
          } else {
            logger.error("Failed to send password updated email", {
              email,
              message: mailResult.message,
            });
          }
        } catch (emailError) {
          logger.error("Error sending password updated confirmation", {
            email,
            error: emailError,
          });
        }
        throw redirect(303, "/login?reset=success");
      }
      logger.warn("Password reset failed", { email, message: resp.message });
      return fail(400, {
        message: resp.message || "Password reset failed. The link may be invalid or expired.",
        form,
      });
    } catch (e) {
      if (isRedirect(e) || isHttpError(e)) throw e;
      const err = e as Error;
      logger.error("Error in resetPW", {
        email,
        message: err.message,
        stack: err.stack,
      });
      return fail(500, {
        message: "An unexpected error occurred during password reset.",
        form,
      });
    }
  },

  // -------------------------------------------------------------------------
  // prefetch
  // -------------------------------------------------------------------------
  prefetch: async () => {
    const userLanguage = getUserLanguage();
    try {
      logger.info(`Collection lookup triggered for language: ${userLanguage}`);
      const firstCollectionSchema = contentSystem.collections.getSmartFirst();
      if (firstCollectionSchema) {
        const collectionInfo = {
          collectionId: firstCollectionSchema._id,
          name: firstCollectionSchema.name,
          path: firstCollectionSchema.path,
        };
        logger.info(`Collection lookup completed: ${collectionInfo.name}`);
        return { success: true, collection: collectionInfo };
      }
      logger.debug("No collection found");
      return { success: false, error: "No collection available" };
    } catch (err) {
      logger.debug("Collection lookup failed:", err);
      return { success: false, error: "Collection lookup failed" };
    }
  },

  // -------------------------------------------------------------------------
  // resetSetup
  // -------------------------------------------------------------------------
  resetSetup: async ({ locals }) => {
    try {
      const { getSystemState } = await import("@src/stores/system/state.svelte");
      const systemState = getSystemState();

      const isAdmin = locals.user?.role === "admin";
      const isSystemFailed = systemState.overallState === "FAILED";
      const isTestMode = process.env.TEST_MODE === "true";
      const dbHealth = await checkDatabaseHealth();
      const isDbUnhealthy = !dbHealth.healthy;

      if (!(isAdmin || isSystemFailed || isTestMode || isDbUnhealthy)) {
        logger.warn("Unauthorised setup reset attempt", {
          userRole: locals.user?.role,
          systemState: systemState.overallState,
          dbHealthy: dbHealth.healthy,
        });
        return fail(403, {
          message: "You do not have permission to reset the setup.",
        });
      }

      if (isTestMode) {
        logger.info("Setup reset: skipping file deletion in TEST_MODE");
      } else {
        const configPath = path.join(process.cwd(), "config", "private.ts");
        try {
          await fs.unlink(configPath);
          logger.info("Setup reset: config/private.ts deleted");
        } catch (fsError: any) {
          if (fsError.code !== "ENOENT") throw fsError;
        }
      }

      // Invalidate the health cache so the next load re-checks cleanly.
      _dbHealthCache = null;
      invalidateSetupCache(true);

      return { success: true, message: "Setup has been reset." };
    } catch (error) {
      logger.error("Failed to reset setup:", error);
      return fail(500, { message: "Failed to reset setup." });
    }
  },
};

// ---------------------------------------------------------------------------
// signInUser helper
// ---------------------------------------------------------------------------

async function signInUser(
  email: string,
  password: string,
  isToken: boolean,
  cookies: Cookies,
  event: RequestEvent,
): Promise<{
  status: boolean;
  message?: string;
  user?: User;
  requires2FA?: boolean;
  userId?: string;
}> {
  logger.debug("signInUser called", { email, isToken });
  if (!auth) {
    logger.error("Auth not initialised for signInUser");
    return { status: false, message: "Authentication system unavailable." };
  }

  try {
    let user: User | null = null;
    let authSuccess = false;

    if (isToken) {
      const tempUser = await auth.checkUser({ email }, { bypassTenantCheck: true });
      if (!tempUser) {
        logger.warn("Token login attempt for non-existent user", { email });
        return { status: false, message: "User does not exist." };
      }
      const result = await auth.consumeToken(password, tempUser._id);
      if (result.status) {
        user = tempUser;
        authSuccess = true;
      } else {
        logger.warn("Token consumption failed", {
          email,
          message: result.message,
        });
        return {
          status: false,
          message: result.message || "Invalid or expired token.",
        };
      }
    } else {
      const authResult = await auth.authenticate(email, password, null, {
        bypassTenantCheck: true,
      });
      if (authResult?.user) {
        user = authResult.user;

        if (user!.is2FAEnabled) {
          logger.debug("2FA required", { userId: user!._id });
          return {
            status: false,
            message: "2FA verification required",
            requires2FA: true,
            userId: user!._id,
          };
        }

        authSuccess = true;
        const sessionCookie = auth.createSessionCookie(authResult.sessionId!);
        cookies.set(sessionCookie.name, sessionCookie.value, {
          ...(sessionCookie.attributes as Record<string, unknown>),
          path: "/",
        });
      } else {
        logger.warn("Password authentication failed", { email });

        // Timing-attack mitigation: when the user doesn't exist, run a dummy
        // argon2 verification to flatten the timing difference between
        // "user not found" (~1ms) and "wrong password" (~300ms).
        DUMMY_ARGON2_HASH.then((dummyHash: string) => verify(dummyHash, password).catch(() => {}));
      }
    }

    if (!(authSuccess && user && user._id)) {
      return {
        status: false,
        message: "Invalid credentials or authentication failed.",
      };
    }

    // Token auth needs a manual session; password auth already set a cookie above.
    if (isToken) {
      await createSessionAndSetCookie(user._id as any, cookies);
    }

    // Fire-and-forget attribute update — does not block the response.
    auth
      .updateUserAttributes(
        user._id as any,
        {
          lastAuthMethod: isToken ? "token" : "security",
          lastActiveAt: new Date().toISOString() as any,
        },
        { bypassTenantCheck: true },
      )
      .catch((err: any) => {
        logger.error(`Failed to update attributes for ${user!._id}:`, err);
      });

    logger.info(`User logged in: ${user.username} (${user._id})`);

    // Audit log (fire-and-forget to avoid blocking login)
    auditLogService
      .log(
        "User logged in successfully",
        { id: user._id as any, email: user.email, ip: getClientIp(event) },
        { type: "user", id: user._id as any },
        AuditEventType.USER_LOGIN,
        "medium",
        { method: isToken ? "token" : "security" },
      )
      .catch((err: any) => logger.error(`Audit log failed for login ${user!._id}:`, err));

    return { status: true, message: "Login successful", user };
  } catch (error) {
    const err = error as Error;
    logger.error("Error in signInUser", {
      email,
      message: err.message,
      stack: err.stack,
    });
    return {
      status: false,
      message: "An internal error occurred during sign-in.",
    };
  }
}

// ---------------------------------------------------------------------------
// forgotPWCheck helper
// ---------------------------------------------------------------------------

interface ForgotPWCheckResult {
  expiresIn?: Date;
  message: string;
  success: boolean;
  token?: string;
  username?: string;
}

async function forgotPWCheck(email: string, event: RequestEvent): Promise<ForgotPWCheckResult> {
  logger.debug("forgotPWCheck called", { email });
  if (!auth) return { success: false, message: "Authentication system unavailable." };

  try {
    const user = await auth.checkUser({ email });
    if (!user?._id) {
      logger.warn("forgotPWCheck: User not found", { email });
      return { success: false, message: "User does not exist." };
    }

    const expiresAt = new Date(Date.now() + 60 * 60 * 1_000); // 1 hour
    const token = await auth.createToken({
      user_id: user._id,
      expires: expiresAt.toISOString() as ISODateString,
      type: "password_reset",
    });
    logger.info("Password reset token created", { email });

    auditLogService
      .log(
        "Password reset requested",
        { id: user._id as any, email: user.email, ip: getClientIp(event) },
        { type: "user", id: user._id as any },
        AuditEventType.PASSWORD_RESET_REQUESTED,
      )
      .catch((err: any) => logger.error("Audit log failed for password reset:", err));

    return {
      success: true,
      message: "Password reset token generated.",
      token,
      expiresIn: expiresAt,
      username: user.username,
    };
  } catch (error) {
    const err = error as Error;
    logger.error("Error in forgotPWCheck", {
      email,
      message: err.message,
      stack: err.stack,
    });
    return {
      success: false,
      message: "An internal error occurred generating the password reset token.",
    };
  }
}

// ---------------------------------------------------------------------------
// resetPWCheck helper
// ---------------------------------------------------------------------------

interface ResetPWResult {
  message?: string;
  status: boolean;
  username?: string;
}

async function resetPWCheck(
  password: string,
  token: string,
  email: string,
  event: RequestEvent,
): Promise<ResetPWResult> {
  logger.debug("resetPWCheck called", { email });
  if (!auth) return { status: false, message: "Authentication system unavailable." };

  try {
    const user = await auth.checkUser({ email });
    if (!user?._id) {
      logger.warn("resetPWCheck: User not found", { email });
      return {
        status: false,
        message: "Invalid or expired reset link (user not found).",
      };
    }

    const validate = await auth.consumeToken(token, user._id, "password_reset");
    if (!validate.status) {
      logger.warn("resetPWCheck: Token consumption failed", {
        email,
        message: validate.message,
      });
      return {
        status: false,
        message: validate.message || "Invalid or expired reset link.",
      };
    }

    if (calculatePasswordStrength(password) < 1) {
      return { status: false, message: "Password is too weak." };
    }

    await auth.invalidateAllUserSessions(user._id);
    const updateResult = await auth.updateUserPassword(email, password);
    if (!updateResult.status) {
      logger.warn("resetPWCheck: Password update failed", {
        email,
        message: updateResult.message,
      });
      return {
        status: false,
        message: updateResult.message || "Failed to update password.",
      };
    }

    logger.info("Password reset successfully", { email });

    auditLogService
      .log(
        "Password reset success",
        { id: user._id as any, email: user.email, ip: getClientIp(event) },
        { type: "user", id: user._id as any },
        AuditEventType.PASSWORD_RESET_SUCCESS,
      )
      .catch((err: any) => logger.error("Audit log failed for password reset success:", err));

    return { status: true, username: user.username };
  } catch (error) {
    const err = error as Error;
    logger.error("Error in resetPWCheck", {
      email,
      message: err.message,
      stack: err.stack,
    });
    return {
      status: false,
      message: "An internal error occurred during password reset.",
    };
  }
}
