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

const pluralRulesCache = new Map<string, Intl.PluralRules>();

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

  let rules = pluralRulesCache.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale);
    pluralRulesCache.set(locale, rules);
  }
  const rule = rules.select(count);
  const result = forms[rule as keyof PluralForms] ?? forms.other;

  return appendCount ? `${count} ${result}` : result;
}

/**
 * Nouns whose plural is the same word: Latin/Greek plurals that already end in
 * -a/-ia. `englishPlural` used to return "medias" for `media`, which is already
 * plural and uninflected.
 *
 * A blanket `-a$` / `-ia$` rule is wrong in English: `pizza`, `idea` and
 * `encyclopedia` end the same way and are singular, so they must still take an
 * -s. Hence an explicit list instead of an ending.
 */
const UNINFLECTED_PLURALS = new Set([
  "media",
  "data",
  "criteria",
  "phenomena",
  "bacteria",
  "curricula",
  "memoranda",
  "addenda",
  "errata",
  "strata",
  "referenda",
  "spectra",
]);

/**
 * Derives the English plural of a UI noun label ("entry" → "entries").
 *
 * Confirmation dialogs and toasts build strings like "Delete 2 entries" from a
 * singular, locale-independent label. Concatenating the label produced
 * "Delete 2 entry"; writing "(s)" produced "Delete 2 entry(s)". Use with a
 * count when no translated plural form is available; localized copy goes
 * through Paraglide plural messages instead.
 *
 * @param noun Singular English noun.
 * @param count Number of items the noun refers to.
 */
export function englishPlural(noun: string, count: number): string {
  const word = String(noun ?? "").trim();
  if (!word || count === 1) return word;
  // Already plural ("entries") — leave it alone.
  if (/s$/i.test(word) && !/ss$/i.test(word)) return word;
  // Latin/Greek plurals ("media", "criteria"): "-ae"/"-s" would be wrong.
  if (UNINFLECTED_PLURALS.has(word.toLowerCase())) return word;
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  return `${word}s`;
}

/**
 * Escapes regex metacharacters in a string.
 */
export function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const RTL_LANGUAGES = new Set([
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

/**
 * Returns the text direction (ltr/rtl) for a given language code.
 * Accepts ISO 639-1 (`ar`) and regional tags (`ar-SA`); lookup is O(1) on the base.
 */
export function getTextDirection(lang: string): "ltr" | "rtl" {
  const base = lang.trim().toLowerCase().replace(/_/g, "-").split("-")[0] ?? "";
  return RTL_LANGUAGES.has(base) ? "rtl" : "ltr";
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

const EDIT_DISTANCE_SCRATCH_CAP = 257;
const _editDistV0 = new Int32Array(EDIT_DISTANCE_SCRATCH_CAP);
const _editDistV1 = new Int32Array(EDIT_DISTANCE_SCRATCH_CAP);

/**
 * 🚀 Performance: Optimized Levenshtein Distance.
 * Uses pre-allocated module scratch Int32Array rows for strings up to 256 chars
 * (zero heap allocations per call) instead of a full N×M matrix.
 */
export function getEditDistance(a: string, b: string): number {
  if (a === b) return 0;
  const lenA = a.length;
  const lenB = b.length;
  if (lenA === 0) return 1;
  if (lenB === 0) return 1;

  const useScratch = lenA < EDIT_DISTANCE_SCRATCH_CAP;
  const v0 = useScratch ? _editDistV0 : new Int32Array(lenA + 1);
  const v1 = useScratch ? _editDistV1 : new Int32Array(lenA + 1);

  for (let i = 0; i <= lenA; i++) v0[i] = i;

  for (let i = 0; i < lenB; i++) {
    v1[0] = i + 1;
    const bCode = b.charCodeAt(i);
    for (let j = 0; j < lenA; j++) {
      const cost = a.charCodeAt(j) === bCode ? 0 : 1;
      const del = v0[j + 1] + 1;
      const ins = v1[j] + 1;
      const sub = v0[j] + cost;
      v1[j + 1] = del < ins ? (del < sub ? del : sub) : ins < sub ? ins : sub;
    }
    for (let j = 0; j <= lenA; j++) v0[j] = v1[j];
  }

  return v0[lenA] / Math.max(lenA, lenB);
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

/**
 * Unified string sanitization and validation utilities.
 */
export const str = {
  /** Trim whitespace from an identifier without changing character set */
  normalizeId: (id: string): string => id.trim(),

  /** Normalize to a safe filesystem/URL key (trim, lowercase, strip non [a-z0-9_-]) */
  toSafeKey: (key: string): string =>
    key
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, ""),

  /** Unified empty-value check — handles null, undefined, and whitespace-only strings */
  isEmpty: (val: unknown): boolean => val == null || (typeof val === "string" && val.trim() === ""),

  /** Safe truncation for UI labels with optional ellipsis */
  truncate: (s: string, len: number): string => (s.length > len ? `${s.slice(0, len)}...` : s),

  /** Securely strips a known base prefix from a path, preventing leakage */
  stripBase: (fullPath: string, base: string): string =>
    fullPath.startsWith(base) ? fullPath.slice(base.length) : fullPath,

  /** Escape a string for safe use in regex patterns */
  escapeRegex: (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
} as const;
