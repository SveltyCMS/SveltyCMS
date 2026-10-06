/**
 * @file tests/unit/services/ai-translation.test.ts
 * @description Unit tests for AITranslationService caching, rate limiting, and fallback behavior.
 *
 * Features:
 * - Empty string or whitespace-only inputs return null without invoking AI
 * - Caching mechanism avoids redundant AI calls for identical (text, sourceLang, targetLang)
 * - Cache statistics and clearCache functionality
 * - Per-user rate limiting (blocks requests after 50 calls within window)
 * - Graceful degradation when AI service fails or returns unchanged text
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

vi.unmock("@src/services/security/audit-service");
import { AITranslationService } from "@src/services/ai-translation";
import { aiService } from "@src/services/core/ai-service";
import { auditService } from "@src/services/security/audit-service";
import type { DatabaseId } from "@src/databases/db-interface";

describe("AITranslationService unit tests", () => {
  let service: AITranslationService;

  beforeEach(() => {
    vi.restoreAllMocks();
    service = AITranslationService.getInstance();
    service.clearCache();
  });

  describe("input validation & edge cases", () => {
    it("returns null for empty or whitespace-only text without calling AI service", async () => {
      const translateSpy = vi.spyOn(aiService, "translate");

      const res1 = await service.translateField("", "en", "de");
      const res2 = await service.translateField("   ", "en", "fr");

      expect(res1).toBeNull();
      expect(res2).toBeNull();
      expect(translateSpy).not.toHaveBeenCalled();
    });

    it("returns null if AI returns unchanged text (simulating AI unavailable)", async () => {
      vi.spyOn(aiService, "translate").mockResolvedValue("Hello World");

      const result = await service.translateField("Hello World", "en", "es");
      expect(result).toBeNull();
    });

    it("returns null if AI service throws an unexpected exception", async () => {
      vi.spyOn(aiService, "translate").mockRejectedValue(new Error("AI connection timeout"));

      const result = await service.translateField("Welcome to SveltyCMS", "en", "de");
      expect(result).toBeNull();
    });
  });

  describe("caching behavior", () => {
    it("caches translation and returns cached value on second call", async () => {
      const translateSpy = vi
        .spyOn(aiService, "translate")
        .mockResolvedValue("Willkommen bei SveltyCMS");
      const auditSpy = vi.spyOn(auditService, "log").mockResolvedValue();

      // First call: calls AI service
      const res1 = await service.translateField("Welcome to SveltyCMS", "en", "de");
      expect(res1).toBe("Willkommen bei SveltyCMS");
      expect(translateSpy).toHaveBeenCalledTimes(1);
      expect(auditSpy).toHaveBeenCalledTimes(1);

      // Second call: should hit cache
      const res2 = await service.translateField("Welcome to SveltyCMS", "en", "de");
      expect(res2).toBe("Willkommen bei SveltyCMS");
      expect(translateSpy).toHaveBeenCalledTimes(1); // Not called again!
    });

    it("tracks cache stats and clears cache properly", async () => {
      vi.spyOn(aiService, "translate").mockResolvedValue("Bonjour le monde");

      expect(service.getCacheStats().size).toBe(0);

      await service.translateField("Hello world", "en", "fr");
      expect(service.getCacheStats().size).toBe(1);

      service.clearCache();
      expect(service.getCacheStats().size).toBe(0);
    });
  });

  describe("per-user rate limiting", () => {
    it("blocks translations when user exceeds RATE_LIMIT_MAX (50) within window", async () => {
      vi.spyOn(aiService, "translate").mockResolvedValue("Traduction réussie");

      const userId = "usr_rate_limited" as DatabaseId;

      // Exhaust 50 calls
      for (let i = 0; i < 50; i++) {
        // use unique text so it doesn't hit cache
        const res = await service.translateField(`Text item ${i}`, "en", "fr", { userId });
        expect(res).toBe("Traduction réussie");
      }

      // 51st call should be rate-limited and return null
      const blockedRes = await service.translateField("Text item 51", "en", "fr", { userId });
      expect(blockedRes).toBeNull();
    });
  });
});
