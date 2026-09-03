/**
 * @file tests/unit/utils/format-date.test.ts
 * @description Unit tests for src/utils/format-date.ts
 */

import { describe, it, expect } from "vitest";
import {
  resolveLocale,
  parseDateInput,
  formatDate,
  formatDateTime,
  formatTime,
  formatNumber,
} from "@utils/format-date";

describe("format-date utility", () => {
  describe("resolveLocale", () => {
    it("should prioritize explicit locale parameter", () => {
      expect(resolveLocale("de")).toBe("de");
      expect(resolveLocale("fr-FR")).toBe("fr-FR");
    });

    it("should fallback to 'en' when no context exists", () => {
      expect(resolveLocale()).toBe("en");
      expect(resolveLocale("")).toBe("en");
    });
  });

  describe("parseDateInput", () => {
    it("should return Date instance as is", () => {
      const d = new Date(2026, 0, 15);
      expect(parseDateInput(d)).toBe(d);
    });

    it("should parse millisecond timestamps", () => {
      const ms = 1735689600000;
      const d = parseDateInput(ms);
      expect(d?.getTime()).toBe(ms);
    });

    it("should parse second timestamps", () => {
      const sec = 1735689600;
      const d = parseDateInput(sec);
      expect(d?.getTime()).toBe(sec * 1000);
    });

    it("should parse ISO date strings", () => {
      const iso = "2026-03-15T12:00:00.000Z";
      const d = parseDateInput(iso);
      expect(d?.toISOString()).toBe(iso);
    });

    it("should return null on empty, null, or invalid dates", () => {
      expect(parseDateInput(null)).toBeNull();
      expect(parseDateInput(undefined)).toBeNull();
      expect(parseDateInput("")).toBeNull();
      expect(parseDateInput("invalid-date-string")).toBeNull();
      expect(parseDateInput(NaN)).toBeNull();
    });
  });

  describe("formatDate", () => {
    const testDate = new Date(Date.UTC(2026, 2, 15, 14, 30, 0));

    it("should format valid dates with default date options", () => {
      const result = formatDate(testDate, "en");
      expect(result).toBeTruthy();
      expect(result).toContain("2026");
    });

    it("should accept custom options", () => {
      const result = formatDate(testDate, { month: "long" }, "en");
      expect(result).toContain("March");
    });

    it("should return fallback for invalid inputs", () => {
      expect(formatDate(null)).toBe("");
      expect(formatDate(undefined, undefined, undefined, "-")).toBe("-");
      expect(formatDate("invalid")).toBe("");
    });
  });

  describe("formatDateTime", () => {
    const testDate = new Date(Date.UTC(2026, 2, 15, 14, 30, 0));

    it("should format date and time with deterministic locale", () => {
      const result = formatDateTime(testDate, "en");
      expect(result).toBeTruthy();
      expect(result).toContain("2026");
    });

    it("should respect options like dateStyle and timeStyle", () => {
      const result = formatDateTime(testDate, { dateStyle: "short", timeStyle: "short" }, "en");
      expect(result).toBeTruthy();
    });

    it("should return fallback for invalid inputs", () => {
      expect(formatDateTime(null)).toBe("");
      expect(formatDateTime(undefined, undefined, undefined, "N/A")).toBe("N/A");
    });
  });

  describe("formatTime", () => {
    const testDate = new Date(Date.UTC(2026, 2, 15, 14, 30, 0));

    it("should format time with deterministic locale", () => {
      const result = formatTime(testDate, "en");
      expect(result).toBeTruthy();
      // Contains minutes: 30
      expect(result).toContain("30");
    });

    it("should accept custom time options", () => {
      const result = formatTime(testDate, { hour: "2-digit", minute: "2-digit" }, "en");
      expect(result).toBeTruthy();
    });

    it("should return fallback on invalid inputs", () => {
      expect(formatTime(null)).toBe("");
    });
  });

  describe("formatNumber", () => {
    it("should format numbers deterministically", () => {
      expect(formatNumber(1234567, "en")).toBe("1,234,567");
      expect(formatNumber(1234567, "de")).toBe("1.234.567");
    });

    it("should handle null and undefined", () => {
      expect(formatNumber(null)).toBe("—");
      expect(formatNumber(undefined, undefined, undefined, "0")).toBe("0");
    });
  });
});
