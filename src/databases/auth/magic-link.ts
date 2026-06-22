/**
 * @file src/databases/auth/magic-link.ts
 * @description Passwordless magic-link token creation and email delivery.
 *
 * ### Features:
 * - magic_link token issuance via auth.createToken()
 * - SMTP-aware email dispatch with dev fallback logging
 * - audit trail integration
 */

import type { RequestEvent } from "@sveltejs/kit";
import type { ISODateString, DatabaseId } from "@src/content/types";
import { auth, dbInitPromise } from "@src/databases/db";
import { auditLogService, AuditEventType } from "@src/services/security/audit-service";
import { getClientIp } from "@utils/hook-utils";
import { sendMail } from "@utils/email.server";
import { publicEnv } from "@src/stores/global-settings.svelte";
import { logger } from "@utils/logger";

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;

export interface MagicLinkSendResult {
  sent: boolean;
  smtpConfigured: boolean;
  /** Dev-only fallback when SMTP is unavailable */
  devLink?: string;
}

/**
 * Creates a magic_link token and sends the sign-in email when the user exists.
 * Always returns without leaking account existence.
 */
export async function sendMagicLinkForEmail(
  event: RequestEvent,
  email: string,
): Promise<MagicLinkSendResult> {
  let smtpConfigured = false;
  try {
    const { dbAdapter } = await import("@src/databases/db");
    const smtpHost = await dbAdapter.system.preferences.get<string>("SMTP_HOST", {
      scope: "system",
    });
    smtpConfigured = !!(smtpHost?.success && smtpHost.data);
  } catch {
    // ignore
  }

  if (!auth) {
    return { sent: false, smtpConfigured };
  }

  let devLink: string | undefined;

  try {
    const user = await auth.checkUser({ email });
    if (user?._id) {
      const exp = new Date(Date.now() + MAGIC_LINK_TTL_MS);
      const token = await auth.createToken({
        user_id: user._id,
        expires: exp.toISOString() as ISODateString,
        type: "magic_link",
      });

      auditLogService
        .log(
          "Magic Link requested",
          { id: user._id, email: user.email, ip: getClientIp(event) },
          { type: "user", id: user._id },
          AuditEventType.MAGIC_LINK_REQUESTED,
        )
        .catch(() => {
          logger.debug("Audit log write for magic link request failed silently");
        });

      const origin = new URL(event.request.url).origin;
      const baseUrl = publicEnv.HOST_PROD || origin;
      const magicLink = `${baseUrl}/login?magic_token=${token}&email=${encodeURIComponent(email)}`;
      devLink = magicLink;

      sendMail({
        recipientEmail: email,
        subject: "Sign in to SveltyCMS",
        templateName: "magic-link",
        props: { email, magicLink, expiresInMinutes: 15 },
        languageTag: "en" as any,
      })
        .then((res) => {
          if (!res.success || res.dev_mode) {
            logger.warn(`[DEVELOPMENT/NO-SMTP] Magic Link for ${user.email}: ${magicLink}`);
          }
        })
        .catch(() => {
          logger.warn(`[DEVELOPMENT/NO-SMTP] Magic Link for ${user.email}: ${magicLink}`);
        });
    }
  } catch {
    // uniform response — no account enumeration
  }

  return { sent: true, smtpConfigured, devLink };
}

/**
 * Verifies a magic link token, consumes it, creates a session, and sets the session cookie.
 * Called from the login page load function when magic_token query param is present.
 */
export async function verifyMagicLink({
  token,
  email,
  cookies,
  request,
  userLanguage = "en",
}: {
  token: string;
  email: string;
  cookies: any;
  request: any;
  userLanguage?: string;
}) {
  await dbInitPromise;
  if (!auth) return { success: false, message: "Authentication system unavailable." };

  try {
    const user = await auth.checkUser({ email: email.toLowerCase() });
    if (!user?._id) {
      return {
        success: false,
        message: "No account found with that email address.",
      };
    }

    const consumeResult = await auth.consumeToken(token, user._id, "magic_link");
    if (!consumeResult.status) {
      return {
        success: false,
        message: consumeResult.message || "Invalid or expired magic link.",
      };
    }

    // Success! Create session
    const session = await auth.createSession({
      user_id: user._id as DatabaseId,
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() as ISODateString,
    });
    const sessionCookie = auth.createSessionCookie(session._id as DatabaseId);
    cookies.set(sessionCookie.name, sessionCookie.value, {
      ...(sessionCookie.attributes as Record<string, unknown>),
      path: "/",
    });

    // Update user last active status and auth method
    auth
      .updateUserAttributes(
        user._id as any,
        {
          lastAuthMethod: "magic_link",
          lastActiveAt: new Date().toISOString() as any,
        },
        { bypassTenantCheck: true },
      )
      .catch(() => {
        logger.debug("Magic link user attribute update failed silently");
      });

    auditLogService
      .log(
        "Magic Link login success",
        {
          id: user._id,
          email: user.email,
          ip: getClientIp({ request, cookies } as any),
        },
        { type: "user", id: user._id },
        AuditEventType.MAGIC_LINK_SUCCESS,
      )
      .catch(() => {
        logger.debug("Audit log write for magic link success failed silently");
      });

    const { getCachedFirstCollectionPath } = await import("@utils/server/collection-utils.server");
    const finalCollectionPath = await getCachedFirstCollectionPath(userLanguage as any);
    return {
      success: true,
      redirectPath: finalCollectionPath ?? "/config/collectionbuilder",
    };
  } catch (err: any) {
    logger.error("Magic link verification error:", err.message);
    return { success: false, message: "Magic link authentication failed." };
  }
}
