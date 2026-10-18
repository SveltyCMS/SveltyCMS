/**
 * @file src/routes/email-previews/+page.server.ts
 * @description Server-side logic for the email preview page.
 *
 * Renders the selected email template to HTML on the server so the browser
 * never needs the previewer package (and its Shiki syntax-highlighting
 * dependency). The page only receives `files`/`path` plus the rendered HTML
 * and renders it in a sandboxed iframe.
 *
 * ### Features
 * - User authentication and authorization (now tenant-aware)
 * - Server-side template rendering via the shared email Renderer
 * - Template selection through `?email=<name>` (defaults to the first file)
 */

// Auth
import type { User } from "@src/databases/auth/types";
import { error } from "@sveltejs/kit";

/** Cached lazy handle to the DB module — one module-registry lookup instead of one per call. */
let dbModulePromise: Promise<typeof import("@src/databases/db")> | undefined;
function loadDbModule(): Promise<typeof import("@src/databases/db")> {
  return (dbModulePromise ??= import("@src/databases/db"));
}

// System Logger
import { logger } from "@utils/logger";
import { getEmailTemplate, renderEmailToStrings } from "@utils/email.server";
import { createEmail, emailList, sendEmail } from "@better-svelte-email/preview";
import { LocalCMS } from "@src/services/sdk";

/** Template directory, relative to the project root. */
const EMAILS_PATH = "src/components/emails";

/**
 * Representative props so every template can render standalone. Templates
 * declare their own defaults (`?? ''`), but a few require values — the password
 * reset/ magic-link flows and the password-updated notice — so the previewer
 * supplies them explicitly.
 */
const PREVIEW_PROPS = {
  email: "preview@example.com",
  expiresIn: "3600",
  expiresInLabel: "1 hour",
  expiresInMinutes: 15,
  firstName: "Preview",
  hostLink: "http://localhost:5173",
  languageTag: "en",
  magicLink: "http://localhost:5173/magic-link?token=preview-token",
  resetLink: "http://localhost:5173/reset-password?token=preview-token",
  role: "admin",
  sitename: "SveltyCMS (Preview)",
  token: "preview-token",
  tokenLink: "http://localhost:5173/token?token=preview-token",
  user: { firstName: "Preview", username: "preview", email: "preview@example.com" },
  username: "Preview User",
};

// Define the return type for the load function.
interface PreviewData {
  components?: Record<string, unknown>;
  emails?: { name: string; path: string }[];
  files: string[] | null;
  path?: string | null;
  user?: User | null;
  /** Template currently rendered (null when the directory has no templates). */
  selectedEmail?: string | null;
  /** Server-rendered HTML for the selected template. */
  previewHtml?: string | null;
  /** Human-readable render failure, shown instead of the iframe. */
  previewError?: string | null;
  [key: string]: unknown;
}

export async function load({
  locals,
  url,
}: {
  locals: App.Locals;
  url: URL;
  fetch: typeof globalThis.fetch;
}): Promise<PreviewData> {
  const { user: userData, isAdmin } = locals;

  // Permission check: only allow admins to view email previews
  if (!userData) {
    logger.warn("Unauthenticated attempt to access email previews");
    throw error(401, "Authentication required");
  }

  if (!isAdmin) {
    logger.warn(`Unauthorized attempt to access email previews by user: ${userData._id}`);
    throw error(403, "Insufficient permissions - admin access required");
  }

  const emailListData = await emailList({ path: EMAILS_PATH });
  // Deterministic order (and a predictable default preview) regardless of the
  // host filesystem's readdir order.
  const files = emailListData.files ? [...emailListData.files].sort() : null;

  // Keep the URL authoritative, but fall back to the first template and ignore
  // names that are not part of the directory listing (no path traversal).
  const requested = url.searchParams.get("email");
  const selectedEmail =
    files && files.length > 0
      ? requested && files.includes(requested)
        ? requested
        : files[0]
      : null;

  let previewHtml: string | null = null;
  let previewError: string | null = null;

  if (selectedEmail) {
    try {
      const component = await getEmailTemplate(selectedEmail);
      if (!component) {
        throw new Error(`Email template '${selectedEmail}' was not found.`);
      }
      const rendered = await renderEmailToStrings(component, selectedEmail, PREVIEW_PROPS);
      previewHtml = rendered.html;
    } catch (err) {
      previewError = err instanceof Error ? err.message : String(err);
      logger.warn(`[EmailPreview] Failed to render '${selectedEmail}': ${previewError}`);
    }
  }

  return {
    user: userData,
    ...emailListData,
    files,
    selectedEmail,
    previewHtml,
    previewError,
  };
}

// Helper to gate actions for administrator use only
function gateAction(actionFn: any) {
  return async (event: any) => {
    const { locals } = event;
    if (!locals.user || !locals.isAdmin) {
      throw error(403, "Insufficient permissions - admin access required");
    }
    return actionFn(event);
  };
}

const rawActions = {
  ...createEmail(),
  ...sendEmail({
    customSendEmailFunction: async ({ to, subject }: { to: string; subject: string }) => {
      // Extract template name from subject or use default
      const templateName = subject?.includes("Preview:")
        ? subject.replace("Preview:", "").trim()
        : "welcomeUser";

      logger.info("Email preview sending via Local API:", {
        recipientEmail: to,
        subject,
        templateName,
      });

      const previewProps = {
        username: "Preview User",
        email: to,
        sitename: "SveltyCMS (Preview)",
        hostLink: "http://localhost:5173",
      };

      try {
        const { dbAdapter } = await loadDbModule();
        if (!dbAdapter) throw new Error("Database adapter not available");

        const cms = new LocalCMS(dbAdapter);
        const result = await (cms.system as any).sendMail({
          recipientEmail: to,
          subject: subject || `Preview: ${templateName}`,
          templateName,
          props: previewProps,
          languageTag: "en",
        });

        if (result.success) {
          logger.info("Email preview sent successfully via Local API.");
        } else {
          logger.warn("Email preview Local API call reported not successful:", {
            message: result.message,
          });
        }
        return result;
      } catch (err: any) {
        logger.error("Failed to send email via Local API during preview", {
          error: err,
        });
        return {
          success: false,
          error: err.message || String(err),
        };
      }
    },
  } as any),
};

export const actions: any = {};
for (const [key, fn] of Object.entries(rawActions)) {
  if (typeof fn === "function") {
    actions[key] = gateAction(fn);
  }
}
