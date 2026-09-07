/**
 * @file src/widgets/custom/seo/seo-serp.ts
 * @description SERP preview helpers for the SEO widget (pixel width, truncation, heatmap roles).
 *
 * Features:
 * - Approximate Google snippet pixel widths (Arial 20px title / 14px description)
 * - Desktop vs mobile truncation for the search preview
 * - Focus-keyword parsing for heatmap highlighting
 * - Honest heatmap roles (keyword / power word / position / length) — not live CTR data
 */

export const SERP_TITLE_DESKTOP_PX = 600;
export const SERP_TITLE_MOBILE_PX = 654;
export const SERP_DESC_DESKTOP_PX = 970;
export const SERP_DESC_MOBILE_PX = 981;

const TITLE_FONT = "20px Arial, sans-serif";
const DESC_FONT = "14px Arial, sans-serif";
const TITLE_AVG_PX = 10;
const DESC_AVG_PX = 7;

let measureCtx: CanvasRenderingContext2D | null | undefined;

export type HeatmapRole = "keyword" | "power" | "prominent" | "length" | "neutral";
export type SerpSnippetKind = "title" | "description";

function getMeasureContext(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") {
    return null;
  }
  if (measureCtx !== undefined) {
    return measureCtx;
  }
  const canvas = document.createElement("canvas");
  measureCtx = canvas.getContext("2d");
  return measureCtx;
}

/**
 * Measure snippet width in CSS pixels using Arial, matching typical SERP simulators.
 * Falls back to a per-character average when canvas is unavailable (SSR / tests).
 */
export function measureSerpWidth(text: string, kind: SerpSnippetKind): number {
  const font = kind === "title" ? TITLE_FONT : DESC_FONT;
  const ctx = getMeasureContext();
  if (!ctx) {
    const avg = kind === "title" ? TITLE_AVG_PX : DESC_AVG_PX;
    return Math.round(text.length * avg);
  }
  ctx.font = font;
  return Math.round(ctx.measureText(text).width);
}

/**
 * Truncate text so its measured width stays within a SERP pixel budget.
 */
export function truncateToPx(text: string, maxPx: number, kind: SerpSnippetKind): string {
  if (!text) {
    return text;
  }
  if (measureSerpWidth(text, kind) <= maxPx) {
    return text;
  }
  const ellipsis = "…";
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = `${text.slice(0, mid)}${ellipsis}`;
    if (measureSerpWidth(candidate, kind) <= maxPx) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo <= 0 ? ellipsis : `${text.slice(0, lo)}${ellipsis}`;
}

export function normalizeHeatWord(word: string): string {
  return word.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

/**
 * Split a focus-keyword field into phrase + individual tokens for heatmap matching.
 */
export function parseFocusKeywords(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }
  const tokens = new Set<string>();
  for (const part of trimmed.split(/[,]+/)) {
    const phrase = part.trim();
    if (!phrase) {
      continue;
    }
    tokens.add(phrase.toLowerCase());
    for (const word of phrase.split(/\s+/)) {
      const normalized = normalizeHeatWord(word);
      if (normalized.length >= 3) {
        tokens.add(normalized);
      }
    }
  }
  return [...tokens];
}

export function classifyHeatmapWord(
  word: string,
  index: number,
  keywords: readonly string[],
  powerWords: ReadonlySet<string>,
): HeatmapRole {
  const lower = normalizeHeatWord(word);
  if (!lower) {
    return "neutral";
  }

  const keywordHit = keywords.some((keyword) => {
    const nk = keyword.toLowerCase();
    if (nk === lower) {
      return true;
    }
    return lower.length >= 3 && (nk.includes(lower) || lower.includes(nk));
  });
  if (keywordHit) {
    return "keyword";
  }
  if (powerWords.has(lower)) {
    return "power";
  }
  if (index < 3) {
    return "prominent";
  }
  if (lower.length > 4) {
    return "length";
  }
  return "neutral";
}

export function buildPreviewUrl(host: string, canonical: string, slug: string): string {
  const base = (host || "example.com").replace(/\/+$/, "");
  const can = canonical.trim();
  if (can) {
    if (/^https?:\/\//i.test(can)) {
      return can;
    }
    return `${base}/${can.replace(/^\/+/, "")}`;
  }
  const path = slug.trim().replace(/^\/+/, "");
  return path ? `${base}/${path}` : base;
}

export function formatSerpUrl(raw: string): { breadcrumb: string; site: string } {
  const fallback = raw || "example.com";
  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw.replace(/^\/+/, "")}`;
    const url = new URL(withProto);
    const parts = url.pathname.split("/").filter(Boolean);
    const hostname = url.hostname.replace(/^www\./, "");
    return {
      site: hostname,
      breadcrumb: [hostname, ...parts].join(" › "),
    };
  } catch {
    return { site: fallback, breadcrumb: fallback };
  }
}

export function readLocalizedString(value: unknown, lang: string): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (value && typeof value === "object") {
    const rec = value as Record<string, unknown>;
    const langVal = rec[lang];
    if (typeof langVal === "string") {
      return langVal.trim();
    }
    for (const nested of Object.values(rec)) {
      if (typeof nested === "string" && nested.trim()) {
        return nested.trim();
      }
    }
  }
  return "";
}

const LOCALE_KEY = /^[a-z]{2}(?:-[A-Za-z]{2})?$/;
const SEO_PAYLOAD_KEYS = ["title", "description", "focusKeyword", "robotsMeta"] as const;

/** True when this object is an SEO payload, not a `{ en: … }` locale map. */
export function isSeoPayload(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const rec = value as Record<string, unknown>;
  return SEO_PAYLOAD_KEYS.some((key) => key in rec);
}

export function emptySeoData(): Record<string, string> {
  return {
    title: "",
    description: "",
    focusKeyword: "",
    robotsMeta: "index, follow",
    canonicalUrl: "",
    ogTitle: "",
    ogDescription: "",
    ogImage: "",
    twitterCard: "summary_large_image",
    twitterTitle: "",
    twitterDescription: "",
    twitterImage: "",
    schemaMarkup: "",
  };
}

/**
 * The collection form binds translated widgets to one locale slot
 * (`entry.seo.en`). The SEO input historically wrapped by language again, so
 * stored values can be `{ en: { title } }` or `{ en: { en: { title } } }`.
 * Unwrap until a payload with SEO fields is reached.
 */
export function unwrapSeoPayload(value: unknown, lang = "en"): Record<string, unknown> | undefined {
  let current: unknown = value;
  for (let i = 0; i < 4; i++) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    if (isSeoPayload(current)) {
      return current as Record<string, unknown>;
    }
    const rec = current as Record<string, unknown>;
    const keys = Object.keys(rec);
    if (keys.length === 0 || !keys.every((key) => LOCALE_KEY.test(key))) {
      return undefined;
    }
    current = rec[lang] ?? rec[keys[0]];
  }
  return undefined;
}

/** Flatten a locale-bound (or double-wrapped) value to a single SEO payload. */
export function normalizeSeoBindValue(value: unknown, lang = "en"): Record<string, unknown> {
  return unwrapSeoPayload(value, lang) ?? emptySeoData();
}

function readRichTextContent(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (!value || typeof value !== "object") {
    return "";
  }
  const rec = value as Record<string, unknown>;
  if (typeof rec.content === "string") {
    return rec.content;
  }
  for (const nested of Object.values(rec)) {
    if (
      nested &&
      typeof nested === "object" &&
      typeof (nested as { content?: unknown }).content === "string"
    ) {
      return (nested as { content: string }).content;
    }
  }
  return "";
}

export function readEntryBody(entry: unknown): string {
  if (!entry || typeof entry !== "object") {
    return "";
  }
  const rec = entry as Record<string, unknown>;
  if (typeof rec.content === "string") {
    return rec.content;
  }
  if (typeof rec.body === "string") {
    return rec.body;
  }
  return readRichTextContent(rec.body ?? rec.content);
}

export const SEO_DEFAULT_FEATURES = ["social", "schema", "advanced", "ai"] as const;

function asFeatureList(value: unknown): string[] | null {
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return null;
}

export function seoFeatureList(field: {
  features?: unknown;
  widget?: { defaults?: { features?: unknown } };
}): string[] {
  return (
    asFeatureList(field.features) ??
    asFeatureList(field.widget?.defaults?.features) ?? [...SEO_DEFAULT_FEATURES]
  );
}
