/**
 * @file src/routes/(app)/config/system-settings/settings-utils.ts
 * @description Pure helpers for system settings UI and remotes (testable without $app/server).
 *
 * ### Features:
 * - remoteJsonHeaders — JSON + optional CSRF from request cookies
 * - Field defaults / group value initialization
 * - Field and group validation (email, number min/max, required)
 * - Empty-config detection for production readiness banners
 * - Import JSON parse/validate for group export files
 */

import type { Cookies } from "@sveltejs/kit";
import { CSRF_TOKEN_COOKIE_NAME, CSRF_TOKEN_HEADER } from "@utils/security/csrf-utils";
import type { SettingField, SettingGroup } from "./settings-groups";

/**
 * Build JSON headers with CSRF token from cookies when present.
 * Prefer `__Host-` prefixed cookie when both exist.
 */
export function remoteJsonHeaders(cookies: Pick<Cookies, "get">): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const secureName = `__Host-${CSRF_TOKEN_COOKIE_NAME}`;
  const csrf = cookies.get(secureName) || cookies.get(CSRF_TOKEN_COOKIE_NAME) || null;
  if (csrf) {
    headers[CSRF_TOKEN_HEADER] = csrf;
  }
  return headers;
}

/**
 * Default value for a settings field when the API returns null/undefined.
 */
export function defaultFieldValue(field: SettingField): unknown {
  if (field.type === "boolean") return false;
  if (
    field.type === "array" ||
    field.type === "language-multi" ||
    field.type === "loglevel-multi"
  ) {
    return [];
  }
  if (field.type === "number") return null;
  return "";
}

/**
 * Merge API values with safe defaults for every field in the group.
 */
export function initializeGroupValues(
  fields: SettingField[],
  loaded: Record<string, unknown> = {},
): Record<string, unknown> {
  const initialized: Record<string, unknown> = {};
  for (const field of fields) {
    if (loaded[field.key] !== undefined && loaded[field.key] !== null) {
      initialized[field.key] = loaded[field.key];
    } else {
      initialized[field.key] = defaultFieldValue(field);
    }
  }
  return initialized;
}

/**
 * Validate a single setting field. Returns error message or null if valid.
 */
export function validateSettingField(field: SettingField, value: unknown): string | null {
  if (field.required && (value === undefined || value === null || value === "")) {
    return `${field.label} is required`;
  }

  if (
    typeof value === "string" &&
    value &&
    (field.key.toLowerCase().includes("email") ||
      field.key === "SMTP_USER" ||
      field.label.toLowerCase().includes("email"))
  ) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      return `${field.label} must be a valid email address`;
    }
  }

  if (field.type === "number" && typeof value === "number") {
    if (field.min !== undefined && value < field.min) {
      return `${field.label} must be at least ${field.min}`;
    }
    if (field.max !== undefined && value > field.max) {
      return `${field.label} must be at most ${field.max}`;
    }
  }

  if (field.validation) {
    return field.validation(value);
  }

  return null;
}

/**
 * Validate all fields; returns a map of fieldKey → error message.
 */
export function validateAllSettingFields(
  fields: SettingField[],
  values: Record<string, unknown>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const err = validateSettingField(field, values[field.key]);
    if (err) errors[field.key] = err;
  }
  return errors;
}

/**
 * Detect empty string values that typically need production configuration.
 */
export function hasEmptyConfigFields(
  fields: SettingField[],
  values: Record<string, unknown>,
): boolean {
  return fields.some((field) => {
    const value = values[field.key];
    if (typeof value === "string") {
      return (
        value === "" &&
        (field.required || field.key.includes("HOST") || field.key.includes("EMAIL"))
      );
    }
    return false;
  });
}

/**
 * Deep-equality via JSON for unsaved-change detection (same approach as the form).
 */
export function settingValuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Whether current values differ from the last loaded originals.
 */
export function hasUnsavedSettingChanges(
  values: Record<string, unknown>,
  originalValues: Record<string, unknown>,
): boolean {
  return Object.keys(values).some((key) => !settingValuesEqual(values[key], originalValues[key]));
}

export type ImportGroupResult =
  | { ok: true; values: Record<string, unknown> }
  | { ok: false; error: string };

/**
 * Parse a group export JSON blob and extract values for the given group id.
 * Accepts either `{ [groupId]: values }` (export format) or a flat values object.
 */
export function parseImportedGroupJson(
  raw: string,
  group: Pick<SettingGroup, "id" | "fields">,
): ImportGroupResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Invalid JSON file" };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "Import file must be a JSON object" };
  }

  const obj = parsed as Record<string, unknown>;
  let values: Record<string, unknown>;

  if (obj[group.id] && typeof obj[group.id] === "object" && !Array.isArray(obj[group.id])) {
    values = obj[group.id] as Record<string, unknown>;
  } else if (
    group.fields.some((f) => Object.prototype.hasOwnProperty.call(obj, f.key)) ||
    Object.keys(obj).length === 0
  ) {
    // Flat payload of field keys (or empty object)
    const nestedLike = group.fields.every((f) => !Object.prototype.hasOwnProperty.call(obj, f.key));
    if (nestedLike && Object.keys(obj).length > 0) {
      return {
        ok: false,
        error: `Import file does not contain group "${group.id}" or matching field keys`,
      };
    }
    values = obj;
  } else {
    return {
      ok: false,
      error: `Import file does not contain group "${group.id}" or matching field keys`,
    };
  }

  const allowed = new Set(group.fields.map((f) => f.key));
  const filtered: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(values)) {
    if (allowed.has(key)) filtered[key] = val;
  }

  return { ok: true, values: filtered };
}

/**
 * Apply imported values onto current group values (only known keys).
 */
export function mergeImportedGroupValues(
  fields: SettingField[],
  current: Record<string, unknown>,
  imported: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...current };
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(imported, field.key)) {
      next[field.key] = imported[field.key];
    }
  }
  return next;
}
