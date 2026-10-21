/**
 * @file tests/e2e/helpers/layout-shift.ts
 * @description Deterministic layout-shift (CLS) guards for Playwright E2E.
 *
 * The `layout-shift` PerformanceObserver is Chromium-only; `supported` tells a
 * caller whether the measurement is meaningful so the assertion can be skipped
 * on engines that do not implement it (never silently pass on Chromium).
 *
 * Usage — install BEFORE the first navigation:
 *
 * ```ts
 * await installLayoutShiftObserver(page);
 * await page.goto("/mediagallery");
 * await waitForHydration(page);
 * const report = await measureLayoutShift(page);       // post-hydration window
 * const paint = await readLayoutShift(page);           // since navigation
 * ```
 *
 * `resetLayoutShift` drops the entries buffered during SSR → hydration so a
 * test can assert the *interactive* screen is stable without also requiring the
 * (unavoidable) server/client viewport reconciliation to be shift-free. Tests
 * that specifically cover that reconciliation read the report without a reset.
 */

import { expect, test, type Page } from "@playwright/test";

/** A single `layout-shift` entry, reduced to what a failure message needs. */
export interface LayoutShiftEntry {
  value: number;
  /** `performance.now()` timestamp — tells pre- from post-hydration shifts. */
  startTime: number;
  sources: string[];
}

export interface LayoutShiftReport {
  /** Cumulative score over the observed window (unitless CLS). */
  score: number;
  entries: LayoutShiftEntry[];
  /** False on browsers without the `layout-shift` entry type. */
  supported: boolean;
}

interface ObserverState {
  entries: LayoutShiftEntry[];
  supported: boolean;
}

/** Handle exposed by the init script (`window.__sveltyLayoutShift`). */
const OBSERVER_KEY = "__sveltyLayoutShift";

/**
 * Register the observer before any page script runs, so shifts that happen
 * during the first paint (SSR layout → hydration) are captured too.
 */
export async function installLayoutShiftObserver(page: Page): Promise<void> {
  await page.addInitScript((key: string) => {
    const state: ObserverState = { entries: [], supported: false };
    (window as unknown as Record<string, ObserverState>)[key] = state;

    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & {
            value: number;
            startTime: number;
            hadRecentInput?: boolean;
            sources?: Array<{
              node?: Node | null;
              previousRect?: DOMRectReadOnly;
              currentRect?: DOMRectReadOnly;
            }>;
          };
          // User-initiated shifts (clicks typing into the test) are not layout jank.
          if (shift.hadRecentInput) continue;

          state.entries.push({
            value: shift.value,
            startTime: shift.startTime,
            sources: (shift.sources ?? []).map((source) => {
              const node = source.node as Element | null | undefined;
              if (!node || typeof node.tagName !== "string") return "unknown";
              const element = node as HTMLElement;
              const testId = element.dataset?.testid;
              const classes =
                typeof element.className === "string"
                  ? element.className.split(/\s+/).filter(Boolean).slice(0, 3).join(".")
                  : "";
              const snippet = (element.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 48);
              const prev = source.previousRect;
              const next = source.currentRect;
              const geometry =
                prev && next
                  ? ` [${Math.round(prev.width)}x${Math.round(prev.height)}@${Math.round(prev.x)},${Math.round(prev.y)} → ${Math.round(next.width)}x${Math.round(next.height)}@${Math.round(next.x)},${Math.round(next.y)}]`
                  : "";

              return [
                testId ? `[data-testid=${testId}]` : element.tagName.toLowerCase(),
                classes ? `.${classes}` : "",
                snippet ? `"${snippet}"` : "",
                geometry,
              ]
                .filter(Boolean)
                .join(" ");
            }),
          });
        }
      });

      observer.observe({ type: "layout-shift", buffered: true });
      state.supported = true;
    } catch {
      // Firefox/Safari: no layout-shift entries. Callers check `supported`.
    }
  }, OBSERVER_KEY);
}

/** Clear buffered entries — call after `waitForHydration` to start the window. */
export async function resetLayoutShift(page: Page): Promise<void> {
  await page.evaluate((key: string) => {
    const state = (window as unknown as Record<string, ObserverState | undefined>)[key];
    if (state) state.entries = [];
  }, OBSERVER_KEY);
}

/** Read the accumulated shifts without resetting the observer. */
export async function readLayoutShift(page: Page): Promise<LayoutShiftReport> {
  return page.evaluate((key: string) => {
    const state = (window as unknown as Record<string, ObserverState | undefined>)[key];
    if (!state) return { score: 0, entries: [], supported: false };
    return {
      score: state.entries.reduce((total, entry) => total + entry.value, 0),
      entries: [...state.entries],
      supported: state.supported,
    };
  }, OBSERVER_KEY);
}

/**
 * Measure the window that starts now.
 *
 * `windowMs` is an observation window, not a state wait: CLS is a sum over a
 * time range, so the range has to be bounded for the assertion to terminate.
 * The window deliberately starts after hydration (see {@link resetLayoutShift})
 * unless the caller resets earlier.
 */
export async function measureLayoutShift(page: Page, windowMs = 750): Promise<LayoutShiftReport> {
  await page.waitForTimeout(windowMs);
  return readLayoutShift(page);
}

/**
 * Assert the observed window stayed inside `budget`, with a readable diff.
 * Returns the report so callers can add their own extra assertions.
 */
export async function expectLayoutShiftBelow(
  page: Page,
  budget: number,
  context: string,
  windowMs = 750,
): Promise<LayoutShiftReport> {
  const report = await measureLayoutShift(page, windowMs);

  if (!report.supported) {
    test.skip(true, "layout-shift PerformanceObserver is not available in this browser");
    return report;
  }

  const detail = report.entries
    .map(
      (entry) =>
        `${entry.value.toFixed(4)} @${Math.round(entry.startTime)}ms ← ${entry.sources.join(", ") || "unknown"}`,
    )
    .join("\n");

  expect(
    report.score,
    `${context} shifted after hydration (CLS ${report.score.toFixed(4)} > ${budget})\n${detail}`,
  ).toBeLessThan(budget);

  return report;
}
