/**
 * @file src/utils/form.ts
 * @description Form data handling and conversion utilities.
 */

/**
 * Converts an object to FormData.
 */
export const obj2formData = (obj: Record<string, unknown>): FormData => {
  const formData = new FormData();

  const transformValue = (value: unknown): string | Blob => {
    if (value instanceof Blob) {
      return value;
    }
    if (typeof value === "object" && value !== null) {
      return JSON.stringify(value);
    }
    if (typeof value === "boolean" || typeof value === "number") {
      return value.toString();
    }
    if (value === null || value === undefined) {
      return "";
    }
    return String(value);
  };

  for (const key in obj) {
    if (!Object.hasOwn(obj, key)) {
      continue;
    }
    const value = obj[key];
    if (value !== undefined) {
      formData.append(key, transformValue(value));
    }
  }

  return formData;
};

/**
 * Converts data to FormData object with optimized file handling and type safety.
 */
export const col2formData = async (
  getData: Record<string, () => Promise<unknown> | unknown>,
): Promise<FormData> => {
  const formData = new FormData();

  const processValue = async (value: unknown): Promise<string | Blob> => {
    if (value instanceof Blob) {
      return value;
    }
    if (value instanceof Promise) {
      const resolvedValue = await value;
      return processValue(resolvedValue);
    }
    if (typeof value === "object" && value !== null) {
      return JSON.stringify(value);
    }
    return String(value);
  };

  const appendToForm = async () => {
    for (const [key, getter] of Object.entries(getData)) {
      const value = getter();
      const processedValue = await processValue(value);
      formData.append(key, processedValue);
    }
  };

  await appendToForm();
  return formData;
};

/**
 * Simple object to form data conversion for basic types.
 */
export const toFormData = (obj: Record<string, string | number | boolean>): FormData => {
  const formData = new FormData();
  for (const [key, value] of Object.entries(obj)) {
    formData.append(key, String(value));
  }
  return formData;
};

interface SchemaField {
  type: string;
  widget?: unknown;
  [key: string]: unknown;
}

/**
 * Converts fields to a schema object.
 */
export const fieldsToSchema = (fields: SchemaField[]): Record<string, unknown> => {
  const schema: Record<string, unknown> = {};

  for (const field of fields) {
    const { type, ...rest } = field;
    schema[type] = rest;
  }

  return schema;
};
