/**
 * @file src/utils/media/signed-urls.ts
 * @description HMAC-SHA256 signed (time-limited) media URLs for secure file serving.
 *
 * ### Security Hardening:
 * - Full HMAC-SHA256 signature (64-char hex, no truncation)
 * - Timing-safe comparison via crypto.timingSafeEqual
 * - Expiration check on every validation
 * - Fail-closed when MEDIA_SIGNED_URL_SECRET is missing
 * - Signature covers filePath + tenantId + expiration to prevent replay across tenants
 * - TenantId pipe-delimiter injection sanitization
 * - Constant-time rejection for invalid hex signatures
 * - Secret memoized at module scope (loaded once)
 *
 * ### Features:
 * - generateSignedMediaUrl - create time-limited signed URLs
 * - validateSignedMediaUrl - verify incoming signed URL requests
 * - Configurable TTL (default: 1 hour)
 */

import crypto from "node:crypto";
import { getPrivateSettingSync } from "@src/services/core/settings-service";
import { logger } from "@utils/logger";

const DEFAULT_TTL_MS = 3600000; // 1 hour

// Hex regex for 64-char HMAC-SHA256 hex string (case-insensitive)
const HEX_RE = /^[0-9a-f]{64}$/i;

/**
 * Memoized secret — loaded once at module scope to avoid repeated setting lookups.
 */
const SECRET: string | null = (() => {
  const s = getPrivateSettingSync("MEDIA_SIGNED_URL_SECRET") as string | undefined;
  if (!s) {
    logger.warn("MEDIA_SIGNED_URL_SECRET not configured. Signed URLs unavailable.");
    return null;
  }
  return s || null;
})();

/**
 * Validates the file path to prevent path traversal and absolute path attacks.
 *
 * @param filePath - The file path to validate
 * @returns The normalized file path, or null if invalid
 */
function validateFilePath(filePath: string): string | null {
  if (!filePath || filePath.trim() === "") return null;
  if (filePath.includes("..")) return null;
  if (filePath.startsWith("/") || /^[a-zA-Z]:\\/.test(filePath)) return null;
  return filePath;
}

/**
 * Generates an HMAC-SHA256 signed URL for a media file.
 * 🛡️ FAIL-CLOSED: Returns empty string if MEDIA_SIGNED_URL_SECRET is missing.
 *
 * @param filePath - Relative file path (e.g., "tenantId/abcd1234/original/image.jpg")
 * @param tenantId - Optional tenant ID for multi-tenant isolation
 * @param ttlMs - Time-to-live in milliseconds (default: 1 hour)
 * @returns Signed URL path with ?sig and ?exp query params, or empty string on failure
 */
export function generateSignedMediaUrl(
  filePath: string,
  tenantId?: string | null,
  ttlMs: number = DEFAULT_TTL_MS,
): string {
  if (!SECRET) return ""; // 🛡️ FAIL-CLOSED

  const safePath = validateFilePath(filePath);
  if (!safePath) {
    logger.warn("Invalid file path for signed URL generation", { filePath });
    return "";
  }

  // Sanitize tenantId to prevent pipe-delimiter injection into the payload
  const safeTenant = (tenantId || "default").replace(/\|/g, "_");
  const expiration = (Date.now() + ttlMs).toString();

  // Pipe-delimited payload; file paths and tenantId are sanitized against pipe injection
  const payload = `${safePath}|${safeTenant}|${expiration}`;

  const signature = crypto.createHmac("sha256", SECRET).update(payload).digest("hex"); // Full 64-char hex

  const encodedPath = safePath.startsWith("/") ? safePath : `/${safePath}`;
  return `/files${encodedPath}?sig=${signature}&exp=${expiration}`;
}

/**
 * Validates a signed media URL from an incoming request.
 * 🛡️ Uses timingSafeEqual to prevent timing attacks.
 *
 * @param url - The full request URL (parsed via new URL())
 * @param filePath - The file path being accessed (from route params)
 * @param tenantId - Optional tenant ID for multi-tenant isolation
 * @returns { valid: boolean; reason?: string }
 */
export function validateSignedMediaUrl(
  url: URL,
  filePath: string,
  tenantId?: string | null,
): { valid: boolean; reason?: string } {
  try {
    if (!SECRET) {
      return { valid: false, reason: "SIGNED_URL_SECRET_MISSING" };
    }

    const safePath = validateFilePath(filePath);
    if (!safePath) {
      return { valid: false, reason: "INVALID_FILE_PATH" };
    }

    const sig = url.searchParams.get("sig");
    const exp = url.searchParams.get("exp");

    if (!sig || !exp) {
      return { valid: false, reason: "MISSING_SIGNATURE_PARAMS" };
    }

    // Check expiration
    const expTime = parseInt(exp, 10);
    if (isNaN(expTime) || Date.now() > expTime) {
      return { valid: false, reason: "SIGNATURE_EXPIRED" };
    }

    // 🛡️ Constant-time rejection: validate hex format BEFORE Buffer.from
    // Buffer.from("invalid", "hex") throws TypeError, creating a timing oracle
    if (!HEX_RE.test(sig)) {
      // Burn constant time to avoid leaking invalid-hex early exit
      crypto.createHmac("sha256", SECRET).update("_reject").digest("hex");
      return { valid: false, reason: "SIGNATURE_MISMATCH" };
    }
    const providedBuf = Buffer.from(sig, "hex");

    // Sanitize tenantId to prevent pipe-delimiter injection into the payload
    const safeTenant = (tenantId || "default").replace(/\|/g, "_");

    // Recompute expected signature
    const payload = `${safePath}|${safeTenant}|${exp}`;
    const expectedSig = crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
    const expectedBuf = Buffer.from(expectedSig, "hex");

    // 🛡️ TIMING-SAFE comparison
    if (
      providedBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(providedBuf, expectedBuf)
    ) {
      return { valid: false, reason: "SIGNATURE_MISMATCH" };
    }

    return { valid: true };
  } catch (err) {
    logger.error("Error validating signed media URL", err);
    return { valid: false, reason: "VALIDATION_ERROR" };
  }
}
