/**
 * @file src/utils/cn.ts
 * @description Optimized class joining utility for Svelte 5.
 *
 * ### Hardening (audit 2026-07):
 * - Array-join pattern: result.push() + join(" ") creates one string (not N intermediate)
 * - Standard for-loops: Object.keys() + indexed loop (faster than for...in + hasOwnProperty)
 * - Minimal truthy check: val[key] suffices since Object.keys() returns own properties
 *
 * High-performance, zero-dependency class joining utility optimized for Svelte 5.
 */

type ClassValue = ClassArray | Record<string, any> | string | number | null | boolean | undefined;
type ClassArray = ClassValue[];

/**
 * Combines conditional class names into a single string.
 * 🛡️ Hardened: Array-join pattern minimizes GC pressure vs string concatenation.
 */
export function cn(...inputs: ClassValue[]): string {
  const result: string[] = [];

  function process(val: ClassValue) {
    if (!val) return;

    if (typeof val === "string" || typeof val === "number") {
      result.push(val.toString());
    } else if (Array.isArray(val)) {
      for (let i = 0; i < val.length; i++) {
        process(val[i]);
      }
    } else if (typeof val === "object") {
      const keys = Object.keys(val);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (val[key]) {
          result.push(key);
        }
      }
    }
  }

  for (let i = 0; i < inputs.length; i++) {
    process(inputs[i]);
  }

  return result.join(" ");
}
