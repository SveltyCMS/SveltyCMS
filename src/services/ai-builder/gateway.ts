/**
 * @file src/services/ai-builder/gateway.ts
 * @description Model-backend gateway for the AI-Assisted Builder (Phase 0).
 *
 * Routes structured-output requests to one or more model backends in order,
 * with failover, per-user rate limiting (in-memory sliding window) and a
 * deterministic default singleton backed by the local `aiService` (Ollama).
 *
 * ### Features:
 * - ordered backend failover with structured-output contract
 * - in-memory sliding-window quota per user (bypass for "system"/undefined)
 * - dependency-light: no Redis in Phase 0
 * - test hooks: injectable backends + static quota reset
 */

import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger";

/** A model provider that can return structured (JSON-parsed) output. */
export interface ModelBackend {
  /** Stable identifier reported in {@link DesignResult.backend}. */
  name: string;
  /**
   * Produce structured data from a fully assembled system prompt.
   * MUST return `null` (never throw for provider errors) when no valid
   * structured output could be produced.
   */
  generateStructured<T>(systemPrompt: string): Promise<T | null>;
}

/** Quota configuration for {@link BuilderAiGateway}. */
export interface BuilderAiGatewayOptions {
  /** Maximum requests per user within the sliding window. Default: 20. */
  maxRequests?: number;
  /** Sliding window length in milliseconds. Default: 10 minutes. */
  windowMs?: number;
}

export const DEFAULT_QUOTA = {
  maxRequests: 20,
  windowMs: 10 * 60 * 1000,
} as const;

/**
 * Default backend: local Ollama via the existing `aiService`.
 *
 * The `ai-service` module (and its `ollama` dependency) is loaded lazily so
 * that constructing the gateway stays cheap and unit tests never touch Ollama
 * unless they explicitly exercise this backend.
 */
class OllamaModelBackend implements ModelBackend {
  public readonly name = "ollama";

  public async generateStructured<T>(systemPrompt: string): Promise<T | null> {
    const { aiService } = await import("@src/services/core/ai-service");
    // generateJSON already strips markdown fences and returns null on failure.
    const result: unknown = await aiService.generateJSON(systemPrompt);
    return result === null || result === undefined ? null : (result as T);
  }
}

/** Live gateway instances so the static test reset can reach every quota store. */
const liveGateways = new Set<BuilderAiGateway>();

/**
 * Failover gateway over ordered model backends with per-user quota tracking.
 */
export class BuilderAiGateway {
  private readonly backends: ModelBackend[];
  private readonly options: Required<BuilderAiGatewayOptions>;
  private readonly quotaWindows = new Map<string, number[]>();

  constructor(backends?: ModelBackend[], options: BuilderAiGatewayOptions = {}) {
    this.backends = backends && backends.length > 0 ? [...backends] : [new OllamaModelBackend()];
    this.options = {
      maxRequests: options.maxRequests ?? DEFAULT_QUOTA.maxRequests,
      windowMs: options.windowMs ?? DEFAULT_QUOTA.windowMs,
    };
    liveGateways.add(this);
  }

  /**
   * Try backends in order and return the first non-null structured result,
   * or `null` when every backend failed / returned null.
   */
  public async generateStructured<T>(systemPrompt: string): Promise<T | null> {
    const detailed = await this.generateStructuredDetailed<T>(systemPrompt);
    return detailed?.value ?? null;
  }

  /**
   * Like {@link generateStructured} but also reports which backend produced
   * the value (used to fill `DesignResult.backend`).
   */
  public async generateStructuredDetailed<T>(
    systemPrompt: string,
  ): Promise<{ value: T; backend: string } | null> {
    for (const backend of this.backends) {
      try {
        const value = await backend.generateStructured<T>(systemPrompt);
        if (value !== null && value !== undefined) {
          return { value, backend: backend.name };
        }
      } catch (err) {
        logger.warn(`[BuilderAiGateway] backend "${backend.name}" failed, trying next`, err);
      }
    }
    return null;
  }

  /**
   * Enforce the per-user sliding window. `"system"` and empty/undefined ids
   * bypass the quota (server-initiated flows).
   *
   * @throws AppError 429 "RATE_LIMITED" when the window is exhausted.
   */
  public checkQuota(userId: string): void {
    if (!userId || userId === "system") return;

    const now = Date.now();
    const window = this.quotaWindows.get(userId) ?? [];
    const cutoff = now - this.options.windowMs;

    // Slide: drop timestamps that fell out of the window.
    while (window.length > 0 && window[0] <= cutoff) {
      window.shift();
    }

    if (window.length >= this.options.maxRequests) {
      const retryAfterMs = Math.max(0, this.options.windowMs - (now - window[0]));
      throw new AppError(
        `AI Builder quota exceeded (${this.options.maxRequests} requests per ${Math.round(
          this.options.windowMs / 60000,
        )} minutes). Please try again later.`,
        429,
        "RATE_LIMITED",
        { retryAfterMs },
      );
    }

    window.push(now);
    this.quotaWindows.set(userId, window);
  }

  /** Clear quota state of every live gateway (unit tests only). */
  public static resetQuotasForTests(): void {
    for (const gateway of liveGateways) {
      gateway.quotaWindows.clear();
    }
  }
}

/** Default singleton: Ollama-backed via aiService. */
export const builderAiGateway = new BuilderAiGateway();
