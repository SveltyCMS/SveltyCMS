/**
 * @file src/services/content/preview-service.ts
 * @description Centralized service for generating authorized live preview URLs using Signed Tokens.
 *
 * ### Security Hardening (2026-05-24):
 * - Fail-closed when PREVIEW_SECRET is missing
 * - Timing-safe signature comparison via crypto.timingSafeEqual
 * - Structured signed payload with tenantId, entryId, exp, aud fields
 * - Full HMAC-SHA256 (no truncation)
 * - URL-encoded query parameter prevents delimiter injection
 */

import crypto from "node:crypto";
import type { CollectionEntry, Schema } from "@src/content/types";
import { getPrivateSettingSync, getPublicSettingSync } from "../core/settings-service";
import { logger } from "@utils/logger";

const TOKEN_TTL_MS = 1000 * 60 * 30; // 30 minutes

interface PreviewPayload {
  sub: string; // userId
  entryId: string;
  tenantId: string;
  exp: number; // expiry timestamp (ms)
  aud: string; // audience = host
}

export class PreviewService {
  private static instance: PreviewService;

  private constructor() {}

  public static getInstance(): PreviewService {
    if (!PreviewService.instance) {
      PreviewService.instance = new PreviewService();
    }
    return PreviewService.instance;
  }

  /**
   * Generates an authorized preview URL using a short-lived Signed Token.
   * 🛡️ FAIL-CLOSED: Returns empty string if PREVIEW_SECRET is missing.
   */
  public generatePreviewUrl(
    schema: Schema,
    entry: CollectionEntry,
    contentLanguage: string,
    tenantId?: string | null,
    userId?: string,
  ): string {
    const base = this.resolveBasePattern(schema, entry, contentLanguage, tenantId);
    if (!base) return "";

    const secret = getPrivateSettingSync("PREVIEW_SECRET");
    if (!secret) {
      logger.error("PREVIEW_SECRET is not configured. Preview URLs disabled for security.");
      return ""; // 🛡️ FAIL-CLOSED
    }

    // 1. Create structured signed payload
    const payload: PreviewPayload = {
      sub: userId || "anon",
      entryId: String(entry._id),
      tenantId: tenantId || "default",
      exp: Date.now() + TOKEN_TTL_MS,
      aud: this.getAudience(base),
    };

    // 2. Sign with full HMAC-SHA256
    const payloadJson = JSON.stringify(payload);
    const signature = crypto
      .createHmac("sha256", secret as string)
      .update(payloadJson)
      .digest("hex"); // Full 64-char hex

    // 3. Encode as Base64URL (payload + signature)
    const token = Buffer.from(`${payloadJson}.${signature}`).toString("base64url");

    // 4. Construct Final URL
    const separator = base.includes("?") ? "&" : "?";
    return `${base}${separator}preview_token=${encodeURIComponent(token)}`;
  }

  /**
   * Validates a Signed Preview Token.
   * 🛡️ Uses timingSafeEqual to prevent timing attacks.
   */
  public validateToken(
    token: string,
    entryId?: string,
  ): { valid: boolean; userId: string; tenantId: string } {
    try {
      const secret = getPrivateSettingSync("PREVIEW_SECRET") as string;
      if (!secret) return { valid: false, userId: "", tenantId: "" };

      const decoded = Buffer.from(token, "base64url").toString();
      const separatorIdx = decoded.lastIndexOf(".");
      if (separatorIdx === -1) return { valid: false, userId: "", tenantId: "" };

      const payloadJson = decoded.slice(0, separatorIdx);
      const providedSig = decoded.slice(separatorIdx + 1);

      // Re-calculate expected signature
      const expectedSig = crypto.createHmac("sha256", secret).update(payloadJson).digest("hex");

      // 🛡️ TIMING-SAFE comparison
      const providedBuf = Buffer.from(providedSig, "hex");
      const expectedBuf = Buffer.from(expectedSig, "hex");
      if (
        providedBuf.length !== expectedBuf.length ||
        !crypto.timingSafeEqual(providedBuf, expectedBuf)
      ) {
        return { valid: false, userId: "", tenantId: "" };
      }

      // Parse payload
      const payload: PreviewPayload = JSON.parse(payloadJson);

      // Check expiration
      if (Date.now() > payload.exp) return { valid: false, userId: "", tenantId: "" };

      // Check entry ID binding (if provided)
      if (entryId && payload.entryId !== entryId) return { valid: false, userId: "", tenantId: "" };

      return { valid: true, userId: payload.sub, tenantId: payload.tenantId };
    } catch {
      return { valid: false, userId: "", tenantId: "" };
    }
  }

  private getAudience(baseUrl: string): string {
    try {
      return new URL(baseUrl).hostname;
    } catch {
      return "localhost";
    }
  }

  /**
   * Helper to resolve the base pattern from collection schema
   */
  private resolveBasePattern(
    schema: Schema,
    entry: CollectionEntry,
    contentLanguage: string,
    tenantId?: string | null,
  ): string {
    const pattern = schema.livePreview;
    if (!pattern || typeof pattern !== "string") return "";

    const baseUrl =
      getPublicSettingSync("HOST_PROD") ||
      getPublicSettingSync("HOST_DEV") ||
      "http://localhost:5173";
    let resolvedPath = pattern;

    const slugValue = this.getFieldValue(entry, "slug", contentLanguage) || entry._id || "draft";
    resolvedPath = resolvedPath.replace(/{slug}/g, String(slugValue));
    resolvedPath = resolvedPath.replace(/{_id}/g, String(entry._id || "draft"));
    resolvedPath = resolvedPath.replace(/{id}/g, String(entry._id || "draft"));

    if (!resolvedPath.includes("lang=")) {
      const separator = resolvedPath.includes("?") ? "&" : "?";
      resolvedPath += `${separator}lang=${contentLanguage}`;
    }

    if (tenantId && !resolvedPath.includes("tenantId=")) {
      const separator = resolvedPath.includes("?") ? "&" : "?";
      resolvedPath += `${separator}tenantId=${tenantId}`;
    }

    if (resolvedPath.startsWith("http://") || resolvedPath.startsWith("https://")) {
      return resolvedPath;
    }

    return baseUrl.endsWith("/") && resolvedPath.startsWith("/")
      ? baseUrl + resolvedPath.slice(1)
      : baseUrl + resolvedPath;
  }

  private getFieldValue(entry: Record<string, any>, fieldName: string, language: string): any {
    const value = entry[fieldName];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value[language] || value.en || Object.values(value)[0];
    }
    return value;
  }
}

export const previewService = PreviewService.getInstance();
