/**
 * @file src/services/ai/moderation.ts
 * @description Fail-closed moderation boundary for AI-generated text.
 *
 * Configuration is read from private settings (DB-driven, with an environment
 * fallback for deployment overrides):
 * - `AI_MODERATION_PROVIDER` — provider label/model (optional)
 * - `AI_MODERATION_URL`      — HTTPS moderation endpoint (optional)
 * - `AI_MODERATION_API_KEY`  — bearer credential (optional)
 *
 * When no provider is configured, moderation is intentionally a no-op and the
 * caller may emit the text (documented opt-out). As soon as a provider is
 * configured, every failure mode (unreachable, timeout, non-2xx, malformed
 * response) fails closed with `MODERATION_UNAVAILABLE` — unmoderated output is
 * never emitted.
 *
 * Features:
 * - Generic OpenAI-compatible `{ input }` request shape
 * - `validateEgressUrl` + `safeFetch` (SSRF guard, timeout, response-size cap)
 * - Deterministic parsing of `flagged` / `allowed` / `results[]`
 * - Never logs the moderation payload or credential
 */

import { logger } from "@utils/logger";
import { AppError, raise, rethrow } from "@utils/error-handling";
import { safeFetch, validateEgressUrl } from "@utils/egress-guard";
import { redactSecrets } from "@utils/security/stream-redaction";
import { getUntypedSetting } from "@src/services/core/settings-service";

export interface ModerationContext {
  tenantId?: string | null;
  userId?: string | null;
}

export interface ModerationResult {
  allowed: boolean;
  /** Stable machine-readable reason when `allowed` is false. */
  reason?: string;
}

/** Moderation must not add noticeable latency to chat. */
const MODERATION_TIMEOUT_MS = 5_000;
/** Moderation responses are tiny verdicts — cap aggressively. */
const MODERATION_MAX_RESPONSE_BYTES = 256 * 1024;
/** Defensive cap on text sent to a third-party moderation endpoint. */
const MAX_MODERATION_INPUT_CHARS = 20_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function readSetting(key: string, tenantId?: string | null): Promise<string | undefined> {
  try {
    const value = await getUntypedSetting<string>(key, "private", tenantId ?? undefined);
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch (err) {
    rethrow(err);
    logger.debug("[AIModeration] Private setting unavailable", { key });
  }

  const fromEnv = process.env[key];
  return typeof fromEnv === "string" && fromEnv.trim() ? fromEnv.trim() : undefined;
}

/**
 * Interprets common moderation response envelopes:
 * - `{ flagged: boolean }`
 * - `{ allowed: boolean }`
 * - `{ results: [{ flagged?: boolean; allowed?: boolean }] }`
 *
 * Returns `null` when the shape cannot be interpreted (fail closed upstream).
 */
function extractFlag(payload: unknown): boolean | null {
  if (!isRecord(payload)) return null;

  if (typeof payload.flagged === "boolean") return payload.flagged;
  if (typeof payload.allowed === "boolean") return !payload.allowed;

  if (Array.isArray(payload.results)) {
    let sawResult = false;
    for (const result of payload.results) {
      if (!isRecord(result)) continue;
      sawResult = true;
      if (typeof result.flagged === "boolean" && result.flagged) return true;
      if (typeof result.allowed === "boolean" && !result.allowed) return true;
    }
    if (sawResult) return false;
  }

  return null;
}

/**
 * Moderates AI output before it is emitted.
 *
 * @returns `{ allowed: true }` when no provider is configured or the provider
 *   approves the text; `{ allowed: false, reason }` when the provider flags it.
 * @throws AppError 503 `MODERATION_UNAVAILABLE` when a configured provider
 *   cannot produce a trustworthy verdict.
 */
export async function moderateAiText(
  text: string,
  context: ModerationContext = {},
): Promise<ModerationResult> {
  if (!text.trim()) return { allowed: true };

  const [provider, endpoint, apiKey] = await Promise.all([
    readSetting("AI_MODERATION_PROVIDER", context.tenantId),
    readSetting("AI_MODERATION_URL", context.tenantId),
    readSetting("AI_MODERATION_API_KEY", context.tenantId),
  ]);

  // Explicit opt-out: no provider configured means moderation is not available
  // by design and the caller may emit the text. This is the only allow path
  // that does not consult a provider.
  if (!provider && !endpoint) {
    return { allowed: true };
  }

  if (!endpoint) {
    // A provider was named but no endpoint is configured — configuration is
    // broken, so fail closed rather than silently skipping moderation.
    raise(503, "AI moderation unavailable", "MODERATION_UNAVAILABLE");
  }

  try {
    await validateEgressUrl(endpoint);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const response = await safeFetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ input: text.slice(0, MAX_MODERATION_INPUT_CHARS) }),
      timeoutMs: MODERATION_TIMEOUT_MS,
      maxSizeBytes: MODERATION_MAX_RESPONSE_BYTES,
    });

    if (
      !response.success ||
      typeof response.status !== "number" ||
      response.status < 200 ||
      response.status >= 300 ||
      typeof response.body !== "string"
    ) {
      raise(503, "AI moderation unavailable", "MODERATION_UNAVAILABLE");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.body);
    } catch (err) {
      rethrow(err);
      raise(503, "AI moderation unavailable", "MODERATION_UNAVAILABLE");
    }

    const flagged = extractFlag(parsed);
    if (flagged === null) {
      raise(503, "AI moderation unavailable", "MODERATION_UNAVAILABLE");
    }

    return flagged ? { allowed: false, reason: "moderation_flagged" } : { allowed: true };
  } catch (err) {
    rethrow(err);

    if (err instanceof AppError) throw err;

    // Never include the response body or credential in logs.
    logger.warn("[AIModeration] Provider unavailable; failing closed", {
      tenantId: context.tenantId,
      reason: redactSecrets(err instanceof Error ? err.message : "unknown"),
    });
    raise(503, "AI moderation unavailable", "MODERATION_UNAVAILABLE");
  }
}
