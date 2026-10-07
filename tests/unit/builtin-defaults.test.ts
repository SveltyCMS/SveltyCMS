/**
 * @vitest-environment node
 * @file tests/unit/builtin-defaults.test.ts
 * @description Tests for built-in Default admin theme config.
 */

import { describe, it, expect } from "vitest";
import { buildDefaultAdminThemeConfig } from "../../src/themes/builtin-defaults";

describe("builtin-defaults", () => {
  it("buildDefaultAdminThemeConfig includes default theme structure", () => {
    const config = buildDefaultAdminThemeConfig();
    expect(config.themeName).toBe("default");
    expect(config.features?.brandedLogin).toBe(true);
    expect(config.features?.stickyActionBar).toBe(true);
    expect(config.density).toBe("cozy");
    expect(config.variant).toBe("bordered");
    // No palette override: the builtin default inherits the src/app.css @theme
    // brand tokens instead of injecting a stale :root palette.
    expect(config.customCss).toBeUndefined();
  });
});
