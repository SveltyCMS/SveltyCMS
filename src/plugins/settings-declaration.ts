/**
 * @file src/plugins/settings-declaration.ts
 * @description Plugin settings declaration and validation.
 *
 * A plugin declares its settings shape via an `aphex/settings` part (pattern
 * borrowed from aphexcms). Core renders the form, stores values per tenant,
 * and injects them into the plugin's server code.
 *
 * ### Features:
 * - Plugin settings declaration schema (Valibot-validated)
 * - `secret` field type (server-only, AES-256-GCM encrypted at rest)
 * - Submitted value validation against declaration
 * - Narrow SettingsField subset (no content widgets like image/reference)
 * - `requiredCapabilities` gating for per-plugin settings access
 */

import type { PluginCapability } from "./types";

// ============================================================================
// Settings Field Types
// ============================================================================

/**
 * SettingsField is a narrow subset of the full content Field union.
 * A plugin settings declaration can only use these types — things like
 * 'image', 'reference', or 'richText' would fall through to a bare text
 * input and store nonsense.
 *
 * SecretField is deliberately excluded from FieldTypeMap so 'secret'
 * can't leak into content schemas. Settings are config, not content.
 */
export type SettingsFieldType = "string" | "text" | "number" | "boolean" | "secret";

export interface SettingsFieldBase {
  type: SettingsFieldType;
  name: string;
  label?: string;
  description?: string;
  default?: unknown;
  placeholder?: string;
  required?: boolean;
  /** For string/text fields: allowed values (enum-like). */
  list?: string[];
  /** For number fields. */
  min?: number;
  max?: number;
  step?: number;
}

export interface StringSettingsField extends SettingsFieldBase {
  type: "string";
  default?: string;
  list?: string[];
}

export interface TextSettingsField extends SettingsFieldBase {
  type: "text";
  default?: string;
}

export interface NumberSettingsField extends SettingsFieldBase {
  type: "number";
  default?: number;
  min?: number;
  max?: number;
  step?: number;
}

export interface BooleanSettingsField extends SettingsFieldBase {
  type: "boolean";
  default?: boolean;
}

export interface SecretSettingsField extends SettingsFieldBase {
  type: "secret";
  /** Secrets never have a default value that reaches the client. */
  default?: never;
}

export type SettingsField =
  | StringSettingsField
  | TextSettingsField
  | NumberSettingsField
  | BooleanSettingsField
  | SecretSettingsField;

// ============================================================================
// Settings Part Declaration
// ============================================================================

/**
 * A plugin's settings part declaration.
 * Plugins export this as part of their definition.
 */
export interface SettingsPart {
  /** Human-readable label for the settings panel. */
  label?: string;

  /** Description shown at the top of the settings form. */
  description?: string;

  /** The fields that make up this plugin's settings form. */
  fields: SettingsField[];

  /**
   * Optional: a more restrictive capability required to manage this
   * specific plugin's settings. If not set, `plugin:settings:manage`
   * is sufficient.
   */
  requiredCapabilities?: PluginCapability[];
}

// ============================================================================
// Validation
// ============================================================================

export interface SettingsValidationIssue {
  field: string;
  message: string;
}

/**
 * Validate submitted plugin settings against the declaration.
 * Returns validation issues — an empty array means valid.
 */
export function validatePluginSettings(
  submitted: Record<string, unknown>,
  declaration: SettingsPart,
): SettingsValidationIssue[] {
  const issues: SettingsValidationIssue[] = [];

  for (const field of declaration.fields) {
    const value = submitted[field.name];

    // Check required
    if (field.required && (value === undefined || value === null || value === "")) {
      // Exception: secret fields can be blank (means "don't change")
      if (field.type !== "secret") {
        issues.push({
          field: field.name,
          message: `"${field.label || field.name}" is required`,
        });
      }
      continue;
    }

    if (value === undefined || value === null || value === "") continue;

    // Type-specific validation
    switch (field.type) {
      case "number": {
        const num = Number(value);
        if (isNaN(num)) {
          issues.push({
            field: field.name,
            message: `"${field.label || field.name}" must be a number, got "${String(value)}"`,
          });
        } else {
          if (field.min !== undefined && num < field.min) {
            issues.push({
              field: field.name,
              message: `"${field.label || field.name}" must be at least ${field.min}`,
            });
          }
          if (field.max !== undefined && num > field.max) {
            issues.push({
              field: field.name,
              message: `"${field.label || field.name}" must be at most ${field.max}`,
            });
          }
        }
        break;
      }

      case "boolean": {
        if (typeof value !== "boolean" && value !== "true" && value !== "false") {
          issues.push({
            field: field.name,
            message: `"${field.label || field.name}" must be true or false`,
          });
        }
        break;
      }

      case "string":
      case "text": {
        if (typeof value !== "string") {
          issues.push({
            field: field.name,
            message: `"${field.label || field.name}" must be a string`,
          });
        } else if (field.list && field.list.length > 0 && !field.list.includes(value)) {
          issues.push({
            field: field.name,
            message: `"${field.label || field.name}" must be one of: ${field.list.join(", ")}`,
          });
        }
        break;
      }

      case "secret": {
        if (typeof value !== "string") {
          issues.push({
            field: field.name,
            message: `"${field.label || field.name}" must be a string (or blank to keep existing)`,
          });
        }
        break;
      }
    }
  }

  return issues;
}

/**
 * Extract the names of all `secret`-typed fields from a settings declaration.
 */
export function getSecretFieldNames(declaration: SettingsPart): string[] {
  return declaration.fields.filter((f) => f.type === "secret").map((f) => f.name);
}

/**
 * Check if a settings declaration has any secret fields.
 */
export function hasSecretFields(declaration: SettingsPart): boolean {
  return declaration.fields.some((f) => f.type === "secret");
}
