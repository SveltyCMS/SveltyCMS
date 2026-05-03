/**
 * @file src/utils/utils.ts
 * @description A comprehensive utility module for the SveltyCMS project.
 *
 * This file acts as the main entry point for common utilities,
 * re-exporting from specialized sub-modules for better tree-shaking.
 */

import type { FieldInstance, FieldValue } from "@src/content/types";
import { publicEnv } from "@src/stores/global-settings.svelte";

// Re-exports from sub-modules
export * from "./form.svelte";
export * from "./date";
export * from "./file";
export * from "./string";
export * from "./navigation";
export * from "./tenant";
export * from "./preview";
export * from "./security";
export * from "./modal.svelte";
export * from "./logger";
export * from "./api";

export const config = {
  headers: {
    "Content-Type": "multipart/form-data",
  },
};

/**
 * Interface for GUI field configuration in the Collection Builder.
 */
export interface GuiFieldConfig {
  required: boolean;
  widget: unknown | string;
  [key: string]: unknown;
}

export function uniqueItems<T extends Record<string, unknown>>(items: T[], key: string): T[] {
  const uniqueMap = new Map(items.map((item) => [item[key], item]));
  return Array.from(uniqueMap.values());
}

// This function generates GUI fields based on field parameters and a GUI schema.
export const getGuiFields = (
  fieldParams: Record<string, unknown>,
  guiSchema: Record<string, GuiFieldConfig>,
): Record<string, unknown> => {
  const guiFields: Record<string, unknown> = {};
  for (const key in guiSchema) {
    const value = fieldParams[key];
    if (value !== undefined) {
      if (Array.isArray(value)) {
        guiFields[key] = deepCopy(value);
      } else {
        guiFields[key] = value;
      }
    }
  }
  return guiFields;
};

// Get the environment variables for image sizes
const envSizes = publicEnv.IMAGE_SIZES || {};
export const SIZES = { ...envSizes, original: 0, thumbnail: 200 } as const;

// Takes an object and recursively parses any values that can be converted to JSON
export function parse<T>(obj: unknown): T {
  if (typeof obj !== "object" || obj === null) {
    return obj as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => parse(item)) as unknown as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      try {
        result[key] = JSON.parse(value);
      } catch {
        result[key] = value;
      }
    } else {
      result[key] = parse(value);
    }
  }
  return result as T;
}

// Returns field's database field name or label
export function getFieldName(
  field: Partial<FieldInstance> & { label: string },
  rawName = false,
): string {
  if (!field) {
    return "";
  }

  if (field.db_fieldName) {
    return field.db_fieldName;
  }

  const specialMappings: Record<string, string> = {
    "First Name": "first_name",
    "Last Name": "last_name",
  };

  let name = field.label;
  if (!name && "widget" in field && (field as any).widget?.Name) {
    name = (field as any).widget.Name;
  }
  if (!name && "type" in field) {
    name = (field as any).type as string;
  }
  if (!name) {
    name = "unknown_field";
  }

  if (rawName) {
    return name;
  }

  if (specialMappings[name]) {
    return specialMappings[name];
  }

  let result = name
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");

  // GraphQL identifiers cannot start with a digit
  if (/^[0-9]/.test(result)) {
    result = "_" + result;
  }
  return result;
}

// Extract data from fields
export async function extractData(
  fieldsData: Record<string, FieldInstance>,
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(fieldsData)) {
    if (field.callback) {
      result[key] = await field.callback({
        data: field as unknown as Record<string, FieldValue>,
      });
    } else {
      result[key] = field.default ?? null;
    }
  }
  return result;
}

export function deepCopy<T>(obj: T): T {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(obj);
    } catch {
      // Fallback for objects that cannot be cloned via structuredClone (e.g. functions, DOM nodes)
    }
  }

  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => deepCopy(item)) as unknown as T;
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime()) as unknown as T;
  }

  const copy = {} as T;
  for (const key in obj) {
    if (Object.hasOwn(obj, key)) {
      copy[key] = deepCopy(obj[key]);
    }
  }
  return copy;
}

// Get elements by ID
interface ElementStore {
  [key: string]: {
    id: string;
    callback: (data: unknown) => void;
  }[];
}

export const get_elements_by_id = {
  store: {} as ElementStore,
  add(collection: string, id: string, callback: (data: unknown) => void) {
    if (!this.store[collection]) {
      this.store[collection] = [];
    }
    this.store[collection].push({ id, callback });
  },
  async getAll(dbAdapter: { get: (id: string) => Promise<unknown> }) {
    for (const collection in this.store) {
      if (!Object.hasOwn(this.store, collection)) {
        continue;
      }
      for (const item of this.store[collection]) {
        const data = await dbAdapter.get(item.id);
        item.callback(data);
      }
    }
  },
};

// Meta data types
interface MetaData {
  media_images_remove?: string[];
  [key: string]: unknown;
}

export const meta_data = {
  meta_data: {} as MetaData,
  add(key: keyof MetaData, data: unknown) {
    this.meta_data[key] = data;
  },
  get(): MetaData {
    return this.meta_data;
  },
  clear() {
    this.meta_data = {};
  },
  is_empty(): boolean {
    return Object.keys(this.meta_data).length === 0;
  },
};

// Convert data to string
interface StringHelperParams {
  data: unknown[];
  field?: FieldInstance;
  path?: (lang: string) => string;
}

export function toStringHelper({ data }: StringHelperParams): string {
  if (!Array.isArray(data)) {
    return "";
  }
  return data.map((item: unknown) => String(item)).join(", ");
}

// Enhanced debounce utility with flexible patterns
export function debounce(delay = 300, immediate = false) {
  let timer: NodeJS.Timeout | undefined;
  let hasExecuted = false;

  return (fn: () => void) => {
    const shouldExecuteImmediately = immediate && !hasExecuted;

    if (shouldExecuteImmediately) {
      fn();
      hasExecuted = true;
      return;
    }

    clearTimeout(timer);
    timer = setTimeout(() => {
      fn();
    }, delay);
  };
}

// Traditional debounce pattern
debounce.create = <T extends (...args: unknown[]) => unknown>(
  func: T,
  wait = 300,
): ((...args: Parameters<T>) => void) => {
  let timeout: ReturnType<typeof setTimeout>;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };

    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

export async function motion(
  start: number[],
  end: number[],
  duration: number,
  cb: (current: number[]) => void,
) {
  const current = [...start];
  let elapsed = 0;
  let time = Date.now();
  let hasPassed = false;
  setTimeout(() => {
    hasPassed = true;
  }, duration);
  return new Promise<void>((resolve) => {
    function animation(current: number[]) {
      elapsed = Date.now() - time;
      const ds = start.map((s, i) => (s - end[i]) / (duration / elapsed));

      time = Date.now();
      for (const [index, d] of ds.entries()) {
        current[index] -= d;
      }

      if (hasPassed) {
        cb(end);
        resolve();
        return;
      }
      cb(current);
      if (typeof requestAnimationFrame !== "undefined") {
        requestAnimationFrame(() => animation(current));
      } else {
        setTimeout(() => animation(current), 16);
      }
    }

    if (typeof requestAnimationFrame !== "undefined") {
      requestAnimationFrame(() => animation(current));
    } else {
      setTimeout(() => animation(current), 16);
    }
  });
}

// Type assertion helper
export function asAny<T>(value: unknown): T {
  return value as T;
}
