/**
 * @file src/utils/preview-verification.ts
 * @description Consumer-side utility for verifying Signed Preview Tokens.
 *
 * Usage in a SvelteKit frontend `hooks.server.ts`:
 * ```ts
 * import { verifyPreviewToken } from '@sveltycms/utils/preview-verification';
 *
 * export const handle = async ({ event, resolve }) => {
 *   const token = event.url.searchParams.get('preview_token');
 *   if (token) {
 *     const { valid } = verifyPreviewToken(token, PREVIEW_SECRET);
 *     if (valid) {
 *       event.cookies.set('cms_draft_mode', '1', { path: '/', httpOnly: true });
 *     }
 *   }
 *   return resolve(event);
 * };
 * ```
 */

import crypto from "node:crypto";

export interface VerificationResult {
  valid: boolean;
  userId: string;
  entryId: string;
  expires: number;
}

/**
 * Verifies a HMAC-signed preview token.
 *
 * @param token The base64url encoded token from the URL
 * @param secret The shared PREVIEW_SECRET
 * @returns Verification result with metadata
 */
export function verifyPreviewToken(token: string, secret: string): VerificationResult {
  try {
    // 1. Decode token
    const decoded = Buffer.from(token, "base64url").toString();
    const parts = decoded.split(":");

    if (parts.length !== 4) {
      return { valid: false, userId: "", entryId: "", expires: 0 };
    }

    const [userId, entryId, expiresStr, signature] = parts;
    const expires = Number(expiresStr);

    // 2. Check Expiration
    if (Date.now() > expires) {
      return { valid: false, userId, entryId, expires };
    }

    // 3. Verify Signature
    const payload = `${userId}:${entryId}:${expiresStr}`;
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex")
      .slice(0, 32);

    if (signature !== expectedSignature) {
      return { valid: false, userId, entryId, expires };
    }

    return { valid: true, userId, entryId, expires };
  } catch {
    return { valid: false, userId: "", entryId: "", expires: 0 };
  }
}
