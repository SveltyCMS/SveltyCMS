/**
 * @file src/widgets/custom/ai-enrichment/normalize.ts
 * @description Response normalization for the AI Enrichment widget.
 *
 * Kept as a plain module (not a `<script module>` export) so it is directly
 * importable by unit tests and typed by `tsc` without Svelte ambient-module
 * declarations getting in the way.
 *
 * Features:
 * - unwraps the `/api/ai/enrich` `{ success, data }` envelope (legacy `result` too)
 * - never yields `undefined` for a field value
 * - normalizes array results (keywords/tags) to a comma-separated string
 * - preserves existing translations when the field is translated
 */

/** Result of normalizing an `/api/ai/enrich` response — `value` is never `undefined`. */
export type EnrichmentOutcome = { ok: true; value: unknown } | { ok: false; error: string };

/** Convert an arbitrary AI payload into a non-undefined display string. */
function toDisplayText(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    return raw
      .map((entry) => toDisplayText(entry))
      .filter((entry) => entry.length > 0)
      .join(", ");
  }
  if (typeof raw === "number" || typeof raw === "boolean" || typeof raw === "bigint") {
    return String(raw);
  }
  try {
    return JSON.stringify(raw) ?? "";
  } catch {
    return "";
  }
}

/**
 * Unwrap the `/api/ai/enrich` envelope (`{ success, data }`, legacy `result`) and
 * normalize the payload for the widget's field shape.
 */
export function normalizeEnrichmentResult(
  payload: unknown,
  options: { translated?: boolean; language?: string; current?: unknown } = {},
): EnrichmentOutcome {
  const envelope = (payload ?? {}) as {
    success?: unknown;
    data?: unknown;
    result?: unknown;
    message?: unknown;
  };

  if (envelope.success === false) {
    const message = typeof envelope.message === "string" ? envelope.message.trim() : "";
    return { ok: false, error: message || "AI Enrichment failed" };
  }

  const text = toDisplayText(envelope.data ?? envelope.result ?? "");

  if (options.translated) {
    const current = options.current;
    const base =
      current && typeof current === "object" && !Array.isArray(current)
        ? (current as Record<string, unknown>)
        : {};
    return { ok: true, value: { ...base, [options.language ?? ""]: text } };
  }

  return { ok: true, value: text };
}
