/**
 * @file src/utils/email.server.ts
 * @description Reusable utility for rendering and sending emails using Svelte templates and Nodemailer.
 *
 * ### Hardening (audit 2026-07):
 * - O(1) template registry (Map instead of array search)
 * - Concurrent DB queries via Promise.all (N+1 → 1 round-trip)
 * - SMTP connection pooling (config-hash singleton, pool: true, max 5 connections)
 * - Email regex validation before any DB/network operations
 * - Credential-safe error logging (never logs err object, only message)
 */

import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger";
import { Renderer, toPlainText } from "@better-svelte-email/server";
import nodemailer from "nodemailer";
import type { TransportOptions, Transporter } from "nodemailer";
import type { ComponentType } from "svelte";
import type { IDBAdapter } from "@src/databases/db-interface";

// ─── O(1) Template Registry ────────────────────────────────────────────

const svelteEmailModules = (import.meta as any).glob
  ? (import.meta as any).glob("../components/emails/*.svelte")
  : {};

const templateRegistry = new Map<string, () => Promise<{ default: ComponentType }>>();
for (const [path, importer] of Object.entries(svelteEmailModules)) {
  const normalizedName = path.split("/").pop()?.toLowerCase();
  if (normalizedName) {
    templateRegistry.set(normalizedName, importer as () => Promise<{ default: ComponentType }>);
  }
}

export interface EmailTemplateProps {
  email?: string;
  expires_in?: string;
  expiresIn?: string | Date;
  expiresInLabel?: string;
  hostLink?: string;
  resetLink?: string;
  role?: string;
  sitename?: string;
  token?: string;
  tokenLink?: string;
  username?: string;
  [key: string]: unknown;
}

export interface SendMailOptions {
  languageTag?: string;
  props?: EmailTemplateProps;
  recipientEmail: string;
  subject: string;
  templateName: string;
}

export async function getEmailTemplate(templateName: string): Promise<ComponentType | null> {
  const normalizedSearch = `${templateName}.svelte`.toLowerCase();
  const moduleImporter = templateRegistry.get(normalizedSearch);

  if (moduleImporter) {
    try {
      const module = await moduleImporter();
      return module.default;
    } catch (e) {
      logger.error(`Failed to import email template '${templateName}':`, e);
      return null;
    }
  }

  logger.warn(
    `Email template '${templateName}' not found. Available modules:`,
    Array.from(templateRegistry.keys()),
  );
  return null;
}

interface RenderedEmailContent {
  html: string;
  text: string;
}

const renderer = new Renderer();

export const renderEmailToStrings = async (
  component: ComponentType,
  templateNameForLog: string,
  props?: EmailTemplateProps,
): Promise<RenderedEmailContent> => {
  try {
    const html = await renderer.render(component, { props: props || {} });
    const text = toPlainText(html);
    return { html, text };
  } catch (err) {
    logger.error(`Failed to render email template '${templateNameForLog}':`, err);
    throw new AppError(`Email template rendering failed for '${templateNameForLog}'.`, 500);
  }
};

// ─── Lazy DB adapter ───────────────────────────────────────────────────

let cachedDbAdapter: IDBAdapter | null = null;
async function getDbAdapter(): Promise<IDBAdapter> {
  if (!cachedDbAdapter) {
    const { dbAdapter } = await import("@src/databases/db");
    cachedDbAdapter = dbAdapter;
  }
  return cachedDbAdapter;
}

// ─── SMTP Connection Pool Cache ────────────────────────────────────────

let cachedTransporter: Transporter | null = null;
let currentConfigHash = "";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function sendMail({
  recipientEmail,
  subject,
  templateName,
  props = {},
  languageTag = "en",
}: SendMailOptions) {
  const { isBenchmarkExternalServicesDisabled } = await import("@utils/benchmark-runtime");
  if (isBenchmarkExternalServicesDisabled()) {
    logger.debug("[Email] Skipped send (benchmark mode)", { recipientEmail, subject });
    return { success: true, message: "Skipped in benchmark mode.", benchmark_sandbox: true };
  }

  // 1. Early validation
  if (!recipientEmail || !subject || !templateName) {
    throw new AppError("Missing required fields: recipientEmail, subject, or templateName.", 400);
  }

  if (!EMAIL_REGEX.test(recipientEmail)) {
    throw new AppError(`Invalid recipient email format: ${recipientEmail}`, 400);
  }

  const SELECTED_TEMPLATE_COMPONENT = await getEmailTemplate(templateName);
  if (!SELECTED_TEMPLATE_COMPONENT) {
    throw new AppError(`Invalid email template name: '${templateName}'.`, 400);
  }

  const dbAdapter = await getDbAdapter();
  if (!dbAdapter) {
    throw new AppError("Database adapter is not available", 500);
  }

  // 2. Concurrent DB fetching (N+1 → 1 round-trip)
  const [hostRes, portRes, userRes, passRes, mailFromRes] = await Promise.all([
    dbAdapter.system.preferences.get<string>("SMTP_HOST", { scope: "system" }),
    dbAdapter.system.preferences.get<string>("SMTP_PORT", { scope: "system" }),
    dbAdapter.system.preferences.get<string>("SMTP_USER", { scope: "system" }),
    dbAdapter.system.preferences.get<string>("SMTP_PASS", { scope: "system" }),
    dbAdapter.system.preferences.get<string>("SMTP_MAIL_FROM", { scope: "system" }),
  ]);

  const smtpHost = hostRes?.success ? hostRes.data : null;
  const smtpPort = portRes?.success ? portRes.data : null;
  const smtpUser = userRes?.success ? userRes.data : null;
  const smtpPass = passRes?.success ? passRes.data : null;
  const mailFrom = (mailFromRes?.success ? mailFromRes.data : null) || smtpUser;

  const missingVars: string[] = [];
  if (!smtpHost) missingVars.push("SMTP_HOST");
  if (!smtpPort) missingVars.push("SMTP_PORT");
  if (!smtpUser) missingVars.push("SMTP_USER");
  if (!smtpPass) missingVars.push("SMTP_PASS");

  if (missingVars.length > 0) {
    logger.warn("SMTP configuration incomplete. Email sending skipped.", { missingVars });
    return {
      success: false,
      message: "SMTP settings not configured.",
      missing_config: missingVars,
    };
  }

  if (/dummy|example|\.invalid$/.test(String(smtpHost).toLowerCase())) {
    logger.warn("SMTP host appears to be a placeholder; skipping email send.", { host: smtpHost });
    return { success: true, message: "Skipped placeholder host.", dev_mode: true };
  }

  // 3. Render template
  const { html, text } = await renderEmailToStrings(SELECTED_TEMPLATE_COMPONENT, templateName, {
    ...props,
    languageTag,
  });

  // 4. SMTP connection pooling
  const configHash = `${smtpHost}:${smtpPort}:${smtpUser}:${smtpPass}`;

  if (!cachedTransporter || currentConfigHash !== configHash) {
    cachedTransporter = nodemailer.createTransport({
      host: smtpHost,
      port: Number(smtpPort),
      secure: Number(smtpPort) === 465,
      auth: { user: smtpUser, pass: smtpPass },
      pool: true,
      maxConnections: 5,
      tls: { rejectUnauthorized: process.env.NODE_ENV !== "development" },
      debug: process.env.NODE_ENV === "development",
    } as TransportOptions);
    currentConfigHash = configHash;
  }

  const fromName = props?.sitename || "SveltyCMS";
  const mailOptions = {
    from: `"${fromName}" <${mailFrom}>`,
    to: recipientEmail,
    subject,
    text,
    html,
  };

  // 5. Send (log message only — never log full err object to prevent credential leaks)
  try {
    const info = await cachedTransporter.sendMail(mailOptions);
    logger.info("Email sent successfully", {
      recipientEmail,
      subject,
      templateName,
      messageId: info.messageId,
    });
    return { success: true, message: "Email sent successfully." };
  } catch (err) {
    logger.error("Nodemailer failed to send email:", {
      recipientEmail,
      subject,
      templateName,
      error: (err as Error).message,
    });
    throw new AppError(`Email sending failed: ${(err as Error).message}`, 500);
  }
}
