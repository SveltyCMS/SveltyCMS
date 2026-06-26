/**
 * @file src/utils/native-utils.ts
 * @description Lightweight, native utility replacements for common libraries (uuid, picocolors).
 * This module is designed to eliminate dependency bloat and maximize performance.
 */

/**
 * Generates a RFC 4122 compliant v4 UUID using the platform's native CSPRNG (crypto.randomUUID).
 * Replaces the 'uuid' package with a high-entropy, native implementation.
 */
export function generateUUID(): string {
  const crypto = globalThis?.crypto;
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    // Generate 16 random bytes (128 bits) for UUID v4
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant RFC 4122
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  throw new Error("Cryptographically secure random number generator is not available");
}

/**
 * Generates a high-entropy secure token for sensitive operations (API keys, secrets).
 * Default is 32 bytes (256 bits) to ensure quantum-safe security levels (resists Grover's algorithm).
 */
export function generateSecureToken(bytes = 32): string {
  const crypto = globalThis?.crypto;
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const array = new Uint8Array(bytes);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  throw new Error("Cryptographically secure random number generator is not available");
}

/**
 * Minimalist ANSI color utility for terminal output.
 * Replaces 'picocolors'.
 */
const ESC = "\x1b[";
const RESET = `${ESC}0m`;

export const pc = {
  reset: RESET,
  bold: (s: string) => `${ESC}1m${s}${RESET}`,
  dim: (s: string) => `${ESC}2m${s}${RESET}`,
  italic: (s: string) => `${ESC}3m${s}${RESET}`,
  underline: (s: string) => `${ESC}4m${s}${RESET}`,

  // Colors
  black: (s: string) => `${ESC}30m${s}${RESET}`,
  red: (s: string) => `${ESC}31m${s}${RESET}`,
  green: (s: string) => `${ESC}32m${s}${RESET}`,
  yellow: (s: string) => `${ESC}33m${s}${RESET}`,
  blue: (s: string) => `${ESC}34m${s}${RESET}`,
  magenta: (s: string) => `${ESC}35m${s}${RESET}`,
  cyan: (s: string) => `${ESC}36m${s}${RESET}`,
  white: (s: string) => `${ESC}37m${s}${RESET}`,
  gray: (s: string) => `${ESC}90m${s}${RESET}`,

  // Bright Colors
  redBright: (s: string) => `${ESC}91m${s}${RESET}`,
  greenBright: (s: string) => `${ESC}92m${s}${RESET}`,
  yellowBright: (s: string) => `${ESC}93m${s}${RESET}`,
  blueBright: (s: string) => `${ESC}94m${s}${RESET}`,
  magentaBright: (s: string) => `${ESC}95m${s}${RESET}`,
  cyanBright: (s: string) => `${ESC}96m${s}${RESET}`,
};

/**
 * 🚀 GLOBAL STATE HELPERS
 * Used by db.ts for self-healing proxy, boot phase tracking, and settings cache.
 */
export const setGlobal = (key: string, val: any) => {
  (globalThis as any)[key] = val;
  return val;
};

export const getGlobal = <T = any>(key: string, defaultVal: T = null as any): T => {
  const val = (globalThis as any)[key];
  return val !== undefined ? val : defaultVal;
};
