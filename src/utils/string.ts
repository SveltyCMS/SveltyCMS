/**
 * @file src/utils/string.ts
 * @description String manipulation and cryptographic utilities.
 */

/**
 * Forms definition for localized plural categories.
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
  const rule = new Intl.PluralRules(locale).select(count);
  // Special case: Intl.PluralRules maps 0 to 'other' in many languages,
  // but 'zero' should be used when explicitly provided.
  let result = forms.other;
  if (count === 0 && forms.zero !== undefined) {
    result = forms.zero;
  } else if (forms[rule] !== undefined) {
    result = forms[rule]!;
  }
  return appendCount ? `${count} ${result}` : result;
}

/**
 * Escapes regex metacharacters in a string.
 */
export function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * @deprecated Use `generateSecureToken(size)` from `@utils/native-utils` instead.
 * This function is kept for backward compatibility only and will be removed.
 * `generateSecureToken` uses the same CSPRNG implementation with a cleaner API.
 */
// getRandomHex removed — use generateSecureToken() from native-utils.ts
// sanitizeGraphQLTypeName removed — unused
// createCleanTypeName removed — graphql resolver has its own version

/**
 * Returns the text direction (ltr/rtl) for a given language code.
 */
export function getTextDirection(lang: string): string {
  const rtlLanguages = [
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
  ];
  return rtlLanguages.includes(lang) ? "rtl" : "ltr";
}

/**
 * Converts hex string to ArrayBuffer.
 */
export function hex2arrayBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes.buffer;
}

/**
 * Converts ArrayBuffer to hex string.
 */
export function arrayBuffer2hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * SHA-256 hash function.
 */
export async function sha256(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return arrayBuffer2hex(hashBuffer);
}

/**
 * Calculates the edit distance (Levenshtein distance) between two strings.
 */
export function getEditDistance(a: string, b: string): number | undefined {
  if (a.length === 0) {
    return b.length;
  }
  if (b.length === 0) {
    return a.length;
  }

  const insertionCost = 1;
  const deletionCost = 1;
  const substitutionCost = 1;

  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + substitutionCost,
          Math.min(matrix[i][j - 1] + insertionCost, matrix[i - 1][j] + deletionCost),
        );
      }
    }
  }

  const maxDistance = Math.max(a.length, b.length);
  const normalizedDistance = matrix[b.length][a.length] / maxDistance;

  return normalizedDistance;
}

/**
 * Recursively parses an object's string values as JSON where possible.
 * Useful for normalizing data from form submissions or URL search params.
 */
export function parse<T>(obj: unknown): T {
  if (typeof obj !== "object" || obj === null) return obj as T;
  if (Array.isArray(obj)) return obj.map((item) => parse(item)) as unknown as T;
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
