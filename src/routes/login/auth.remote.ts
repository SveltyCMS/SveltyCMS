/**
 * @file src/routes/login/auth.remote.ts
 * @description Authentication Remote Functions — callable directly from components.
 *
 * Security preserved: rate limiting, Argon2id, timing-attack mitigation, audit logging.
 */

import { auth, dbInitPromise } from "@src/databases/db";
import { safeParse, flatten } from "valibot";
import {
  loginFormSchema,
  signUpFormSchema,
  forgotFormSchema,
  resetFormSchema,
} from "@utils/schemas";
import { auditLogService, AuditEventType } from "@src/services/security/audit-service";
import { getClientIp } from "@utils/hook-utils";
import { getCachedFirstCollectionPath } from "@utils/server/collection-utils.server";
import { sendMail } from "@utils/email.server";
import { publicEnv } from "@src/stores/global-settings.svelte";
import { getPrivateSettingSync } from "@src/services/core/settings-service";
import { tenantService } from "@src/services/core/tenant-service";
import { invalidateUserCountCache } from "@src/hooks/handle-authorization";
import { logger } from "@utils/logger";
import { redirect, isRedirect } from "@sveltejs/kit";
import type { ISODateString, DatabaseId } from "@src/content/types";
import type { RequestEvent } from "@sveltejs/kit";
import { RateLimiter } from "sveltekit-rate-limiter/server";
import { command, query, getRequestEvent } from "$app/server";

const limiter = new RateLimiter({
  IP: [10, "m"],
  IPUA: [10, "m"],
  cookie: {
    name: "ratelimit",
    secret: (process.env.RATE_LIMIT_SECRET || process.env.JWT_SECRET_KEY + "-ratelimit") as string,
    rate: [10, "m"],
    preflight: true,
  },
});

// ────────────────────────────────────────────────────────────
// SvelteKit Remote Functions (Command / Query wrappers)
// ────────────────────────────────────────────────────────────

export const signIn = command("unchecked", async (data: any) => {
  const event = getRequestEvent();
  try {
    return await signInInternal(event, data);
  } catch (err: any) {
    if (isRedirect(err)) {
      return { success: true, redirectPath: err.location };
    }
    return {
      success: false,
      message: err.message || "Sign in failed",
    };
  }
});

export const signUp = command("unchecked", async (data: any) => {
  const event = getRequestEvent();
  try {
    return await signUpInternal(event, data);
  } catch (err: any) {
    if (isRedirect(err)) {
      return { success: true, redirectPath: err.location };
    }
    return {
      success: false,
      message: err.message || "Sign up failed",
    };
  }
});

export const forgotPW = command("unchecked", async (data: any) => {
  const event = getRequestEvent();
  try {
    return await forgotPWInternal(event, data);
  } catch (err: any) {
    if (isRedirect(err)) {
      return { success: true, redirectPath: err.location };
    }
    return {
      success: false,
      message: err.message || "Failed to process request",
    };
  }
});

export const resetPW = command("unchecked", async (data: any) => {
  const event = getRequestEvent();
  try {
    return await resetPWInternal(event, data);
  } catch (err: any) {
    if (isRedirect(err)) {
      return { success: true, redirectPath: err.location };
    }
    return {
      success: false,
      message: err.message || "Failed to reset password",
    };
  }
});

export const verify2FA = command(
  "unchecked",
  async ({ userId, code }: { userId: string; code: string }) => {
    const event = getRequestEvent();
    await dbInitPromise;
    if (!auth) return { success: false, message: "Authentication system is not ready." };

    if (!userId || !code) return { success: false, message: "User ID and code required." };

    const { getDefaultTwoFactorAuthService } = await import("@src/databases/auth/two-factor-auth");
    const twoFactorService = getDefaultTwoFactorAuthService(auth as any);
    if (!twoFactorService) return { success: false, message: "2FA service unavailable." };

    const twoFaResult = await twoFactorService.verify2FA(userId as any as DatabaseId, code);
    if (!twoFaResult.success) {
      return {
        success: false,
        message: twoFaResult.message || "Invalid 2FA code.",
      };
    }

    const user = await auth.getUserById(userId);
    if (!user) return { success: false, message: "User not found." };

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
          lastActiveAt: new Date().toISOString() as ISODateString,
        },
        { bypassTenantCheck: true },
      )
      .catch(() => {
        logger.debug("2FA verify user attribute update failed silently");
      });

    let finalCollectionPath: string | null = null;
    try {
      finalCollectionPath = await getCachedFirstCollectionPath("en" as any);
    } catch {}

    throw redirect(303, finalCollectionPath ?? "/config/collectionbuilder");
  },
);

export const resetSetup = command("unchecked", async (_payload?: {}) => {
  const { getSystemState } = await import("@src/stores/system/state.svelte.ts");
  const { shutdownSystem } = await import("@src/databases/db");
  const { invalidateSetupCache } = await import("@src/utils/setup-check");
  const { logger } = await import("@utils/logger");
  const event = getRequestEvent();

  const systemState = getSystemState();
  const isAdmin = event.locals.user?.role === "admin";
  const isSystemFailed = systemState.overallState === "FAILED";
  const isTestMode = process.env.TEST_MODE === "true";

  // Database health check: try a simple auth query
  await dbInitPromise;
  let isDbUnhealthy = false;
  try {
    if (auth) {
      await auth.getUserCount({}, { bypassTenantCheck: true });
    } else {
      isDbUnhealthy = true;
    }
  } catch {
    isDbUnhealthy = true;
  }

  if (!(isAdmin || isSystemFailed || isTestMode || isDbUnhealthy)) {
    return {
      success: false,
      message: "You do not have permission to reset the setup.",
    };
  }

  if (!isTestMode) {
    const path = await import("node:path");
    const fs = await import("node:fs/promises");
    const configPath = path.join(process.cwd(), "config", "private.ts");
    try {
      await fs.unlink(configPath);
    } catch (e: any) {
      if (e.code !== "ENOENT") {
        logger.warn(`Could not delete private.ts (${e.code}). Attempting to clear it instead.`);
        try {
          await fs.writeFile(configPath, "");
        } catch {
          throw e;
        }
      }
    }
  }

  try {
    await shutdownSystem();
  } catch (shutdownErr) {
    logger.error("Failed to shutdown database system during setup reset:", shutdownErr);
  }

  invalidateSetupCache(true);
  return { success: true, message: "Setup has been reset." };
});

export const prefetchFirstCollection = query("unchecked", async () => {
  try {
    const path = await getCachedFirstCollectionPath("en" as any);
    if (path)
      return {
        success: true,
        collection: { collectionId: "", name: "", path },
      };
    return { success: false, error: "No collections found" };
  } catch {
    return { success: false, error: "Failed to prefetch" };
  }
});

// For backward compatibility (if imports are exported as prefetchFn)
export const prefetch = prefetchFirstCollection;

// ────────────────────────────────────────────────────────────
// Core Business Logic (Internal helpers)
// ────────────────────────────────────────────────────────────

async function signInInternal(event: RequestEvent, input: any) {
  if (process.env.TEST_MODE !== "true" && (await limiter.isLimited(event))) {
    event.setHeaders({ "Retry-After": "60" });
    return { success: false, message: "Too many requests." };
  }
  await dbInitPromise;
  if (!auth) return { success: false, message: "Authentication system unavailable." };

  const email = input.email as string;
  const password = (input.security || input.password) as string;
  const isToken = input.isToken === true;

  const result = safeParse(loginFormSchema, { email, password, isToken });
  if (!result.success) return { success: false, errors: flatten(result.issues).nested };
  const { email: e, password: p } = result.output;

  let user: any = null;
  let ok = false;

  if (isToken) {
    const tu = await auth.checkUser({ email: e }, { bypassTenantCheck: true });
    if (!tu) {
      const { verify } = await import("argon2");
      await verify("$argon2id$dummy", p).catch(() => {
        logger.debug("Argon2id dummy verify for timing defense failed silently");
      });
      return { success: false, message: "Invalid credentials." };
    }
    const tr = await auth.consumeToken(p, tu._id);
    if (tr.status) {
      user = tu;
      ok = true;
    } else return { success: false, message: tr.message || "Invalid token." };
  } else {
    const ar = await auth.authenticate(e, p, null, { bypassTenantCheck: true });
    if (ar?.user) {
      user = ar.user;
      if (user.is2FAEnabled)
        return {
          success: false,
          requires2FA: true,
          userId: user._id,
          message: "2FA required",
        };
      ok = true;
      const sc = auth.createSessionCookie(ar.sessionId!);
      event.cookies.set(sc.name, sc.value, {
        ...(sc.attributes as Record<string, unknown>),
        path: "/",
      });
      // Prime in-memory session cache so getUserFromSession bypasses sqlite-proxy
      try {
        const { primeSessionMemoryCache } = await import("@src/hooks/handle-authentication");
        primeSessionMemoryCache(ar.sessionId!, user);
        // Also force setup state to COMPLETE so handleAuthentication doesn't short-circuit
        const { invalidateSetupCache } = await import("@src/utils/setup-check");
        invalidateSetupCache(false, true);
      } catch {}
    } else {
      const { verify, hash } = await import("argon2");
      await verify(await hash("dummy-password-for-timing-defense"), p).catch(() => {
        logger.debug("Argon2id dummy hash-verify for timing defense failed silently");
      });
    }
  }

  if (!(ok && user?._id)) return { success: false, message: "Invalid credentials." };

  if (isToken) {
    const s = await auth.createSession({
      user_id: user._id,
      expires: new Date(Date.now() + 86400000).toISOString() as ISODateString,
    });
    const sc = auth.createSessionCookie(s._id);
    event.cookies.set(sc.name, sc.value, {
      ...(sc.attributes as Record<string, unknown>),
      path: "/",
    });
  }

  auth
    .updateUserAttributes(
      user._id,
      {
        lastAuthMethod: isToken ? "token" : "security",
        lastActiveAt: new Date().toISOString(),
      },
      { bypassTenantCheck: true },
    )
    .catch(() => {
      logger.debug("User attribute update after login failed silently");
    });
  auditLogService
    .log(
      "User logged in",
      { id: user._id, email: user.email, ip: getClientIp(event) },
      { type: "user", id: user._id },
      AuditEventType.USER_LOGIN,
      "low",
      { method: isToken ? "token" : "security" },
    )
    .catch(() => {
      logger.debug("Audit log write after login failed silently");
    });

  // Trigger telemetry check in background (non-blocking)
  import("@src/services/observability/telemetry-service")
    .then(({ telemetryService }) => telemetryService.checkUpdateStatus())
    .catch(() => {
      logger.debug("Telemetry background check failed silently");
    });

  const path = await getCachedFirstCollectionPath("en" as any).catch(() => null);
  throw redirect(303, path ?? "/config/collectionbuilder");
}

async function signUpInternal(event: RequestEvent, input: any) {
  if (process.env.TEST_MODE !== "true" && (await limiter.isLimited(event))) {
    event.setHeaders({ "Retry-After": "60" });
    return { success: false, message: "Too many requests." };
  }
  await dbInitPromise;
  if (!auth) return { success: false, message: "Authentication system unavailable." };

  const email = input.email as string;
  const username = input.username as string;
  const password = input.password as string;
  const token = (input.token as string) || null;

  const result = safeParse(signUpFormSchema, {
    email,
    username,
    password,
    token,
  });
  if (!result.success) return { success: false, errors: flatten(result.issues).nested };
  const { email: e, username: u, password: p, token: t } = result.output;

  const mt = getPrivateSettingSync("MULTI_TENANT");
  const dm = getPrivateSettingSync("DEMO");
  const open = !!(mt && dm);
  let role = "user",
    invited = false,
    tid: string | undefined;

  if (open && !t) {
    if ((await auth.getUserCount({}, { bypassTenantCheck: true })) >= 100)
      return { success: false, message: "Demo capacity reached." };
    role = "admin";
    tid = crypto.randomUUID();
  } else {
    if (!t) return { success: false, message: "Invitation required." };
    const td = await auth.validateRegistrationToken(t);
    if (!(td.isValid && td.details)) return { success: false, message: "Invalid invitation." };
    if (e.toLowerCase() !== td.details.email.toLowerCase())
      return { success: false, message: "Email mismatch." };
    role = td.details.role || "user";
    tid = td.details.tenantId;
    invited = true;
  }

  if (await auth.getUserByEmail({ email: e, tenantId: tid as DatabaseId }))
    return { success: false, message: "Account already exists." };

  const ur = await auth.createUserAndSession(
    {
      email: e,
      username: u,
      password: p,
      role,
      isAdmin: role === "admin",
      tenantId: tid as DatabaseId,
      isRegistered: true,
      lastAuthMethod: "security",
      lastActiveAt: new Date().toISOString() as ISODateString,
    },
    {
      expires: new Date(Date.now() + 86400000).toISOString() as ISODateString,
      tenantId: tid as DatabaseId,
    },
  );
  if (!ur.success) return { success: false, message: "Account creation failed." };

  const session = ur.data?.session;
  if (session) {
    const sc = auth.createSessionCookie(session._id);
    event.cookies.set(sc.name, sc.value, {
      ...(sc.attributes as Record<string, unknown>),
      path: "/",
    });
  }

  invalidateUserCountCache();
  if (mt && !t && tid)
    tenantService.createTenant(u || "My Organisation", ur.data.user._id, tid).catch(() => {
      logger.debug("Tenant creation failed silently during signup");
    });
  if (invited && t)
    auth.consumeRegistrationToken(t).catch(() => {
      logger.debug("Registration token consumption failed silently during signup");
    });

  throw redirect(303, "/config/collectionbuilder");
}

async function forgotPWInternal(event: RequestEvent, input: any) {
  if (process.env.TEST_MODE !== "true" && (await limiter.isLimited(event))) {
    event.setHeaders({ "Retry-After": "60" });
    return { success: false, message: "Too many requests." };
  }
  await dbInitPromise;
  if (!auth) return { success: false, message: "Authentication system unavailable." };

  const email = input.email as string;
  const result = safeParse(forgotFormSchema, { email });
  if (!result.success) return { success: false, errors: flatten(result.issues).nested };

  try {
    const user = await auth.checkUser({ email: result.output.email });
    if (user?._id) {
      const exp = new Date(Date.now() + 3600000);
      const token = await auth.createToken({
        user_id: user._id,
        expires: exp.toISOString() as ISODateString,
        type: "password_reset",
      });
      auditLogService
        .log(
          "Password reset requested",
          { id: user._id, email: user.email, ip: getClientIp(event) },
          { type: "user", id: user._id },
          AuditEventType.PASSWORD_RESET_REQUESTED,
        )
        .catch(() => {
          logger.debug("Audit log write for password reset request failed silently");
        });
      const baseUrl = publicEnv.HOST_PROD || `https://${event.request.headers.get("host")}`;
      sendMail({
        recipientEmail: result.output.email,
        subject: "Reset your password",
        templateName: "password-reset",
        props: {
          token,
          expiresIn: "1 hour",
          username: user.username,
          resetLink: `${baseUrl}/login?token=${token}&email=${encodeURIComponent(result.output.email)}`,
        },
        languageTag: "en" as any,
      }).catch(() => {
        logger.debug("Password reset email sending failed silently");
      });
    }
  } catch {}

  return {
    success: true,
    message: "If an account exists, a reset link has been sent.",
  };
}

async function resetPWInternal(event: RequestEvent, input: any) {
  if (process.env.TEST_MODE !== "true" && (await limiter.isLimited(event))) {
    event.setHeaders({ "Retry-After": "60" });
    return { success: false, message: "Too many requests." };
  }
  await dbInitPromise;
  if (!auth) return { success: false, message: "Authentication system unavailable." };

  const password = input.password as string;
  const token = input.token as string;
  const email = input.email as string;

  const result = safeParse(resetFormSchema, { password, token, email });
  if (!result.success) return { success: false, errors: flatten(result.issues).nested };
  const { password: p, token: t, email: e } = result.output;

  const user = await auth.checkUser({ email: e });
  if (!user?._id) return { success: false, message: "Invalid reset link." };
  const v = await auth.consumeToken(t, user._id, "password_reset");
  if (!v.status) return { success: false, message: v.message || "Invalid reset link." };
  if (p.length < 8) return { success: false, message: "Password too weak." };

  await auth.invalidateAllUserSessions(user._id);
  const ur = await auth.updateUserPassword(e, p);
  if (!ur.status) return { success: false, message: "Failed to update password." };

  auditLogService
    .log(
      "Password reset success",
      { id: user._id, email: user.email, ip: getClientIp(event) },
      { type: "user", id: user._id },
      AuditEventType.PASSWORD_RESET_SUCCESS,
    )
    .catch(() => {
      logger.debug("Audit log write for password reset success failed silently");
    });

  throw redirect(303, "/login?reset=success");
}
