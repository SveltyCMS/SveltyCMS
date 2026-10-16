/**
 * @file tests/unit/utils/error-display.test.ts
 * @description Unit tests for the admin error-boundary copy resolution.
 *
 * Pins the reported regression: a 500 ("System Error") must NOT render the
 * "page doesn't exist or has been moved" helper line — that copy belongs to 404s
 * only, otherwise a genuine server failure tells users to look for a renamed URL.
 */

import { describe, expect, it } from "vitest";
import { resolveErrorDisplay } from "@src/utils/error-display";

describe("resolveErrorDisplay", () => {
  it("treats a 500 as a system error without the page-moved helper line", () => {
    const display = resolveErrorDisplay(500, "Internal Error");
    expect(display.title).toBe("System Error");
    expect(display.showPageMoved).toBe(false);
  });

  it("shows the page-moved helper only for 404", () => {
    expect(resolveErrorDisplay(404, "Not Found").showPageMoved).toBe(true);
    for (const status of [400, 401, 403, 429, 500, 502, 503]) {
      expect(resolveErrorDisplay(status, "x").showPageMoved, `status ${status}`).toBe(false);
    }
  });

  it("maps common statuses to their recovery copy", () => {
    expect(resolveErrorDisplay(404, "Not Found").title).toMatch(/not found/i);
    expect(resolveErrorDisplay(403, "Forbidden").title).toBe("Access Denied");
    expect(resolveErrorDisplay(403, "Forbidden").summary).toBe("Forbidden");
    expect(resolveErrorDisplay(401, "").title).toBe("Unauthorized");
    expect(resolveErrorDisplay(429, "").title).toBe("Too Many Requests");
  });

  it("prefers the database copy for a 503 with database guidance", () => {
    const display = resolveErrorDisplay(503, "Failed to initialize database connection");
    expect(display.title).not.toBe("System Error");
    expect(display.showPageMoved).toBe(false);
  });

  it("falls back to the generic summary when no server message is provided", () => {
    const display = resolveErrorDisplay(500);
    expect(display.summary.length).toBeGreaterThan(0);
    expect(display.summary).not.toMatch(/moved/i);
  });
});
