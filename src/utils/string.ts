/**
 * @file src/utils/string.ts
 * @description String manipulation and cryptographic utilities.
 */

/**
 * PascalCase to camelCase conversion.
 */
export const pascalToCamelCase = (str: string): string => {
  if (!str) {
    return str;
  }
  return str.charAt(0).toLowerCase() + str.slice(1);
};

/**
 * Escapes regex metacharacters in a string.
 */
export function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Generates a random hex string of the given byte size.
 */
export function getRandomHex(size: number): string {
  const crypto = globalThis?.crypto;
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(size);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  throw new Error("Cryptographic API unavailable");
}

/**
 * Sanitizes field names for use in GraphQL type names.
 */
export function sanitizeGraphQLTypeName(name: string): string {
  if (!name) {
    return "";
  }
  let sanitized = name.replace(/\s+/g, "_").replace(/[^A-Za-z0-9_]/g, "");
  if (sanitized && !/^[A-Za-z_]/.test(sanitized)) {
    sanitized = `_${sanitized}`;
  }
  return sanitized || "_invalid_name";
}

/**
 * Creates a clean GraphQL type name from collection info.
 */
export function createCleanTypeName(collection: { _id?: string; name?: string | unknown }): string {
  const rawName = typeof collection.name === "string" ? collection.name : "";
  const baseName = rawName.split("/").pop() || rawName;
  const cleanName = baseName
    .replace(/[^a-zA-Z0-9]/g, "")
    .replace(/^[0-9]/, "Collection$&")
    .replace(/^[a-z]/, (c) => c.toUpperCase());
  const shortId = (collection._id ?? "").substring(0, 8);
  return `${cleanName}_${shortId}`;
}

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
