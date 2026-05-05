import type { DatabaseId } from "@src/content/types";

/**
 * Safely casts a string to a DatabaseId brand type.
 */
export const toDbId = (id: string): DatabaseId => {
  return id as DatabaseId;
};
