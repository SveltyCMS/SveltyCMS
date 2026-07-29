/**
 * @file src/utils/string.ts
 * @description Optimized string manipulation and cryptographic utilities.
 *
 * ### Hardening (audit 2026-07):
 * - Levenshtein: O(N) memory Int32Array replaces O(N×M) 2D matrix
 * - Prototype pollution: parse() filters __proto__, constructor, prototype
 * - Buffer performance: arrayBuffer2hex uses native Buffer.from().toString()
 * - O(1) RTL lookup: Set.has() replaces array.includes()
 * - Hex validation: odd-length guard in hex2arrayBuffer
 */

export interface PluralForms {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
}

/**
 * i18n pluralization using Intl.PluralRules with explicit zero-form support.
 */
export function pluralize(
  count: number,
  forms: PluralForms,
  locale = "en",
  appendCount = false,
): string {
  if (count === 0 && forms.zero) return appendCount ? `0 ${forms.zero}` : forms.zero;

  const rule = new Intl.PluralRules(locale).select(count);
  const result = forms[rule as keyof PluralForms] ?? forms.other;

  return appendCount ? `${count} ${result}` : result;
}

/**
 * Escapes regex metacharacters in a string.
 */
export function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Returns the text direction (ltr/rtl) for a given language code.
 * Uses Set for O(1) lookup.
 */
export function getTextDirection(lang: string): "ltr" | "rtl" {
  const rtlLanguages = new Set([
    "ar",
    "he",
    "fa",
    "ur",
    "dv",
    "ha",
    "khw",
    "ks",
    "ku",
    "ps",
    "syr",
    "ug",
    "yi",
  ]);
  return rtlLanguages.has(lang) ? "rtl" : "ltr";
}

/**
 * Converts hex string to ArrayBuffer.
 * 🛡️ Guards against odd-length strings.
 */
export function hex2arrayBuffer(hex: string): ArrayBuffer {
  if (hex.length % 2 !== 0) throw new Error("Invalid hex string length");
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes.buffer;
}

/**
 * Converts ArrayBuffer to hex string.
 * 🚀 Performance: Buffer.from is faster than Array.from for buffers.
 */
export function arrayBuffer2hex(buffer: ArrayBuffer): string {
  return Buffer.from(buffer).toString("hex");
}

/**
 * SHA-256 hash function.
 */
export async function sha256(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return arrayBuffer2hex(hashBuffer);
}

/**
 * 🚀 Performance: Optimized Levenshtein Distance.
 * Uses two Int32Array rows instead of a full N×M matrix — O(N) memory.
 */
export function getEditDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return 1;

  const v0 = new Int32Array(a.length + 1);
  const v1 = new Int32Array(a.length + 1);

  for (let i = 0; i <= a.length; i++) v0[i] = i;

  for (let i = 0; i < b.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < a.length; j++) {
      const cost = a[j] === b[i] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    v0.set(v1);
  }

  return v0[a.length] / Math.max(a.length, b.length);
}

/**
 * Recursively parses an object's string values as JSON where possible.
 * 🛡️ Hardened against prototype pollution.
 */
export function parse<T>(obj: unknown): T {
  if (typeof obj !== "object" || obj === null) return obj as T;
  if (Array.isArray(obj)) return obj.map((item) => parse(item)) as unknown as T;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    // 🛡️ Prevent Prototype Pollution
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;

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
