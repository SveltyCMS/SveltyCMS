/**
 * @vitest-environment node
 * @file tests/unit/components/ui/theme-context.test.ts
 * @description Unit tests for AdminTheme context propagation to primitives.
 */
import { describe, it, expect } from "vitest";
import { render } from "svelte/server";
import { AdminTheme } from "@src/components/ui/theme-context.svelte";
import ThemeTestWrapper from "./ThemeTestWrapper.svelte";

describe("AdminTheme Context & Adaptive Workspaces", () => {
  it("initializes AdminTheme with correct defaults", () => {
    const theme = new AdminTheme();
    expect(theme.density).toBe("cozy");
    expect(theme.role).toBe("admin");
    expect(theme.spacingScale).toBe(1.0);
    expect(theme.sidebarWidth).toBe("240px");
    expect(theme.headerHeight).toBe("64px");
    expect(theme.radiusCard).toBe("12px");
    expect(theme.radiusInput).toBe("6px");
  });

  it("calculates correct scale and sizes for compact density", () => {
    const theme = new AdminTheme({ density: "compact", role: "translator" });
    expect(theme.density).toBe("compact");
    expect(theme.spacingScale).toBe(0.8);
    expect(theme.sidebarWidth).toBe("200px");
    expect(theme.headerHeight).toBe("48px");
    expect(theme.radiusCard).toBe("6px");
    expect(theme.radiusInput).toBe("4px");
  });

  it("calculates correct scale and sizes for spacious density", () => {
    const theme = new AdminTheme({ density: "spacious", role: "admin" });
    expect(theme.density).toBe("spacious");
    expect(theme.spacingScale).toBe(1.2);
    expect(theme.sidebarWidth).toBe("280px");
    expect(theme.headerHeight).toBe("72px");
    expect(theme.radiusCard).toBe("16px");
    expect(theme.radiusInput).toBe("10px");
  });

  it("propagates compact density theme variables to Button, Card, Input, and Badge", () => {
    const { body } = render(ThemeTestWrapper, {
      props: { density: "compact", role: "translator" },
    });

    // Check button scaling and styling
    expect(body).toContain("height: 32px;");
    expect(body).toContain("padding-inline-start: 12.8px;");
    expect(body).toContain("padding-inline-end: 12.8px;");
    expect(body).toContain("gap: 6.4px;");
    expect(body).toContain("border-radius: var(--admin-radius-input, 4px);");

    // Check card styling
    expect(body).toContain("border-radius: var(--admin-radius-card, 12px);");
    expect(body).toContain("border-width: var(--admin-border-width, 1px);");
    expect(body).toContain("box-shadow: var(--admin-shadow-elevation);");

    // Check input scaling and styling
    expect(body).toContain("height: 32px;");
    expect(body).toContain("padding-inline-start: 9.6px;");
    expect(body).toContain("padding-inline-end: 9.6px;");
    expect(body).toContain("padding-top: 6.4px;");
    expect(body).toContain("padding-bottom: 6.4px;");

    // Check badge styling
    expect(body).toContain("border-radius: var(--admin-radius-input, 6px);");
  });

  it("propagates spacious density theme variables to components", () => {
    const { body } = render(ThemeTestWrapper, {
      props: { density: "spacious", role: "admin" },
    });

    // Check button scaling (height = 40 * 1.2 = 48px, px = 16 * 1.2 = 19.2px)
    expect(body).toContain("height: 48px;");
    expect(body).toContain("padding-inline-start: 19.2px;");
    expect(body).toContain("padding-inline-end: 19.2px;");
    expect(body).toContain("gap: 9.6px;");

    // Check input scaling (height = 40 * 1.2 = 48px, px = 12 * 1.2 = 14.4px)
    expect(body).toContain("height: 48px;");
    expect(body).toContain("padding-inline-start: 14.4px;");
    expect(body).toContain("padding-inline-end: 14.4px;");
  });
});
