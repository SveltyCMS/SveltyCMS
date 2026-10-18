/**
 * @file src/routes/api/[...path]/handlers/forms.ts
 * @description First-party form ingestion handler for SveltyCMS.
 *
 * Provides a zero-configuration backend for frontend contact/lead/newsletter forms.
 * Validates submissions, filters spam via invisible honeypots, records privacy-safe
 * metadata, stores submissions directly in the collection, and fires event bus
 * triggers for automations (email, webhooks).
 *
 * ### Security:
 * - Opt-in only: a collection accepts public posts solely when `formEnabled: true`
 * - Fail-closed schema lookup (unknown/system collections return a generic 404)
 * - Strict allowlist of client-supplied keys (schema-declared fields only)
 * - Privileged/managed columns (`role`, `isAdmin`, `tenantId`, `permissions`, …) are stripped
 * - Server-controlled `status: StatusTypes.draft` + `_formStatus: "pending"`
 * - `GET` requires `collections:read` (admin bypass)
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
import { StatusTypes, type DatabaseId, type FieldInstance, type Schema } from "@src/content/types";
import { AppError, raise } from "@utils/error-handling";
import { logger } from "@utils/logger";
import { nowISODateString } from "@utils/date";
import { eventBus } from "@utils/event-bus";
import { hasPermissionWithRoles } from "@src/databases/auth/permissions";
import { isAdmin } from "@src/databases/auth/constants";
import { validateRequiredFields } from "@src/widgets/widget-validation";
import { successResponse, createdResponse } from "./base";
import { createHash } from "node:crypto";
import { RateLimiter } from "@src/hooks/handle-rate-limit";

const HONEYPOT_FIELDS = ["_hp", "_gotcha", "honeypot", "_honey"];

// 🛡️ HARDENING: rate-limit public form submissions per client IP / IPUA.
// Prevents automated spam floods and database filling.
const formSubmissionLimiter = new RateLimiter({
  IP: [20, "m"],
  IPUA: [20, "m"],
});

/**
 * Privileged or system-managed keys that a public submission may never set.
 * `status` is included because the endpoint forces a server-side value.
 */
const FORBIDDEN_SUBMISSION_KEYS = new Set([
  "_id",
  "tenantId",
  "role",
  "isAdmin",
  "permissions",
  "status",
  "blocked",
  "password",
  "passwordHash",
  "emailVerified",
  "isRegistered",
  "mfaRequired",
  "createdAt",
  "updatedAt",
  "isDeleted",
]);

const PROTO_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const FORM_ENDPOINT_NOT_FOUND = "Form endpoint not found";

/** Structural view of a schema field — avoids depending on a widget-specific shape. */
interface FormFieldDefinition {
  db_fieldName?: string;
  name?: string;
  type?: string;
  required?: boolean;
  requiredIf?: unknown;
  showIf?: unknown;
}

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
 * Resolves a collection and requires the explicit `formEnabled` opt-in.
 * Unknown collections and system tables produce the same 404 so the endpoint
 * cannot be used to probe for internal tables.
 */
async function resolveFormCollection(
  cms: LocalCMS,
  collectionName: string,
  tenantId: DatabaseId,
): Promise<Schema> {
  let schema: Schema;
  try {
    schema = await cms.collections.getSchema(collectionName, tenantId);
  } catch (err: unknown) {
    if (err instanceof AppError && err.status === 404) {
      return raise(404, FORM_ENDPOINT_NOT_FOUND, "FORM_NOT_FOUND");
    }
    throw err;
  }

  if (!schema || schema.formEnabled !== true) {
    return raise(404, FORM_ENDPOINT_NOT_FOUND, "FORM_NOT_FOUND");
  }

  return schema;
}

function invalidField(key: string, expected: string): never {
  return raise(400, `Field '${key}' must be a ${expected}`, "FIELD_VALIDATION_ERROR");
}

/**
 * Coerces/validates a scalar value declared by the schema. Form encodings
 * (JSON or multipart) commonly deliver numbers/booleans as strings, so safe
 * coercions are accepted; anything else is rejected.
 */
function coerceScalarValue(key: string, value: unknown, type: string): unknown {
  switch (type) {
    case "number": {
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
      }
      return invalidField(key, "number");
    }
    case "boolean": {
      if (typeof value === "boolean") return value;
      if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (["true", "on", "1", "yes"].includes(normalized)) return true;
        if (["false", "off", "0", "no", ""].includes(normalized)) return false;
      }
      return invalidField(key, "boolean");
    }
    case "date":
    case "datetime": {
      if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString();
      }
      if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Date.parse(value))) {
        return value;
      }
      return invalidField(key, "date");
    }
    case "string":
    case "text":
    case "email": {
      if (typeof value === "string") return value;
      if (typeof value === "number" || typeof value === "boolean") return String(value);
      return invalidField(key, "string");
    }
    default:
      // Group/repeater/array/object fields keep the declared top-level value.
      return value;
  }
}

/**
 * Builds the persisted payload from an untrusted submission:
 * - drops honeypot-adjacent/privileged keys and `_form*` metadata
 * - keeps only top-level keys declared by the collection schema
 * - validates/normalizes declared scalar types
 * - always stamps the server-controlled draft status and pending form marker
 */
function sanitizeSubmission(
  rawData: Record<string, unknown>,
  schema: Schema,
): Record<string, unknown> {
  const declaredFields = new Map<string, { storageKey: string; definition: FormFieldDefinition }>();

  for (const rawField of schema.fields) {
    const field = rawField as FormFieldDefinition;
    const storageKey = field.db_fieldName || field.name;
    if (!storageKey) continue;
    declaredFields.set(storageKey, { storageKey, definition: field });
    // Accept the human-facing `name` as an alias when it differs from the
    // physical column name; it still has to be declared by the schema.
    if (field.name && field.name !== storageKey) {
      declaredFields.set(field.name, { storageKey, definition: field });
    }
  }

  const clean: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(rawData)) {
    if (PROTO_KEYS.has(key)) continue;
    if (key.startsWith("_form")) continue;
    if (FORBIDDEN_SUBMISSION_KEYS.has(key)) continue;

    const declared = declaredFields.get(key);
    if (!declared) continue;

    if (value === undefined) continue;

    const type = typeof declared.definition.type === "string" ? declared.definition.type : "";
    clean[declared.storageKey] = coerceScalarValue(key, value, type.toLowerCase());
  }

  return clean;
}

function extractInsertedId(result: unknown): string {
  if (!result || typeof result !== "object") return "saved";
  const candidate = result as {
    _id?: unknown;
    id?: unknown;
    data?: { _id?: unknown; id?: unknown };
  };
  const id = candidate._id ?? candidate.id ?? candidate.data?._id ?? candidate.data?.id;
  return typeof id === "string" || typeof id === "number" ? String(id) : "saved";
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
  // The opt-in check runs before the body is touched: unconfigured collections
  // are indistinguishable from non-existent ones.
  const schema = await resolveFormCollection(cms, collectionName, tenantId);

  // 🛡️ Rate limit public form submissions
  if (process.env.TEST_MODE !== "true" && (await formSubmissionLimiter.isLimited(event))) {
    try {
      event.setHeaders({ "Retry-After": "60" });
    } catch {}
    throw new AppError("Too many submissions. Please try again later.", 429, "RATE_LIMIT_EXCEEDED");
  }

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

  // 2. Strict allowlist sanitization (never trust client-managed fields)
  const acceptedData = sanitizeSubmission(cleanData, schema);

  // 3. Client context & GDPR-safe hashing
  const clientIp = event.getClientAddress?.() || "127.0.0.1";
  const ipHash = hashClientIp(clientIp);
  const userAgent = event.request.headers.get("user-agent")?.slice(0, 200) || "unknown";

  const submissionPayload: Record<string, unknown> = {
    ...acceptedData,
    // Server-controlled: a public submission is never auto-published. `draft`
    // is a first-class StatusType; `_formStatus` keeps the moderation state
    // explicit without inventing a status the rest of the CMS does not know.
    status: StatusTypes.draft,
    _formStatus: "pending",
    _formSubmittedAt: nowISODateString(),
    _formIpHash: ipHash,
    _formUserAgent: userAgent,
  };

  // 4. Validate required fields declared by the schema.
  const { valid, missingFields } = validateRequiredFields(
    submissionPayload,
    schema.fields as FieldInstance[],
  );
  if (!valid) {
    raise(
      400,
      missingFields.map((field) => `Field '${field}' is required`).join("; "),
      "FIELD_VALIDATION_ERROR",
    );
  }

  // 5. Persist through the normal collection write pipeline (sanitization,
  // schema hooks, widget `modifyRequest`, encryption, tenant guard). `system`
  // is safe here because the public payload was already reduced to declared
  // fields and every privileged/system key was stripped above.
  let insertedId: string;
  try {
    const result = await cms.collections.create(collectionName, submissionPayload, {
      tenantId,
      system: true,
    });
    if (result?.success === false) {
      throw new AppError(
        `Failed to save form submission to "${collectionName}"`,
        500,
        "FORM_SAVE_FAILED",
      );
    }
    insertedId = extractInsertedId(result);
  } catch (err: unknown) {
    logger.error(`[Forms] Database insertion failed for collection "${collectionName}":`, err);
    // Preserve validation/permission errors (400/403) so form clients get a
    // useful response instead of a generic 500.
    if (err instanceof AppError && err.status < 500) throw err;
    throw new AppError(
      `Failed to save form submission to "${collectionName}": ${err instanceof Error ? err.message : String(err)}`,
      500,
      "FORM_SAVE_FAILED",
    );
  }

  // 6. Trigger EventBus for automations (email alerts, webhooks, notifications)
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

  const adminUser = event.locals.isAdmin === true || isAdmin(user);
  if (!adminUser && !hasPermissionWithRoles(user, "collections:read", event.locals.roles ?? [])) {
    raise(403, "Forbidden: Insufficient permissions", "FORBIDDEN");
  }

  // Only opt-in form collections expose their submissions through this endpoint.
  await resolveFormCollection(cms, collectionName, tenantId);

  const url = event.url;
  const limit = Math.min(Math.max(1, Number(url.searchParams.get("limit") || 50)), 100);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));

  try {
    const submissions = await cms.collections.find(collectionName, {
      tenantId,
      user,
      // The explicit `collections:read` gate above authorizes this view. `system`
      // disables the published-only clamp so pending submissions (stored as
      // drafts) remain reviewable; the dedicated endpoint never exposes them
      // to unauthenticated callers.
      system: true,
      publicationFilter: "all",
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
