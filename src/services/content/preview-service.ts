/**
 * @file src/services/preview-service.ts
 * @description Centralized service for generating authorized live preview URLs using Signed Tokens.
 */

import crypto from "node:crypto";
import type { CollectionEntry, Schema } from "@src/content/types";
import { getPrivateSettingSync, getPublicSettingSync } from "../core/settings-service";
import { logger } from "@utils/logger";

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
      logger.error("PREVIEW_SECRET is not configured. Live preview will be insecure.");
      return base;
    }

    // 1. Create Token Payload (Identity + Entry + Expiry)
    const expires = Date.now() + 1000 * 60 * 30; // 30 minutes
    const payload = `${userId || "anon"}:${entry._id}:${expires}`;

    // 2. Sign Payload using HMAC-SHA256
    const signature = crypto
      .createHmac("sha256", secret as string)
      .update(payload)
      .digest("hex")
      .slice(0, 32);

    // 3. Encode into Base64URL token
    const token = Buffer.from(`${payload}:${signature}`).toString("base64url");

    // 4. Construct Final URL
    const separator = base.includes("?") ? "&" : "?";
    return `${base}${separator}preview_token=${token}`;
  }

  /**
   * Validates a Signed Preview Token.
   */
  public validateToken(token: string, entryId?: string): { valid: boolean; userId: string } {
    try {
      const decoded = Buffer.from(token, "base64url").toString();
      const [userId, tEntryId, expires, signature] = decoded.split(":");

      // Check Expiration
      if (Date.now() > Number(expires)) return { valid: false, userId: "" };

      // Check Entry ID binding (if provided)
      if (entryId && tEntryId !== entryId) return { valid: false, userId: "" };

      // Re-calculate Signature
      const secret = getPrivateSettingSync("PREVIEW_SECRET") as string;
      const payload = `${userId}:${tEntryId}:${expires}`;
      const expectedSignature = crypto
        .createHmac("sha256", secret)
        .update(payload)
        .digest("hex")
        .slice(0, 32);

      if (signature !== expectedSignature) return { valid: false, userId: "" };

      return { valid: true, userId };
    } catch {
      return { valid: false, userId: "" };
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

    // Resolve Placeholders
    const slugValue = this.getFieldValue(entry, "slug", contentLanguage) || entry._id || "draft";
    resolvedPath = resolvedPath.replace(/{slug}/g, String(slugValue));
    resolvedPath = resolvedPath.replace(/{_id}/g, String(entry._id || "draft"));
    resolvedPath = resolvedPath.replace(/{id}/g, String(entry._id || "draft"));

    // Inject Language if not present
    if (!resolvedPath.includes("lang=")) {
      const separator = resolvedPath.includes("?") ? "&" : "?";
      resolvedPath += `${separator}lang=${contentLanguage}`;
    }

    // Inject Tenant context if multi-tenant
    if (tenantId && !resolvedPath.includes("tenantId=")) {
      const separator = resolvedPath.includes("?") ? "&" : "?";
      resolvedPath += `${separator}tenantId=${tenantId}`;
    }

    // If pattern is already an absolute URL, ignore baseUrl
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
