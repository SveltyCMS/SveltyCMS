/**
 * @file src/utils/cn.ts
 * @description
 * High-performance, zero-dependency class joining utility optimized for Svelte 5.
 * Replaces the runtime overhead of tailwind-merge with a lean, reactive-friendly approach.
 *
 * ### Features:
 * - recursive array/object support
 * - zero runtime dependencies
 * - prioritized performance for Svelte templates
 */

type ClassValue = ClassArray | ClassDictionary | string | number | null | boolean | undefined;
type ClassDictionary = Record<string, any>;
type ClassArray = ClassValue[];

/**
 * Combines conditional class names into a single string.
 * This implementation favors speed and simplicity, relying on the natural CSS cascade
 * and Svelte 5's fine-grained reactivity rather than costly runtime conflict resolution.
 *
 * @param inputs - Array of class values (strings, objects, arrays)
 * @returns A space-separated string of active class names
 */
export function cn(...inputs: ClassValue[]): string {
  let str = "";
  for (let i = 0; i < inputs.length; i++) {
    const val = inputs[i];
    if (!val) continue;

    if (typeof val === "string" || typeof val === "number") {
      str += (str ? " " : "") + val;
    } else if (Array.isArray(val)) {
      const inner = cn(...val);
      if (inner) str += (str ? " " : "") + inner;
    } else if (typeof val === "object") {
      for (const key in val) {
        if (Object.prototype.hasOwnProperty.call(val, key) && val[key]) {
          str += (str ? " " : "") + key;
        }
      }
    }
  }
  return str;
}
