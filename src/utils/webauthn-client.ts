/**
 * @file src/utils/webauthn-client.ts
 * @description Client-side browser WebAuthn / Passkey helper utilities.
 *
 * Features:
 * - Base64URL to Buffer and Buffer to Base64URL conversions
 * - Feature detection for WebAuthn and Conditional UI (autofill)
 * - Zero-dependency native browser credential helpers
 */

import { browser } from "$app/env";

/** Converts a base64url string to Uint8Array buffer */
export function base64UrlToBuffer(base64url: string): Uint8Array {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  return buf;
}

/** Converts an ArrayBuffer or Uint8Array to base64url string */
export function bufferToBase64Url(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Checks whether WebAuthn is supported in the current browser */
export function isPasskeySupported(): boolean {
  return browser && typeof window !== "undefined" && Boolean(window.PublicKeyCredential);
}
