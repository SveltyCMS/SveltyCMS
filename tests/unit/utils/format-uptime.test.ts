/**
 * @file tests/unit/utils/format-uptime.test.ts
 * @description Pins the millisecond uptime formatter used by the system monitor.
 *
 * Regression (m1): the monitor inferred the unit from magnitude, so a 29-minute
 * process (`1_784_889` ms) rendered as "20d". `formatUptimeMs` is unit-fixed.
 */

import { describe, expect, it } from "vitest";
import { formatUptimeMs } from "@utils/format-uptime";

describe("formatUptimeMs", () => {
  it("renders the retested 29-minute uptime as minutes, not days", () => {
    expect(formatUptimeMs(1_784_889)).toBe("29m");
  });

  it("treats zero, negative, and non-finite input as just started", () => {
    expect(formatUptimeMs(0)).toBe("Just started");
    expect(formatUptimeMs(-1)).toBe("Just started");
    expect(formatUptimeMs(-90_000)).toBe("Just started");
    expect(formatUptimeMs(Number.NaN)).toBe("Just started");
  });

  it("floors to whole minutes", () => {
    expect(formatUptimeMs(90_000)).toBe("1m");
    expect(formatUptimeMs(119_999)).toBe("1m");
    expect(formatUptimeMs(59_999)).toBe("< 1m");
  });

  it("renders whole hours", () => {
    expect(formatUptimeMs(3_600_000)).toBe("1h");
    expect(formatUptimeMs(7_200_000)).toBe("2h");
  });

  it("joins days, hours, and minutes", () => {
    expect(formatUptimeMs(90_061_000)).toBe("1d 1h 1m");
    expect(formatUptimeMs(86_400_000)).toBe("1d");
  });
});
