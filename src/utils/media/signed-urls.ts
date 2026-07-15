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

/**
 * Retrieves the signing secret.
 * 🛡️ FAIL-CLOSED: Returns null if MEDIA_SIGNED_URL_SECRET is not configured.
 */
function getSecret(): string | null {
  const secret = getPrivateSettingSync("MEDIA_SIGNED_URL_SECRET") as string | undefined;
  if (!secret) {
    logger.warn("MEDIA_SIGNED_URL_SECRET is not configured. Signed URLs are unavailable.");
    return null;
  }
  return secret;
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
  const secret = getSecret();
  if (!secret) return ""; // 🛡️ FAIL-CLOSED

  const expiration = (Date.now() + ttlMs).toString();
  // Pipe-delimited payload; file paths from URL params never contain pipes
  const payload = `${filePath}|${tenantId || "default"}|${expiration}`;

  const signature = crypto.createHmac("sha256", secret).update(payload).digest("hex"); // Full 64-char hex

  const encodedPath = filePath.startsWith("/") ? filePath : `/${filePath}`;
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
    const secret = getSecret();
    if (!secret) {
      return { valid: false, reason: "SIGNED_URL_SECRET_MISSING" };
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

    // Recompute expected signature
    const payload = `${filePath}|${tenantId || "default"}|${exp}`;
    const expectedSig = crypto.createHmac("sha256", secret).update(payload).digest("hex");

    // 🛡️ TIMING-SAFE comparison
    const providedBuf = Buffer.from(sig, "hex");
    const expectedBuf = Buffer.from(expectedSig, "hex");

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
