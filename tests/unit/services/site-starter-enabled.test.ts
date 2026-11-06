/**
 * @file tests/unit/services/site-starter-enabled.test.ts
 * @description The public site starter is opt-in.
 *
 * A missing setting must mean "headless" so a blank/content/commerce install
 * serves `/login` at `/`. The Website Starter preset writes `true` explicitly.
 */

import { describe, it, expect, vi } from "vitest";

const getPublicSettingSync = vi.hoisted(() => vi.fn());

vi.mock("@src/services/core/settings-service", () => ({ getPublicSettingSync }));

import { isSiteStarterEnabled } from "@src/services/site/site-config.server";

describe("isSiteStarterEnabled", () => {
  it("treats unset, false and the string 'false' as disabled", () => {
    for (const value of [undefined, null, false, "false", 0]) {
      getPublicSettingSync.mockReturnValue(value);
      expect(isSiteStarterEnabled(), `value=${String(value)}`).toBe(false);
    }
  });

  it("accepts a parsed boolean and the raw stored string", () => {
    getPublicSettingSync.mockReturnValue(true);
    expect(isSiteStarterEnabled()).toBe(true);

    // Rows written before schema parsing stored `"true"`.
    getPublicSettingSync.mockReturnValue("true");
    expect(isSiteStarterEnabled()).toBe(true);
  });
});
