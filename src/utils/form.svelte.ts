/**
 * @file src/utils/form.svelte.ts
 * @description Modern Svelte 5 Form Suite for SveltyCMS.
 *
 * Provides rune-based reactive form state management with Valibot validation.
 *
 * ### Features:
 * - `Form<T>` class with `$state`-based reactive data, errors, and message
 * - Valibot schema validation via `validate()`
 * - Utility helpers: `obj2formData`, `col2formData`
 * - Manual `submit()` for standard API endpoints
 */

import { type BaseSchema, flatten, safeParse } from "valibot";

// --- Utilities (Merged from form.ts) ---

/**
 * Converts an object to FormData with support for Blobs and JSON stringification.
 */
export function obj2formData(obj: Record<string, unknown>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    if (value instanceof Blob) {
      formData.append(key, value);
    } else if (typeof value === "object") {
      formData.append(key, JSON.stringify(value));
    } else {
      formData.append(key, String(value));
    }
  }
  return formData;
}

// --- Form Class Implementation ---

export class Form<T extends Record<string, unknown>> {
  data = $state<T>({} as T);
  errors = $state<Record<string, string[]>>({});
  submitting = $state(false);
  message = $state<string | undefined>(undefined);

  constructor(
    initialData: T,
    private readonly schema?: BaseSchema<any, any, any>,
  ) {
    this.data = { ...initialData };
  }

  /**
   * Resets the form state and optionally data.
   */
  reset(newData?: T) {
    if (newData) this.data = { ...newData };
    this.errors = {};
    this.message = undefined;
    this.submitting = false;
  }

  /**
   * Validates form data against the provided schema.
   */
  validate(): boolean {
    this.errors = {};
    this.message = undefined;
    if (!this.schema) return true;

    const result = safeParse(this.schema, this.data);
    if (!result.success) {
      this.errors = flatten(result.issues).nested as Record<string, string[]>;
      return false;
    }
    return true;
  }

  /**
   * Manual submission for standard API endpoints.
   */
  async submit(url: string, options: RequestInit = {}) {
    this.submitting = true;
    this.message = undefined;
    this.errors = {};

    if (!this.validate()) {
      this.submitting = false;
      return { success: false, errors: this.errors };
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        ...options,
        body: JSON.stringify(this.data),
      });

      const data = await response.json();
      if (!response.ok) {
        this.errors = data.errors || {};
        this.message = data.message || "An error occurred";
        return { success: false, data };
      }

      this.message = data.message;
      return { success: true, data };
    } catch (error) {
      this.message = error instanceof Error ? error.message : "Network error";
      return { success: false, error };
    } finally {
      this.submitting = false;
    }
  }
}
