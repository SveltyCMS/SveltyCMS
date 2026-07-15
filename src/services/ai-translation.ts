/**
 * @file src/services/ai-translation.ts
 * @description Per-field AI translation service with caching, rate limiting, and audit logging.
 *
 * Provides a dedicated translation layer on top of the core AIService,
 * adding enterprise features: translation cache, rate limiting,
 * audit trail, and graceful degradation when AI is unavailable.
 *
 * ### Features:
 * - translation caching (same text + same lang pair = cache hit)
 * - per-user rate limiting (50 translations/minute)
 * - audit log entries for each translation
 * - graceful fallback when AI unavailable
 */

import { aiService } from "@src/services/core/ai-service";
import { auditService } from "@src/services/security/audit-service";
import { AuditEventType } from "@src/services/security/audit-service";
import { logger } from "@utils/logger";
import type { DatabaseId } from "@src/databases/db-interface";

interface TranslationCacheEntry {
  translatedText: string;
  timestamp: number;
}

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

export class AITranslationService {
  private static instance: AITranslationService | null = null;

  /** Cache keyed by `sourceLang:targetLang:normalizedText` */
  private cache = new Map<string, TranslationCacheEntry>();
  private readonly CACHE_MAX_SIZE = 500;
  private readonly CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

  /** Rate limiting: userId -> { count, windowStart } */
  private rateLimits = new Map<string, RateLimitEntry>();
  private readonly RATE_LIMIT_MAX = 50;
  private readonly RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute

  private constructor() {}

  public static getInstance(): AITranslationService {
    if (!AITranslationService.instance) {
      AITranslationService.instance = new AITranslationService();
    }
    return AITranslationService.instance;
  }

  /**
   * Translates a single field value from source language to target language.
   *
   * @param text - The text to translate
   * @param sourceLang - Source locale code (e.g., "en")
   * @param targetLang - Target locale code (e.g., "de")
   * @param context - Optional context: { field?, collection?, userId?, tenantId? }
   * @returns The translated text, or null if AI is unavailable
   */
  async translateField(
    text: string,
    sourceLang: string,
    targetLang: string,
    context: {
      field?: string;
      collection?: string;
      userId?: DatabaseId | null;
      userEmail?: string;
      userRole?: string;
      tenantId?: DatabaseId | null;
    } = {},
  ): Promise<string | null> {
    const { isBenchmarkExternalServicesDisabled } = await import("@utils/benchmark-runtime");
    if (isBenchmarkExternalServicesDisabled()) {
      logger.debug("[AITranslation] Skipped translate (benchmark mode)");
      return null;
    }

    if (!text || !text.trim()) {
      return null;
    }

    const normalizedText = text.trim();
    const { userId } = context;

    // --- Rate Limit Check ---
    if (userId) {
      const userIdStr = String(userId);
      if (!this.checkRateLimit(userIdStr)) {
        logger.warn("[AITranslation] Rate limit exceeded for user:", userIdStr);
        return null;
      }
      this.incrementRateLimit(userIdStr);
    }

    // --- Cache Check ---
    const cacheKey = this.buildCacheKey(sourceLang, targetLang, normalizedText);
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      logger.debug("[AITranslation] Cache hit for:", {
        sourceLang,
        targetLang,
      });
      return cached.translatedText;
    }

    // --- Translate ---
    try {
      const translatedText = await aiService.translate(
        normalizedText,
        sourceLang,
        targetLang,
        context.field || "",
      );

      // If the AI returned the original text unchanged, it likely failed
      if (!translatedText || translatedText === normalizedText) {
        logger.warn("[AITranslation] AI returned unchanged text, likely unavailable");
        return null;
      }

      // --- Cache ---
      this.setCache(cacheKey, { translatedText, timestamp: Date.now() });

      // --- Audit ---
      try {
        await auditService.log(
          "AI Translation",
          {
            id: context.userId ?? null,
            email: context.userEmail || "unknown",
            role: context.userRole,
          },
          {
            type: context.collection || "unknown",
            id: null,
          },
          AuditEventType.DATA_IMPORT,
          "low",
          {
            sourceLang,
            targetLang,
            field: context.field || "unknown",
            collection: context.collection || "unknown",
            originalLength: normalizedText.length,
            translatedLength: translatedText.length,
          },
          context.tenantId ?? null,
          "success",
        );
      } catch (auditErr) {
        // Don't fail the translation if audit logging fails
        logger.warn("[AITranslation] Audit logging failed:", auditErr);
      }

      return translatedText;
    } catch (err) {
      logger.error("[AITranslation] Translation failed:", err);
      return null;
    }
  }

  /**
   * Clears the translation cache.
   */
  clearCache(): void {
    this.cache.clear();
    logger.info("[AITranslation] Cache cleared");
  }

  /**
   * Gets cache statistics.
   */
  getCacheStats(): { size: number; maxSize: number } {
    return { size: this.cache.size, maxSize: this.CACHE_MAX_SIZE };
  }

  // --- Private Helpers ---

  private buildCacheKey(sourceLang: string, targetLang: string, text: string): string {
    return `${sourceLang}:${targetLang}:${text}`;
  }

  private setCache(key: string, entry: TranslationCacheEntry): void {
    // Evict oldest entries if cache exceeds max size
    if (this.cache.size >= this.CACHE_MAX_SIZE) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, entry);
  }

  private checkRateLimit(userId: string): boolean {
    const now = Date.now();
    const entry = this.rateLimits.get(userId);

    if (!entry) {
      return true; // No previous requests
    }

    // If the window has expired, reset
    if (now - entry.windowStart > this.RATE_LIMIT_WINDOW_MS) {
      this.rateLimits.delete(userId);
      return true;
    }

    return entry.count < this.RATE_LIMIT_MAX;
  }

  private incrementRateLimit(userId: string): void {
    const now = Date.now();
    const entry = this.rateLimits.get(userId);

    if (!entry || now - entry.windowStart > this.RATE_LIMIT_WINDOW_MS) {
      this.rateLimits.set(userId, { count: 1, windowStart: now });
    } else {
      entry.count++;
    }
  }
}

export const aiTranslationService = AITranslationService.getInstance();
