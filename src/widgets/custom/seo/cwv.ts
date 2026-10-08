/**
 * @file src/widgets/custom/seo/cwv.ts
 * @description Pure helpers for the Core Web Vitals (LCP/INP/CLS) readout in
 * the SEO widget's Advanced tab: Web Vitals threshold classification and
 * defensive parsing of the Google PageSpeed Insights API response.
 *
 * ### Features
 * - Threshold classification per web.dev/vitals (good / needs-improvement / poor)
 * - Field data (CrUX) and lab data (Lighthouse) extraction from the PSI v5 response
 * - Environment-agnostic: no fetch, no DOM — unit-tested beside the widget
 *
 * ### Sources
 * - Thresholds: https://web.dev/vitals/ (LCP ≤2.5s, INP ≤200ms, CLS ≤0.1)
 * - API shape: https://developers.google.com/speed/docs/insights/v5/reference
 */

export type CwvRating = "good" | "needs-improvement" | "poor";
export type CwvMetricId = "lcp" | "inp" | "cls";

export interface CwvReading {
  metric: CwvMetricId;
  label: string;
  /** Raw value: ms for LCP/INP, unitless 0–1 for CLS. */
  value: number;
  /** Human-readable value, e.g. "1.2 s" or "0.01". */
  display: string;
  rating: CwvRating;
  /** p75 percentile (field data only). */
  percentile?: number;
}

export interface CwvReport {
  url: string;
  strategy: "mobile" | "desktop";
  /** CrUX real-user field data (origin-level, 28-day rolling, p75). */
  field?: CwvReading[];
  /** CrUX overall category for the origin. */
  fieldOverall?: CwvRating;
  /** Lighthouse lab data for the measured URL. */
  lab?: CwvReading[];
  /** Lighthouse measurement timestamp (ISO string). */
  labMeasuredAt?: string;
}

const METRIC_LABELS: Record<CwvMetricId, string> = {
  lcp: "LCP — Largest Contentful Paint",
  inp: "INP — Interaction to Next Paint",
  cls: "CLS — Cumulative Layout Shift",
};

/** Good/poor cut-offs per web.dev/vitals (values between are "needs improvement"). */
const THRESHOLDS: Record<CwvMetricId, { good: number; poor: number }> = {
  lcp: { good: 2500, poor: 4000 },
  inp: { good: 200, poor: 500 },
  cls: { good: 0.1, poor: 0.25 },
};

/** Classifies a raw metric value against the documented Web Vitals thresholds. */
export function classifyCwv(metric: CwvMetricId, value: number): CwvRating {
  const thresholds = THRESHOLDS[metric];
  if (value <= thresholds.good) return "good";
  if (value < thresholds.poor) return "needs-improvement";
  return "poor";
}

/** Formats a raw metric value for display (ms with unit conversion, CLS fixed to 2 decimals). */
export function formatCwvValue(metric: CwvMetricId, value: number): string {
  if (metric === "cls") return value.toFixed(2);
  if (value >= 1000) return `${(value / 1000).toFixed(1)} s`;
  return `${Math.round(value)} ms`;
}

/** Matches the widget schema's canonical URL rule (absolute http/https). */
export function isAbsoluteHttpUrl(value: string): boolean {
  return /^https?:\/\/.+/.test(value.trim());
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function ratingFromCategory(category: unknown): CwvRating | undefined {
  if (category === "FAST") return "good";
  if (category === "AVERAGE") return "needs-improvement";
  if (category === "SLOW") return "poor";
  return undefined;
}

/** CrUX metric keys per Core Web Vital, including the EXPERIMENTAL_ variants. */
const FIELD_METRIC_KEYS: Record<CwvMetricId, string[]> = {
  lcp: ["LARGEST_CONTENTFUL_PAINT_MS", "EXPERIMENTAL_LARGEST_CONTENTFUL_PAINT_MS"],
  inp: ["INTERACTION_TO_NEXT_PAINT", "EXPERIMENTAL_INTERACTION_TO_NEXT_PAINT"],
  cls: ["CUMULATIVE_LAYOUT_SHIFT_SCORE", "EXPERIMENTAL_CUMULATIVE_LAYOUT_SHIFT_SCORE"],
};

/** Lighthouse audit keys per Core Web Vital. */
const LAB_METRIC_KEYS: Record<CwvMetricId, string> = {
  lcp: "largest-contentful-paint",
  inp: "interaction-to-next-paint",
  cls: "cumulative-layout-shift",
};

/** Extracts the CrUX field-data readings (p75, origin-level) from a PSI response. */
function parseFieldData(root: Record<string, unknown>): CwvReading[] | undefined {
  const loadingExperience = asRecord(root.loadingExperience);
  const metrics = asRecord(loadingExperience?.metrics);
  if (!metrics) return undefined;

  const readings: CwvReading[] = [];
  for (const [metricId, keys] of Object.entries(FIELD_METRIC_KEYS)) {
    const metric = metricId as CwvMetricId;
    for (const key of keys) {
      const entry = asRecord(metrics[key]);
      const percentile = typeof entry?.percentile === "number" ? entry.percentile : undefined;
      if (percentile === undefined) continue;
      readings.push({
        metric,
        label: METRIC_LABELS[metric],
        value: percentile,
        display: formatCwvValue(metric, percentile),
        rating: ratingFromCategory(entry?.category) ?? classifyCwv(metric, percentile),
        percentile,
      });
      break;
    }
  }
  return readings.length > 0 ? readings : undefined;
}

/** Extracts the Lighthouse lab-data readings (simulated, URL-level) from a PSI response. */
function parseLabData(root: Record<string, unknown>): {
  readings: CwvReading[] | undefined;
  measuredAt: string | undefined;
} {
  const lighthouse = asRecord(root.lighthouseResult);
  const audits = asRecord(lighthouse?.audits);

  const readings: CwvReading[] = [];
  if (audits) {
    for (const [metricId, key] of Object.entries(LAB_METRIC_KEYS)) {
      const metric = metricId as CwvMetricId;
      const audit = asRecord(audits[key]);
      const value = typeof audit?.numericValue === "number" ? audit.numericValue : undefined;
      if (value === undefined) continue;
      readings.push({
        metric,
        label: METRIC_LABELS[metric],
        value,
        display: formatCwvValue(metric, value),
        rating: classifyCwv(metric, value),
      });
    }
  }
  const measuredAt = typeof lighthouse?.fetchTime === "string" ? lighthouse.fetchTime : undefined;
  return { readings: readings.length > 0 ? readings : undefined, measuredAt };
}

/**
 * Parses a PageSpeed Insights API v5 response into a normalized CwvReport.
 * Defensive by design: unknown or malformed responses degrade to an empty
 * report instead of throwing.
 */
export function parsePsiReport(
  json: unknown,
  url: string,
  strategy: "mobile" | "desktop",
): CwvReport {
  const root = asRecord(json);
  const loadingExperience = asRecord(root?.loadingExperience);
  const field = root ? parseFieldData(root) : undefined;
  const fieldOverall = ratingFromCategory(loadingExperience?.overall_category);
  const { readings: lab, measuredAt: labMeasuredAt } = root
    ? parseLabData(root)
    : { readings: undefined, measuredAt: undefined };

  return { url, strategy, field, fieldOverall, lab, labMeasuredAt };
}
