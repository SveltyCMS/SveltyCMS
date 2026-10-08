/**
 * @file src/widgets/custom/seo/tests/cwv.test.ts
 * @description Unit tests for the Core Web Vitals helpers (threshold
 * classification, value formatting, URL validation) and the defensive
 * PageSpeed Insights response parser.
 */

import { describe, expect, it } from "vitest";
import { classifyCwv, formatCwvValue, isAbsoluteHttpUrl, parsePsiReport } from "../cwv";

describe("classifyCwv", () => {
  it.each([
    ["lcp", 1200, "good"],
    ["lcp", 2500, "good"],
    ["lcp", 2501, "needs-improvement"],
    ["lcp", 3999, "needs-improvement"],
    ["lcp", 4000, "poor"],
    ["inp", 200, "good"],
    ["inp", 350, "needs-improvement"],
    ["inp", 500, "poor"],
    ["cls", 0.1, "good"],
    ["cls", 0.18, "needs-improvement"],
    ["cls", 0.25, "poor"],
  ] as const)("%s value %d classifies as %s", (metric, value, expected) => {
    expect(classifyCwv(metric, value)).toBe(expected);
  });
});

describe("formatCwvValue", () => {
  it("formats CLS to two decimals and ms values with unit conversion", () => {
    expect(formatCwvValue("cls", 0.017)).toBe("0.02");
    expect(formatCwvValue("lcp", 450)).toBe("450 ms");
    expect(formatCwvValue("lcp", 1240)).toBe("1.2 s");
    expect(formatCwvValue("inp", 8000)).toBe("8.0 s");
  });
});

describe("isAbsoluteHttpUrl", () => {
  it("accepts http/https URLs and rejects everything else", () => {
    expect(isAbsoluteHttpUrl("https://example.com/post")).toBe(true);
    expect(isAbsoluteHttpUrl("http://example.com")).toBe(true);
    expect(isAbsoluteHttpUrl("")).toBe(false);
    expect(isAbsoluteHttpUrl("/relative/path")).toBe(false);
    expect(isAbsoluteHttpUrl("javascript:alert(1)")).toBe(false);
  });
});

const PSI_FIXTURE = {
  captchaResult: "CAPTCHA_NOT_NEEDED",
  loadingExperience: {
    id: "https://example.com/",
    metrics: {
      CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 0.017, category: "FAST" },
      EXPERIMENTAL_TIME_TO_FIRST_BYTE: { percentile: 320, category: "FAST" },
      FIRST_CONTENTFUL_PAINT_MS: { percentile: 1412, category: "FAST" },
      INTERACTION_TO_NEXT_PAINT: { percentile: 250, category: "FAST" },
      LARGEST_CONTENTFUL_PAINT_MS: { percentile: 1240, category: "FAST" },
    },
    overall_category: "FAST",
  },
  lighthouseResult: {
    fetchTime: "2026-10-08T12:00:00.000Z",
    audits: {
      "largest-contentful-paint": { numericValue: 1280, displayValue: "1.3 s", score: 0.98 },
      "interaction-to-next-paint": { numericValue: 180, displayValue: "180 ms", score: 1 },
      "cumulative-layout-shift": { numericValue: 0.01, displayValue: "0.01", score: 1 },
    },
  },
};

describe("parsePsiReport", () => {
  it("extracts field and lab readings with correct labels and ratings", () => {
    const report = parsePsiReport(PSI_FIXTURE, "https://example.com/", "mobile");

    expect(report.url).toBe("https://example.com/");
    expect(report.strategy).toBe("mobile");
    expect(report.fieldOverall).toBe("good");
    expect(report.labMeasuredAt).toBe("2026-10-08T12:00:00.000Z");

    const fieldLcp = report.field?.find((r) => r.metric === "lcp");
    expect(fieldLcp?.value).toBe(1240);
    expect(fieldLcp?.display).toBe("1.2 s");
    expect(fieldLcp?.percentile).toBe(1240);
    expect(fieldLcp?.rating).toBe("good");

    const fieldCls = report.field?.find((r) => r.metric === "cls");
    expect(fieldCls?.value).toBe(0.017);
    expect(fieldCls?.display).toBe("0.02");

    const labInp = report.lab?.find((r) => r.metric === "inp");
    expect(labInp?.value).toBe(180);
    expect(labInp?.display).toBe("180 ms");
    expect(labInp?.rating).toBe("good");
  });

  it("maps CrUX categories to ratings when thresholds alone would differ", () => {
    const fixture = {
      loadingExperience: {
        metrics: {
          INTERACTION_TO_NEXT_PAINT: { percentile: 450, category: "AVERAGE" },
        },
      },
    };
    const report = parsePsiReport(fixture, "https://example.com/", "mobile");
    expect(report.field?.find((r) => r.metric === "inp")?.rating).toBe("needs-improvement");
  });

  it("supports the EXPERIMENTAL_ metric key variants", () => {
    const fixture = {
      loadingExperience: {
        metrics: {
          EXPERIMENTAL_INTERACTION_TO_NEXT_PAINT: { percentile: 120, category: "FAST" },
        },
      },
    };
    const report = parsePsiReport(fixture, "https://example.com/", "mobile");
    expect(report.field?.find((r) => r.metric === "inp")?.value).toBe(120);
  });

  it("classifies lab values against the thresholds", () => {
    const fixture = {
      lighthouseResult: {
        audits: {
          "largest-contentful-paint": { numericValue: 5000 },
          "cumulative-layout-shift": { numericValue: 0.3 },
        },
      },
    };
    const report = parsePsiReport(fixture, "https://example.com/", "mobile");
    expect(report.lab?.find((r) => r.metric === "lcp")?.rating).toBe("poor");
    expect(report.lab?.find((r) => r.metric === "cls")?.rating).toBe("poor");
  });

  it("degrades gracefully on malformed or empty responses", () => {
    expect(parsePsiReport(null, "https://example.com/", "mobile")).toEqual({
      url: "https://example.com/",
      strategy: "mobile",
      field: undefined,
      fieldOverall: undefined,
      lab: undefined,
      labMeasuredAt: undefined,
    });
    expect(parsePsiReport({}, "https://example.com/", "mobile").field).toBeUndefined();
    expect(parsePsiReport("garbage", "https://example.com/", "mobile").lab).toBeUndefined();
  });

  it("omits field data entirely when the origin has no CrUX sample", () => {
    const report = parsePsiReport(
      { lighthouseResult: { audits: { "largest-contentful-paint": { numericValue: 900 } } } },
      "https://new-site.example/",
      "mobile",
    );
    expect(report.field).toBeUndefined();
    expect(report.lab).toHaveLength(1);
  });
});
