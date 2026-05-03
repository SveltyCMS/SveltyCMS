/**
 * @file src/utils/form.svelte.ts
 * @description Modern Svelte 5 Form Suite for SveltyCMS.
 *
 * Consolidates:
 * - Form class (rune-based state management)
 * - Validation helpers (Valibot integration)
 * - Transformation utilities (obj2formData, col2formData)
 */

import type { ActionResult, SubmitFunction } from "@sveltejs/kit";
import { type BaseSchema, flatten, safeParse } from "valibot";
import { logger } from "./logger";

// --- Types ---

interface EnhanceOptions {
  onResult?: (input: {
    result: ActionResult;
    update: (opts?: { reset: boolean }) => Promise<void>;
  }) => void | Promise<void>;
  onSubmit?: (input: Parameters<SubmitFunction>[0]) => void;
}

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

/**
 * Converts data to FormData object with optimized file handling and type safety.
 */
export async function col2formData(
  getData: Record<string, () => Promise<unknown> | unknown>,
): Promise<FormData> {
  const formData = new FormData();
  for (const [key, getter] of Object.entries(getData)) {
    let value = getter();
    if (value instanceof Promise) value = await value;

    if (value instanceof Blob) {
      formData.append(key, value);
    } else if (typeof value === "object" && value !== null) {
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
   * SvelteKit use:enhance integration.
   */
  enhance(options?: EnhanceOptions): SubmitFunction {
    return (input) => {
      this.submitting = true;
      this.message = undefined;
      this.errors = {};

      if (options?.onSubmit) options.onSubmit(input);

      if (this.schema) {
        const result = safeParse(this.schema, this.data);
        if (!result.success) {
          this.errors = flatten(result.issues).nested as Record<string, string[]>;
          this.submitting = false;
          input.cancel();
          return;
        }
      }

      return async (resultInput) => {
        const { result, update } = resultInput;
        this.submitting = false;

        if (result.type === "failure") {
          if (result.data?.errors) this.errors = result.data.errors as Record<string, string[]>;
          if (result.data?.message) this.message = result.data.message as string;
        } else if (result.type === "success" && result.data?.message) {
          this.message = result.data.message as string;
        }

        if (options?.onResult) await options.onResult(resultInput);
        else await update();
      };
    };
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

// --- Global Validation Helper ---

/**
 * Procedural validation for one-off checks.
 */
export function validateData<T>(
  schema: BaseSchema<T, T, any>,
  value: T,
): Record<string, string[]> | null {
  try {
    const result = safeParse(schema, value);
    if (result.success) return null;
    return flatten(result.issues).nested as Record<string, string[]>;
  } catch (error) {
    logger.error("Validation error:", error);
    return null;
  }
}
