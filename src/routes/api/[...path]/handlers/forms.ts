/**
 * @file src/routes/api/[...path]/handlers/forms.ts
 * @description First-party form ingestion handler for SveltyCMS.
 *
 * Provides a zero-configuration backend for frontend contact/lead/newsletter forms.
 * Validates submissions, filters spam via invisible honeypots, records privacy-safe
 * metadata, stores submissions directly in the collection, and fires event bus
 * triggers for automations (email, webhooks).
 *
 * ### Features:
 * - Public submission endpoint: `POST /api/forms/:collection`
 * - Honeypot spam defense (`_hp`, `_gotcha`, `honeypot`)
 * - Privacy-preserving IP hashing (GDPR compliant)
 * - Automatic metadata tagging (`_formSubmittedAt`, `_formIpHash`, `_formUserAgent`)
 * - EventBus emission (`form:submit`) for automations and notifications
 * - Read endpoint: `GET /api/forms/:collection` (requires collections:read permission)
 */

import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/databases/db-interface";
import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger";
import { nowISODateString } from "@utils/date";
import { eventBus } from "@utils/event-bus";
import { successResponse, createdResponse } from "./base";
import { createHash } from "node:crypto";

const HONEYPOT_FIELDS = ["_hp", "_gotcha", "honeypot", "_honey"];

/**
 * Strips honeypot fields and returns whether any honeypot was triggered.
 */
function checkAndStripHoneypots(data: Record<string, unknown>): {
  isSpam: boolean;
  cleanData: Record<string, unknown>;
} {
  let isSpam = false;
  const cleanData: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (HONEYPOT_FIELDS.includes(key)) {
      if (typeof value === "string" && value.trim().length > 0) {
        isSpam = true;
      }
    } else {
      cleanData[key] = value;
    }
  }

  return { isSpam, cleanData };
}

/**
 * Privacy-preserving client IP hasher (one-way salt, no raw IP retention).
 */
function hashClientIp(ip: string): string {
  return createHash("sha256").update(`${ip}:svelty_forms_salt`).digest("hex").slice(0, 16);
}

/**
 * Main dispatcher for /api/forms/* routes.
 */
export async function handleFormsRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
): Promise<Response> {
  const collectionName = segments[1];
  if (!collectionName) {
    throw new AppError("Missing collection name for form endpoint", 400, "INVALID_COLLECTION");
  }

  const method = event.request.method;

  // ── Public Submission: POST /api/forms/:collection ────────────────────────
  if (method === "POST") {
    return handleFormSubmit(event, cms, tenantId, collectionName);
  }

  // ── Protected View: GET /api/forms/:collection ────────────────────────────
  if (method === "GET") {
    return handleGetSubmissions(event, cms, tenantId, collectionName);
  }

  throw new AppError(`Method ${method} not allowed for /api/forms`, 405, "METHOD_NOT_ALLOWED");
}

/**
 * Ingests a public form submission.
 */
async function handleFormSubmit(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  collectionName: string,
): Promise<Response> {
  let rawBody: Record<string, unknown> = {};

  const contentType = event.request.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/json")) {
      rawBody = (await event.request.json()) as Record<string, unknown>;
    } else if (
      contentType.includes("multipart/form-data") ||
      contentType.includes("application/x-www-form-urlencoded")
    ) {
      const formData = await event.request.formData();
      formData.forEach((value, key) => {
        rawBody[key] = value;
      });
    } else {
      // Fallback JSON parse
      rawBody = (await event.request.json()) as Record<string, unknown>;
    }
  } catch (err) {
    logger.warn(`[Forms] Failed to parse submission body for "${collectionName}":`, err);
    throw new AppError("Invalid form submission payload", 400, "BAD_PAYLOAD");
  }

  // 1. Honeypot check (Spam defense)
  const { isSpam, cleanData } = checkAndStripHoneypots(rawBody);
  if (isSpam) {
    logger.info(
      `[Forms] Honeypot triggered for "${collectionName}" — silently dropping submission`,
    );
    // Return standard success to fool bots
    return successResponse(event, { success: true, message: "Submission received" }, 200);
  }

  // 2. Client context & GDPR-safe hashing
  const clientIp = event.getClientAddress?.() || "127.0.0.1";
  const ipHash = hashClientIp(clientIp);
  const userAgent = event.request.headers.get("user-agent")?.slice(0, 200) || "unknown";

  const submissionPayload = {
    ...cleanData,
    status: cleanData.status || "published",
    _formSubmittedAt: nowISODateString(),
    _formIpHash: ipHash,
    _formUserAgent: userAgent,
  };

  // 3. Persist submission to collection
  let insertedId: string;
  try {
    const result = await cms.db.crud.insert(
      collectionName,
      submissionPayload as any,
      tenantId ? { tenantId } : undefined,
    );
    insertedId =
      (result as { _id?: string; id?: string })?._id ||
      (result as { _id?: string; id?: string })?.id ||
      "saved";
  } catch (err: unknown) {
    logger.error(`[Forms] Database insertion failed for collection "${collectionName}":`, err);
    throw new AppError(
      `Failed to save form submission to "${collectionName}": ${err instanceof Error ? err.message : String(err)}`,
      500,
      "FORM_SAVE_FAILED",
    );
  }

  // 4. Trigger EventBus for automations (email alerts, webhooks, notifications)
  try {
    eventBus.emit("form:submit", {
      collection: collectionName,
      id: insertedId,
      data: submissionPayload,
      tenantId,
    });
  } catch (err) {
    logger.warn(`[Forms] EventBus dispatch for "form:submit" encountered an error:`, err);
  }

  return createdResponse(event, {
    id: insertedId,
    message: "Form submission received successfully",
  });
}

/**
 * Lists submissions for an authenticated user with `collections:read` permission.
 */
async function handleGetSubmissions(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  collectionName: string,
): Promise<Response> {
  const user = event.locals.user;
  if (!user) {
    throw new AppError("Authentication required to view form submissions", 401, "UNAUTHORIZED");
  }

  const url = event.url;
  const limit = Math.min(Math.max(1, Number(url.searchParams.get("limit") || 50)), 100);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));

  try {
    const submissions = await cms.collections.find(collectionName, {
      tenantId,
      user,
      limit,
      page,
      sortField: "_formSubmittedAt",
      sortDirection: "desc",
    });

    return successResponse(event, submissions);
  } catch (err: unknown) {
    logger.error(`[Forms] Failed to fetch submissions for "${collectionName}":`, err);
    throw new AppError("Failed to fetch form submissions", 500, "SUBMISSIONS_FETCH_FAILED");
  }
}
