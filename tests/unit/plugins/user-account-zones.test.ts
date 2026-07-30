/**
 * @file tests/unit/plugins/user-account-zones.test.ts
 * @description Ensures /user account injection zones stay in the Plugin InjectionZone union.
 *
 * Further account extensions must use these zones (see docs/development/plugins/*)
 * rather than hard-wiring UI into +page.svelte.
 */

import { describe, expect, it } from "vitest";
import type { InjectionZone } from "@src/plugins/types";

const ACCOUNT_ZONES = [
  "user_profile",
  "user_profile_sidebar",
  "user_security",
  "user_preferences",
  "user_admin_strip",
] as const satisfies readonly InjectionZone[];

describe("User account InjectionZones", () => {
  it.each(ACCOUNT_ZONES)("accepts %s as InjectionZone", (zone) => {
    void (zone satisfies InjectionZone);
    expect(typeof zone).toBe("string");
    expect(zone.startsWith("user_")).toBe(true);
  });

  it("keeps Profile / Security / Preferences / admin-strip coverage", () => {
    expect(ACCOUNT_ZONES).toEqual(
      expect.arrayContaining([
        "user_profile",
        "user_security",
        "user_preferences",
        "user_admin_strip",
      ]),
    );
  });
});
