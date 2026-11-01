/**
 * @file tests/unit/widgets/media-request-log.ts
 * @description Request-shape counter for the media hydration tests.
 *
 * The M5 regression is a request SHAPE, not a value: a 25-row list must cost one
 * `GET /api/media/batch-get` and zero `GET /api/media/<id>` calls. A fetch stub
 * that ignores its URL — or a test that loops `fetch()` by hand — cannot tell
 * the two shapes apart, so the shape is asserted through this classifier.
 */

export type MediaRequestKind = "batch" | "per-id" | "other";

/** Classify a media request URL by its shape. */
export function classifyMediaUrl(url: string): MediaRequestKind {
  const path = url.split("?")[0] ?? "";
  if (path.includes("/api/media/batch-get")) return "batch";
  // `/api/media/<id>` — the pre-fix per-cell fetch. `batch-get` is matched above.
  if (/\/api\/media\/[^/]+$/.test(path)) return "per-id";
  return "other";
}

export interface MediaRequestLog {
  /** Every URL seen, in call order. */
  urls: string[];
  batch: number;
  perId: number;
  other: number;
}

/** A counter that records media requests by URL shape. */
export function createMediaRequestLog(): {
  log: MediaRequestLog;
  record: (url: unknown) => MediaRequestKind;
} {
  const log: MediaRequestLog = { urls: [], batch: 0, perId: 0, other: 0 };

  return {
    log,
    record(url: unknown): MediaRequestKind {
      const text = String(url);
      log.urls.push(text);
      const kind = classifyMediaUrl(text);
      if (kind === "batch") log.batch++;
      else if (kind === "per-id") log.perId++;
      else log.other++;
      return kind;
    },
  };
}
