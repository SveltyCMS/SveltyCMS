/**
 * @file src/routes/email-previews/+page.server.ts
 * @description Server-side logic for the email preview page.
 *
 * ### Props
 * - `user`: The authenticated user data.
 *
 * ### Features
 * - User authentication and authorization (now tenant-aware)
 * - Proper typing for user data
 *
 */

// Auth
import type { User } from "@src/databases/auth/types";
import { error } from "@sveltejs/kit";

// System Logger
import { logger } from "@utils/logger.server";
import { createEmail, emailList, sendEmail } from "better-svelte-email/preview";
import { LocalCMS } from "@src/routes/api/cms";

// Define the return type for the load function.
interface PreviewData {
  components?: Record<string, unknown>;
  emails?: { name: string; path: string }[];
  files: string[] | null;
  path?: string | null;
  user?: User | null;
  [key: string]: unknown;
}

export async function load({
  locals,
}: {
  locals: App.Locals;
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

  const emailListData = await emailList({ path: "/src/components/emails" });

  return {
    user: userData,
    ...emailListData,
  };
}

export const actions = {
  ...createEmail,
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
        const { dbAdapter } = await import("@src/databases/db");
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
      } catch (err) {
        logger.error("Failed to send email via Local API during preview", {
          error: err,
        });
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  } as any),
};
