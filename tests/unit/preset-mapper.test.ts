/**
 * @vitest-environment node
 * @file tests/unit/skeleton-preset-mapper.test.ts
 * @description Unit tests for Skeleton.dev preset → SveltyCMS admin CSS mapping.
 */

import { describe, it, expect } from "vitest";
import {
  mapPresetToAdminTheme,
  mapThemePropertiesToCss,
  parseCssPropertiesBlock,
  expandShorthandPaletteProperties,
} from "../../src/utils/theme-preset-mapper";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sampleProperties = {
  "--color-primary-500": "oklch(0.57 0.21 258.29deg)",
  "--color-tertiary-500": "oklch(0.65 0.26 2.47deg)",
  "--color-accent-500": "oklch(0.55 0.2 300deg)",
  "--color-surface-950": "oklch(0.18 0 0)",
  "--radius-base": "0.25rem",
  "--radius-container": "0.375rem",
  "--spacing": "0.22rem",
};

describe("preset-mapper", () => {
  it("maps properties to scoped admin CSS", () => {
    const css = mapThemePropertiesToCss(sampleProperties);
    expect(css).toContain(":root, .admin-theme-container, [data-admin-theme]");
    expect(css).toContain("--color-primary-500: oklch(0.57 0.21 258.29deg);");
    expect(css).toContain("--color-tertiary-500: oklch(0.55 0.2 300deg);");
    expect(css).not.toContain("--color-accent-500");
    expect(css).toContain("--admin-radius-card: 0.375rem;");
    expect(css).toContain("--admin-radius-button: 0.25rem;");
  });

  it("blocks unsafe CSS values", () => {
    const css = mapThemePropertiesToCss({
      "--color-primary-500": "url('http://evil.com/x.png')",
      "--color-error-500": "oklch(0.5 0.2 20deg)",
    });
    expect(css).not.toContain("url(");
    expect(css).toContain("--color-error-500");
  });

  it("maps theme preset JSON to admin theme fields", () => {
    const mapped = mapPresetToAdminTheme({
      name: "Midnight",
      properties: sampleProperties,
    });
    expect(mapped.name).toBe("Midnight");
    expect(mapped.presetSource).toBe("imported");
    expect(mapped.customCss).toContain("--color-primary-500");
  });

  it("parses CSS property blocks", () => {
    const block = `[data-theme='cerberus'] {
        --color-primary-500: oklch(0.57 0.21 258.29deg);
        --radius-base: 0.25rem;
      }`;
    const props = parseCssPropertiesBlock(block);
    expect(props["--color-primary-500"]).toBe("oklch(0.57 0.21 258.29deg)");
    expect(props["--radius-base"]).toBe("0.25rem");
  });

  it("maps CSS-only theme exports with name", () => {
    const mapped = mapPresetToAdminTheme({
      name: "From CSS",
      css: "[data-theme='x'] { --color-primary-500: oklch(0.5 0.2 260deg); }",
    });
    expect(mapped.name).toBe("From CSS");
    expect(mapped.customCss).toContain("--color-primary-500");
  });

  it("maps theme file payloads with properties", () => {
    const normalized = mapPresetToAdminTheme({
      name: "Marketplace Theme",
      properties: { "--color-primary-500": "oklch(0.5 0.2 260deg)" },
    });
    expect(normalized?.name).toBe("Marketplace Theme");
    expect(normalized?.customCss).toContain("--color-primary-500");
    expect(normalized?.presetSource).toBe("imported");
  });

  it("expands shorthand palette properties to full shade scales", () => {
    const expanded = expandShorthandPaletteProperties({
      primary: "#0f766e",
      surface: "#f8fafc",
    });
    expect(expanded["--color-primary-500"]).toBe("#0f766e");
    expect(expanded["--color-primary-50"]).toContain("color-mix");
    expect(expanded["--color-primary-950"]).toContain("color-mix");
    expect(expanded["--color-surface-50"]).toBe("#f8fafc");
    expect(expanded["--color-surface-500"]).toContain("color-mix");
    expect(expanded["--color-surface-800"]).toContain("color-mix");
    expect(expanded["--color-surface-950"]).toContain("color-mix");
  });

  it("maps default.json shorthand properties to customCss", () => {
    const preset = JSON.parse(
      readFileSync(join(process.cwd(), "src", "themes", "default.json"), "utf-8"),
    );
    const mapped = mapPresetToAdminTheme(preset);
    expect(mapped.customCss).toContain("--color-primary-500: #0f766e");
    expect(mapped.customCss).toContain("--color-tertiary-500: #1d4ed8");
    expect(mapped.customCss).toContain(":root, .admin-theme-container, [data-admin-theme]");
  });
});
