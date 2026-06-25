/**
 * @vitest-environment node
 * @file tests/unit/builtin-defaults.test.ts
 * @description Tests for built-in Default admin theme config.
 */

import { describe, it, expect } from "vitest";
import { buildDefaultAdminThemeConfig } from "../../src/themes/builtin-defaults";

describe("builtin-defaults", () => {
  it("buildDefaultAdminThemeConfig includes default palette customCss", () => {
    const config = buildDefaultAdminThemeConfig();
    expect(config.themeName).toBe("default");
    expect(config.features?.brandedLogin).toBe(true);
    expect(config.features?.stickyActionBar).toBe(true);
    expect(config.density).toBe("cozy");
    expect(config.variant).toBe("bordered");
    expect(config.customCss).toContain("--color-primary-500: #0f766e");
    expect(config.customCss).toContain("[data-admin-theme]");
  });
});
