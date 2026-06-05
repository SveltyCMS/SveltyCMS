/**
 * @file src/routes/login/+page.server.ts
 * @description Server-side logic for the login page — load function, OAuth, 2FA, recovery, and form action wrappers.
 *
 * Core auth logic lives in auth.remote.ts as type-safe Remote Functions.
 * The form actions below parse formData and delegate to those functions.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { generateGoogleAuthUrl, googleAuth } from "@src/databases/auth/google-auth";
import { generateGithubAuthUrl } from "@src/databases/auth/github-auth";
import { auth, dbInitPromise, shutdownSystem } from "@src/databases/db";
import { isHttpError, isRedirect, type Actions, fail, redirect } from "@sveltejs/kit";
import { invalidateSetupCache } from "@utils/setup-check";
import { RateLimiter } from "sveltekit-rate-limiter/server";
import type { PageServerLoad } from "./$types";
import type { ISODateString, DatabaseId } from "@src/content/types";
import { getPrivateSettingSync } from "@src/services/core/settings-service";
import { publicEnv } from "@src/stores/global-settings.svelte";
import { logger } from "@utils/logger";
import { sendMail } from "@utils/email.server";
import { getCachedFirstCollectionPath } from "@utils/server/collection-utils.server";
import { getSystemState } from "@src/stores/system/state.svelte.ts";
import pkg from "../../../package.json";

// Auth actions delegate to auth.remote.ts
import {
  signIn as signInFn,
  signUp as signUpFn,
  forgotPW as forgotPWFn,
  resetPW as resetPWFn,
  prefetch as prefetchFn,
} from "./auth.remote";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AUTH_SERVICE_TIMEOUT_MS = 10_000;
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;
const DB_HEALTH_CACHE_TTL_MS = 30_000;

const rateLimitSecret = process.env.RATE_LIMIT_SECRET || process.env.JWT_SECRET_KEY + "-ratelimit";

const limiter = new RateLimiter({
  IP: [10, "m"],
  IPUA: [10, "m"],
  cookie: {
    name: "ratelimit",
    secret: rateLimitSecret,
    rate: [10, "m"],
    preflight: true,
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getUserLanguage(): string {
  try {
    const langFromStore = (globalThis as any).__app?.systemLanguage;
    if (langFromStore) return langFromStore;
  } catch {}
  return "en";
}

let _dbHealthCache: {
  healthy: boolean;
  reason?: string;
  timestamp: number;
} | null = null;

async function checkDatabaseHealth(): Promise<{
  healthy: boolean;
  reason?: string;
}> {
  const now = Date.now();
  // Only cache positive results. Negative results are retried to avoid
  // showing the error modal when the boot engine hasn't reported in yet.
  if (_dbHealthCache?.healthy && now - _dbHealthCache.timestamp < DB_HEALTH_CACHE_TTL_MS) {
    return { healthy: true };
  }

  try {
    if (auth && typeof auth.getUserCount === "function") {
      const roleCount = await auth.getUserCount({}, { bypassTenantCheck: true });
      if (roleCount === 0) {
        const reason = "Database is empty — setup may not have completed";
        _dbHealthCache = { healthy: false, reason, timestamp: now };
        return { healthy: false, reason };
      }
      // roleCount > 0 — users exist, DB is healthy
      _dbHealthCache = { healthy: true, timestamp: now };
      return { healthy: true };
    }
    // Auth not ready yet — skip health check, let sign-in form handle it
    _dbHealthCache = { healthy: true, timestamp: now };
    return { healthy: true };
  } catch (err: any) {
    _dbHealthCache = { healthy: false, reason: err.message, timestamp: now };
    return { healthy: false, reason: err.message };
  }
}

async function waitForAuthService(): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < AUTH_SERVICE_TIMEOUT_MS) {
    if (auth && typeof auth.getUserCount === "function") return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return !!(auth && typeof auth.getUserCount === "function");
}

async function shouldShowGoogleOAuth(hasInvite?: boolean): Promise<boolean> {
  if (!getPrivateSettingSync("GOOGLE_CLIENT_ID")) return false;
  if (hasInvite) return true;
  if (!auth || typeof auth.getUserCount !== "function") return false;
  try {
    const count = await auth.getUserCount({}, { bypassTenantCheck: true });
    return count > 0;
  } catch {
    return false;
  }
}

async function shouldShowGithubOAuth(hasInvite?: boolean): Promise<boolean> {
  if (!getPrivateSettingSync("GITHUB_CLIENT_ID")) return false;
  if (hasInvite) return true;
  if (!auth || typeof auth.getUserCount !== "function") return false;
  try {
    const count = await auth.getUserCount({}, { bypassTenantCheck: true });
    return count > 0;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

export const load: PageServerLoad = async ({ url, cookies, fetch, request, locals }) => {
  const demoMode = getPrivateSettingSync("DEMO");
  const multiTenant = getPrivateSettingSync("MULTI_TENANT");
  const userLanguage = getUserLanguage();
  const isOpenSignup = !!(multiTenant && demoMode);

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
    const systemState = getSystemState();

    if (systemState.overallState === "FAILED") {
      const lastFailure = systemState.performanceMetrics.stateTransitions
        .slice()
        .reverse()
        .find((t: any) => t.to === "FAILED");
      return {
        ...errorDefaults,
        showDatabaseError: true,
        authNotReady: true,
        errorReason: lastFailure?.reason || "System initialisation failed.",
        authNotReadyMessage: lastFailure?.reason || "System initialisation failed.",
        canReset: true,
      };
    }

    await dbInitPromise;
    const dbHealth = await checkDatabaseHealth();
    if (!dbHealth.healthy) {
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
      const { isSetupCompleteAsync } = await import("@utils/setup-check");
      const setupComplete = await isSetupCompleteAsync();
      if (!setupComplete) {
        return {
          ...errorDefaults,
          authNotReady: true,
          authNotReadyMessage: "Database is empty. Please run setup.",
        };
      }
      return {
        ...errorDefaults,
        authNotReady: true,
        authNotReadyMessage: "System is still initialising.",
      };
    }

    if (!locals) locals = {} as App.Locals;

    if (locals.user) {
      let finalCollectionPath: string | null = null;
      try {
        finalCollectionPath = await getCachedFirstCollectionPath(userLanguage as any);
      } catch {
        throw redirect(302, "/");
      }
      throw redirect(302, finalCollectionPath ?? "/config/collectionbuilder");
    }

    if (limiter.cookieLimiter?.preflight) {
      await limiter.cookieLimiter.preflight({ request, cookies } as any);
    }

    // Invite flow
    const inviteToken = url.searchParams.get("invite_token");
    if (inviteToken) {
      const tokenData = await auth.validateRegistrationToken(inviteToken);
      if (tokenData.isValid && tokenData.details) {
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
      return {
        ...errorDefaults,
        firstUserExists: locals.isFirstUser === false,
        showGoogleOAuth: await shouldShowGoogleOAuth(true),
        showGithubOAuth: await shouldShowGithubOAuth(true),
        inviteError: "This invitation token appears to be invalid, expired, or already used.",
        signUpForm: { token: inviteToken },
      };
    }

    const firstUserExists = locals.isFirstUser === false;

    // Google OAuth callback
    const code = url.searchParams.get("code");
    if (publicEnv.USE_GOOGLE_OAUTH && code) {
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

        const { verifyOAuthState } = await import("@src/databases/auth/google-auth");
        const stateParam = url.searchParams.get("state");
        const oauthInviteToken = verifyOAuthState(stateParam);
        if (stateParam && !oauthInviteToken)
          throw new Error("Invalid or tampered OAuth state parameter.");
        if (!auth) throw new Error("Auth service is not initialised");

        const email = googleUser.email;
        if (!email) throw new Error("Google did not return an email address.");
        const existingUser = await auth.checkUser({ email });

        if (!existingUser && oauthInviteToken) {
          const tokenData: any = await auth.validateRegistrationToken(oauthInviteToken);
          if (
            tokenData.isValid &&
            tokenData.details &&
            tokenData.details.email.toLowerCase() === email.toLowerCase()
          ) {
            const newUser = await auth.createUser({
              email,
              username: googleUser.name || email.split("@")[0],
              role: tokenData.details.role || "user",
              permissions: [],
              isRegistered: true,
              lastAuthMethod: "google",
            });
            await auth.consumeRegistrationToken(oauthInviteToken);

            const hostLink = publicEnv.HOST_PROD || `https://${request.headers.get("host")}`;
            const sitename = publicEnv.SITE_NAME || "SveltyCMS";
            sendMail({
              recipientEmail: email,
              subject: `Welcome to ${sitename}`,
              templateName: "welcomeUser",
              props: {
                username: googleUser.name || newUser?.username || "",
                email,
                hostLink,
                sitename,
              },
              languageTag: userLanguage,
            }).catch(() => {});
          }
        }

        if (existingUser) {
          const session = await auth.createSession({
            user_id: existingUser._id as DatabaseId,
            expires: new Date(Date.now() + SESSION_DURATION_MS).toISOString() as ISODateString,
          });
          const sessionCookie = auth.createSessionCookie(session._id as DatabaseId);
          cookies.set(sessionCookie.name, sessionCookie.value, {
            ...(sessionCookie.attributes as Record<string, unknown>),
            path: "/",
          });

          auth
            .updateUserAttributes(
              existingUser._id as any,
              {
                lastAuthMethod: "google",
                lastActiveAt: new Date().toISOString() as any,
              },
              { bypassTenantCheck: true },
            )
            .catch(() => {});

          let finalCollectionPath: string | null = null;
          try {
            finalCollectionPath = await getCachedFirstCollectionPath(userLanguage as any);
          } catch {}
          throw redirect(303, finalCollectionPath ?? "/config/collectionbuilder");
        }
      } catch (err: any) {
        if (isRedirect(err)) throw err;
        logger.error("OAuth error:", err.message);
        return {
          ...errorDefaults,
          showGoogleOAuth: await shouldShowGoogleOAuth(),
          showGithubOAuth: await shouldShowGithubOAuth(),
          oauthError: "OAuth authentication failed. Please try again.",
        };
      }
    }

    const showGoogleOAuth = await shouldShowGoogleOAuth();
    const showGithubOAuth = await shouldShowGithubOAuth();

    let firstCollectionPath: string | null = null;
    try {
      firstCollectionPath = await getCachedFirstCollectionPath(userLanguage as any);
    } catch {}

    const pkgVersion = pkg.version;

    return {
      ...errorDefaults,
      firstUserExists,
      showGoogleOAuth,
      showGithubOAuth,
      hasExistingOAuthUsers: false,
      firstCollectionPath,
      pkgVersion,
    };
  } catch (err: any) {
    if (isRedirect(err)) throw err;
    logger.error("Load error:", err.message);
    return { ...errorDefaults, error: err.message };
  }
};

// ---------------------------------------------------------------------------
// Actions (OAuth, 2FA, Recovery — auth actions in auth.server.ts)
// ---------------------------------------------------------------------------

export const actions: Actions = {
  // Auth actions delegate to auth.remote.ts
  signIn: signInFn,
  signUp: signUpFn,
  forgotPW: forgotPWFn,
  resetPW: resetPWFn,
  prefetch: prefetchFn,

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

  verify2FA: async (event) => {
    const isTestSecurity = event.request.headers.get("x-test-security") === "true";
    if ((process.env.TEST_MODE !== "true" || isTestSecurity) && (await limiter.isLimited(event))) {
      event.setHeaders({ "Retry-After": "60" });
      return fail(429, { message: "Too many requests." });
    }
    try {
      await dbInitPromise;
    } catch {
      return fail(503, { message: "Database system is not ready." });
    }
    if (!(await waitForAuthService()) || !auth)
      return fail(503, { message: "Authentication system is not ready." });

    const formData = await event.request.formData();
    const userId = (formData.get("userId") as string) || "";
    const code = (formData.get("code") as string) || "";
    if (!userId || !code) return fail(400, { message: "User ID and code required." });

    const { getDefaultTwoFactorAuthService } = await import("@src/databases/auth/two-factor-auth");
    try {
      const twoFactorService = getDefaultTwoFactorAuthService(auth as any);
      if (!twoFactorService) return fail(503, { message: "2FA service unavailable." });
      const twoFaResult = await twoFactorService.verify2FA(userId as any as DatabaseId, code);
      if (!twoFaResult.success) {
        return fail(400, {
          message: twoFaResult.message || "Invalid 2FA code.",
        });
      }

      const user = await auth.getUserById(userId);
      if (!user) return fail(400, { message: "User not found." });

      const sessionCookie = auth.createSessionCookie(userId as any as DatabaseId);
      event.cookies.set(sessionCookie.name, sessionCookie.value, {
        ...(sessionCookie.attributes as Record<string, unknown>),
        path: "/",
      });

      auth
        .updateUserAttributes(
          userId as any,
          {
            lastAuthMethod: "security",
            lastActiveAt: new Date().toISOString() as any,
          },
          { bypassTenantCheck: true },
        )
        .catch(() => {});

      let finalCollectionPath: string | null = null;
      try {
        finalCollectionPath = await getCachedFirstCollectionPath("en" as any);
      } catch {}
      throw redirect(303, finalCollectionPath ?? "/config/collectionbuilder");
    } catch (err) {
      if (isRedirect(err) || isHttpError(err)) throw err;
      logger.error("2FA verification error:", (err as Error).message);
      return fail(500, { message: "2FA verification failed." });
    }
  },

  resetSetup: async ({ locals }) => {
    try {
      const systemState = getSystemState();

      const isAdmin = locals.user?.role === "admin";
      const isSystemFailed = systemState.overallState === "FAILED";
      const isTestMode = process.env.TEST_MODE === "true";
      const dbHealth = await checkDatabaseHealth();
      const isDbUnhealthy = !dbHealth.healthy;

      if (!(isAdmin || isSystemFailed || isTestMode || isDbUnhealthy)) {
        return fail(403, {
          message: "You do not have permission to reset the setup.",
        });
      }

      if (!isTestMode) {
        const configPath = path.join(process.cwd(), "config", "private.ts");
        try {
          await fs.unlink(configPath);
        } catch (e: any) {
          if (e.code !== "ENOENT") {
            logger.warn(`Could not delete private.ts (${e.code}). Attempting to clear it instead.`);
            try {
              // On Windows, if Vite locks the file, we can sometimes still truncate it
              await fs.writeFile(configPath, "");
            } catch {
              throw e; // throw the original error if both fail
            }
          }
        }
      }

      // Shut down database system completely in memory and clear registries
      try {
        await shutdownSystem();
      } catch (shutdownErr) {
        logger.error("Failed to shutdown database system during setup reset:", shutdownErr);
      }

      _dbHealthCache = null;
      invalidateSetupCache(true);
      return { success: true, message: "Setup has been reset." };
    } catch (error) {
      logger.error("Failed to reset setup:", error);
      return fail(500, { message: "Failed to reset setup." });
    }
  },
};
