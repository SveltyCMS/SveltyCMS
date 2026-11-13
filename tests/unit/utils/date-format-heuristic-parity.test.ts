/**
 * @file tests/unit/utils/date-format-heuristic-parity.test.ts
 * @description Proves the two date formatters in `@utils/date` / `@utils/format-date`
 * resolve a numeric timestamp the same way.
 *
 * `formatDateString` (pattern formatter) used a `> 1e12` seconds-vs-milliseconds
 * heuristic while `parseDateInput` (the consolidated parser behind `formatDate` /
 * `formatDateTime` / `formatDateString`s sibling) uses `> 1e11`. For a millisecond
 * timestamp between 1e11 (1973-03-03) and 1e12 (2001-09-09) the pattern formatter
 * read the value as *seconds*, so a 1995 date rendered as year ~27437 while the
 * Intl formatter rendered 1995.
 */

import { describe, expect, it } from "vitest";
import { formatDateString } from "@utils/date";
import { formatDate } from "@utils/format-date";

/** 1995-06-15T12:00:00Z — local date is the same in every UTC-offset timezone. */
const MS_1995 = Date.UTC(1995, 5, 15, 12, 0, 0);
const SECONDS_1995 = MS_1995 / 1000;

describe("numeric timestamp parity across date formatters", () => {
  it("renders a milliseconds timestamp (1973..2001) as its calendar date", () => {
    expect(formatDateString(MS_1995, "yyyy-MM-dd")).toBe("1995-06-15");
  });

  it("renders the same instant identically as seconds and as milliseconds", () => {
    expect(formatDateString(SECONDS_1995, "yyyy-MM-dd")).toBe(
      formatDateString(MS_1995, "yyyy-MM-dd"),
    );
  });

  it("agrees with the Intl formatter on the year", () => {
    const patternYear = formatDateString(MS_1995, "yyyy-MM-dd").slice(0, 4);
    expect(patternYear).toBe(formatDate(MS_1995, { year: "numeric" }, "en"));
  });

  it("keeps modern millisecond and second timestamps working", () => {
    const modernMs = Date.UTC(2026, 0, 2, 12, 0, 0);
    expect(formatDateString(modernMs, "yyyy-MM-dd")).toBe("2026-01-02");
    expect(formatDateString(modernMs / 1000, "yyyy-MM-dd")).toBe("2026-01-02");
  });

  it("returns the fallback for unparseable input", () => {
    expect(formatDateString("not-a-date", "yyyy-MM-dd", "-")).toBe("-");
    expect(formatDateString(Number.NaN, "yyyy-MM-dd", "-")).toBe("-");
  });
});
