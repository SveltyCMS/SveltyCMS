/**
 * @vitest-environment node
 * @file tests/unit/theme-file-sync.test.ts
 * @description Unit tests for /themes/*.json boot-time sync helpers.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { join } from "node:path";
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";

const mockListThemes = vi.fn();
const mockSaveAdminTheme = vi.fn();
const mockCreateTheme = vi.fn();

vi.mock("../../src/services/core/admin-theme-service", () => ({
  adminThemeService: {
    listThemes: (...args: unknown[]) => mockListThemes(...args),
    saveAdminTheme: (...args: unknown[]) => mockSaveAdminTheme(...args),
    createTheme: (...args: unknown[]) => mockCreateTheme(...args),
  },
}));

describe("theme-file-sync", () => {
  const testThemesDir = join(process.cwd(), "themes");

  beforeEach(() => {
    vi.clearAllMocks();
    mockListThemes.mockResolvedValue([]);
    mockCreateTheme.mockResolvedValue({ id: "1", name: "Test", isActive: false, isDefault: false });
    mockSaveAdminTheme.mockResolvedValue({});
  });

  it("parseThemeFileContent rejects JSON without name", async () => {
    const { parseThemeFileContent } = await import("../../src/services/core/theme-file-sync");
    expect(() => parseThemeFileContent('{"density":"cozy"}', "bad.json")).toThrow(/missing "name"/);
  });

  it("parseThemeFileContent maps Skeleton properties to customCss", async () => {
    const { parseThemeFileContent } = await import("../../src/services/core/theme-file-sync");
    const payload = parseThemeFileContent(
      JSON.stringify({
        name: "Skeleton Import",
        properties: { "--color-primary-500": "oklch(0.5 0.2 260deg)" },
      }),
      "skeleton.json",
    );
    expect(payload.name).toBe("Skeleton Import");
    expect(payload.customCss).toContain("--color-primary-500");
    expect(payload.presetSource).toBe("imported");
  });

  it("parseThemeFileContent maps shorthand corporate palette to customCss", async () => {
    const { parseThemeFileContent } = await import("../../src/services/core/theme-file-sync");
    const raw = readFileSync(join(process.cwd(), "themes", "corporate.json"), "utf-8");
    const payload = parseThemeFileContent(raw, "corporate.json");
    expect(payload.name).toBe("Corporate");
    expect(payload.customCss).toContain("--color-primary-500: #0f766e");
    expect(payload.features?.brandedLogin).toBe(true);
  });

  it("importThemeFromJson creates a new theme when none exists", async () => {
    const { importThemeFromJson } = await import("../../src/services/core/theme-file-sync");
    const action = await importThemeFromJson({ name: "Corporate", density: "cozy" });
    expect(action).toBe("created");
    expect(mockCreateTheme).toHaveBeenCalledWith(
      "Corporate",
      { name: "Corporate", density: "cozy" },
      undefined,
    );
  });

  it("importThemeFromJson updates an existing theme by name", async () => {
    mockListThemes.mockResolvedValue([
      { id: "abc", name: "Corporate", isActive: true, isDefault: false },
    ]);
    const { importThemeFromJson } = await import("../../src/services/core/theme-file-sync");
    const action = await importThemeFromJson({ name: "Corporate", variant: "flat" });
    expect(action).toBe("updated");
    expect(mockSaveAdminTheme).toHaveBeenCalledWith(
      { name: "Corporate", variant: "flat" },
      undefined,
      "abc",
    );
  });

  it("syncAllThemeFiles scans built-in theme JSON files", async () => {
    expect(existsSync(join(testThemesDir, "corporate.json"))).toBe(true);
    const { syncAllThemeFiles } = await import("../../src/services/core/theme-file-sync");
    const results = await syncAllThemeFiles();
    expect(results.length).toBeGreaterThanOrEqual(3);
    expect(results.some((r) => r.name === "Corporate")).toBe(true);
    expect(mockCreateTheme).toHaveBeenCalled();
  });

  it("syncThemeFile reports parse errors", async () => {
    const badDir = join(process.cwd(), "themes", "__test-bad");
    mkdirSync(badDir, { recursive: true });
    const badFile = join(badDir, "broken.json");
    writeFileSync(badFile, "{ not-json");

    const { syncThemeFile } = await import("../../src/services/core/theme-file-sync");
    const result = await syncThemeFile(badFile);
    expect(result.action).toBe("error");

    rmSync(badDir, { recursive: true, force: true });
  });
});
