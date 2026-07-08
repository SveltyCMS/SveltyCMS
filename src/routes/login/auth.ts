/**
 * @file src/routes/login/auth.ts
 * @description Server-only authentication functions (sign-in, sign-up).
 * NOT a Remote Functions file — safe for server-only imports.
 *
 * These are used by both auth.remote.ts (command wrappers) and +page.server.ts (form actions).
 */

import { auth, dbInitPromise } from "@src/databases/db";
import { safeParse, flatten } from "valibot";
import { loginFormSchema, signUpFormSchema } from "@utils/schemas";
import { auditLogService, AuditEventType } from "@src/services/security/audit-service";
import { getClientIp } from "@utils/hook-utils";
import { invalidateUserCountCache } from "@src/hooks/handle-authorization";
import { tenantService } from "@src/services/core/tenant-service";
import { logger } from "@utils/logger";
import { RateLimiter } from "sveltekit-rate-limiter/server";
import type { ISODateString, DatabaseId } from "@src/content/types";
import type { RequestEvent } from "@sveltejs/kit";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export function isSecureConnection(event: RequestEvent): boolean {
  const isProd = process.env.NODE_ENV !== "development" && process.env.TEST_MODE !== "true";
  return event.url.protocol === "https:" || (event.url.hostname !== "localhost" && isProd);
}

export const limiter = new RateLimiter({
  IP: [10, "m"],
  IPUA: [10, "m"],
  cookie: {
    name: "ratelimit",
    secret: (process.env.RATE_LIMIT_SECRET || process.env.JWT_SECRET_KEY + "-ratelimit") as string,
    rate: [10, "m"],
    preflight: true,
  },
});

// ---------------------------------------------------------------------------
// Sign In
// ---------------------------------------------------------------------------

export async function signInInternal(event: RequestEvent, input: any) {
  if (process.env.TEST_MODE !== "true" && (await limiter.isLimited(event))) {
    try {
      event.setHeaders({ "Retry-After": "60" });
    } catch {}
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
    let ar;
    try {
      ar = await auth.authenticate(e, p, undefined, {
        bypassTenantCheck: true,
      });
    } catch (err: any) {
      // Account lockout (423 SvelteKit error) should return as form data,
      // not propagate to an error page, so the login form displays it inline.
      if (err?.status === 423) {
        const message =
          typeof err?.body === "string"
            ? err.body
            : err?.body?.message || err?.message || "Account is temporarily locked.";
        return { success: false, message };
      }
      throw err;
    }
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
      const sc = auth.createSessionCookie(ar.sessionId!, isSecureConnection(event));
      try {
        event.cookies.set(sc.name, sc.value, {
          ...(sc.attributes as Record<string, unknown>),
          path: "/",
        });
      } catch (e) {
        logger.error("[auth] Failed to set session cookie:", e);
      }
      // Prime in-memory session cache so getUserFromSession bypasses sqlite-proxy
      try {
        const { primeSessionMemoryCache } = await import("@src/hooks/handle-authentication");
        primeSessionMemoryCache(ar.sessionId!, user);
        // Also force setup state to COMPLETE so handleAuthentication doesn't short-circuit
        const { invalidateSetupCache } = await import("@src/utils/server/setup-check");
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
    const sc = auth.createSessionCookie(s._id, isSecureConnection(event));
    try {
      event.cookies.set(sc.name, sc.value, {
        ...(sc.attributes as Record<string, unknown>),
        path: "/",
      });
    } catch {}
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

  // Determine redirect: user's first collection if available, otherwise builder
  let redirectPath = "/config/collectionbuilder";
  try {
    const { getCachedFirstCollectionPath } = await import("@utils/server/collection-utils.server");
    const userLanguage = (user as any).locale || (user as any).language || "en";
    const path = await getCachedFirstCollectionPath(userLanguage as any);
    if (path) redirectPath = path;
  } catch {
    // Fall back to builder
  }

  return { success: true, redirectPath };
}

// ---------------------------------------------------------------------------
// Sign Up
// ---------------------------------------------------------------------------

export async function signUpInternal(event: RequestEvent, input: any) {
  if (process.env.TEST_MODE !== "true" && (await limiter.isLimited(event))) {
    try {
      event.setHeaders({ "Retry-After": "60" });
    } catch {}
    return { success: false, message: "Too many requests." };
  }
  await dbInitPromise;
  if (!auth) return { success: false, message: "Authentication system unavailable." };

  const email = input.email as string;
  const username = input.username as string;
  const password = input.password as string;
  const confirm_password = (input.confirm_password as string) || password;
  const token = (input.token as string) || undefined;

  const result = safeParse(signUpFormSchema, {
    email,
    username,
    password,
    confirm_password,
    token,
  });
  if (!result.success) return { success: false, errors: flatten(result.issues).nested };
  const { email: e, username: u, password: p, token: t } = result.output;

  const mt = process.env.MULTI_TENANT === "true";
  const dm = process.env.DEMO === "true";
  const open = !!(mt && dm);
  let role = "user",
    invited = false,
    tid: string | undefined;

  if (open && !t) {
    if ((await auth.getUserCount({}, { bypassTenantCheck: true })) >= 100)
      return { success: false, message: "Demo capacity reached." };
    role = "admin";
    tid = event.cookies.get("demo_tenant_id") || crypto.randomUUID();
  } else if (!t) {
    const adminCount = await auth.getUserCount({ role: "admin" }, { bypassTenantCheck: true });
    if (adminCount === 0) {
      role = "admin";
    } else {
      return { success: false, message: "Invitation required." };
    }
  } else {
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
    const sc = auth.createSessionCookie(session._id, isSecureConnection(event));
    try {
      event.cookies.set(sc.name, sc.value, {
        ...(sc.attributes as Record<string, unknown>),
        path: "/",
      });
    } catch {}
    const { primeSessionMemoryCache } = await import("@src/hooks/handle-authentication");
    primeSessionMemoryCache(session._id, ur.data.user);
    const { invalidateSetupCache } = await import("@src/utils/server/setup-check");
    invalidateSetupCache(false, true);
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

  return { success: true, redirectPath: invited ? "/" : "/config/collectionbuilder" };
}
