/**
 * @vitest-environment node
 * @file tests/unit/theme-file-sync.test.ts
 * @description Unit tests for /src/themes/*.json boot-time sync helpers.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { join } from "node:path";
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";

const mockListThemes = vi.fn();
const mockSaveAdminTheme = vi.fn();
const mockCreateTheme = vi.fn();
const mockDeleteTheme = vi.fn();

vi.mock("../../src/services/core/admin-theme-service", () => ({
  adminThemeService: {
    listThemes: (...args: unknown[]) => mockListThemes(...args),
    saveAdminTheme: (...args: unknown[]) => mockSaveAdminTheme(...args),
    createTheme: (...args: unknown[]) => mockCreateTheme(...args),
    deleteTheme: (...args: unknown[]) => mockDeleteTheme(...args),
  },
}));

describe("theme-file-sync", () => {
  const testThemesDir = join(process.cwd(), "src", "themes");

  beforeEach(() => {
    vi.clearAllMocks();
    mockListThemes.mockResolvedValue([]);
    mockCreateTheme.mockResolvedValue({
      id: "1",
      name: "Test",
      isActive: false,
      isDefault: false,
    });
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

  it("converges a legacy built-in row onto the canonical name and clears the stale palette", async () => {
    mockListThemes.mockResolvedValue([
      { id: "legacy", name: "SveltyCMSTheme", isActive: true, isDefault: true },
      { id: "dup", name: "Default", isActive: false, isDefault: false },
    ]);
    const { importThemeFromJson } = await import("../../src/services/core/theme-file-sync");
    const action = await importThemeFromJson({
      name: "Default",
      presetSource: "sveltycms-builtin",
      // Explicit undefined = the built-in file carries no palette override, so the
      // sync must CLEAR whatever stale customCss the DB row still holds.
      customCss: undefined,
    });
    expect(action).toBe("updated");
    // The ACTIVE row wins (it is what the layout renders) and is renamed to canonical.
    expect(mockSaveAdminTheme).toHaveBeenCalledWith(
      { name: "Default", presetSource: "sveltycms-builtin", customCss: undefined },
      undefined,
      "legacy",
    );
    // The leftover inactive duplicate is pruned.
    expect(mockDeleteTheme).toHaveBeenCalledWith("dup", undefined);
  });

  it("does not prune a built-in row that is active or default", async () => {
    mockListThemes.mockResolvedValue([
      { id: "a", name: "Default", isActive: true, isDefault: false },
      { id: "b", name: "SveltyCMSTheme", isActive: false, isDefault: true },
    ]);
    const { importThemeFromJson } = await import("../../src/services/core/theme-file-sync");
    await importThemeFromJson({ name: "Default", presetSource: "sveltycms-builtin" });
    expect(mockSaveAdminTheme).toHaveBeenCalledWith(
      { name: "Default", presetSource: "sveltycms-builtin" },
      undefined,
      "a",
    );
    expect(mockDeleteTheme).not.toHaveBeenCalled();
  });

  it("parseThemeFileContent leaves the builtin default without a palette override", async () => {
    const { parseThemeFileContent } = await import("../../src/services/core/theme-file-sync");
    const raw = readFileSync(join(process.cwd(), "src", "themes", "default.json"), "utf-8");
    const payload = parseThemeFileContent(raw, "default.json");
    expect(payload.name).toBe("Default");
    expect(payload.customCss).toBeUndefined();
    expect(payload.features?.brandedLogin).toBe(true);
  });

  it("importThemeFromJson creates a new theme when none exists", async () => {
    const { importThemeFromJson } = await import("../../src/services/core/theme-file-sync");
    const action = await importThemeFromJson({
      name: "Default",
      density: "cozy",
    });
    expect(action).toBe("created");
    expect(mockCreateTheme).toHaveBeenCalledWith(
      "Default",
      { name: "Default", density: "cozy" },
      undefined,
    );
  });

  it("importThemeFromJson updates an existing theme by name", async () => {
    mockListThemes.mockResolvedValue([
      { id: "abc", name: "Default", isActive: true, isDefault: false },
    ]);
    const { importThemeFromJson } = await import("../../src/services/core/theme-file-sync");
    const action = await importThemeFromJson({
      name: "Default",
      variant: "flat",
    });
    expect(action).toBe("updated");
    expect(mockSaveAdminTheme).toHaveBeenCalledWith(
      { name: "Default", variant: "flat" },
      undefined,
      "abc",
    );
  });

  it("syncAllThemeFiles scans built-in theme JSON files", async () => {
    expect(existsSync(join(testThemesDir, "default.json"))).toBe(true);
    const { syncAllThemeFiles } = await import("../../src/services/core/theme-file-sync");
    const results = await syncAllThemeFiles();
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((r) => r.name === "Default")).toBe(true);
    expect(mockCreateTheme).toHaveBeenCalled();
  });

  it("syncThemeFile reports parse errors", async () => {
    const badDir = join(process.cwd(), "src", "themes", "__test-bad");
    mkdirSync(badDir, { recursive: true });
    const badFile = join(badDir, "broken.json");
    writeFileSync(badFile, "{ not-json");

    const { syncThemeFile } = await import("../../src/services/core/theme-file-sync");
    const result = await syncThemeFile(badFile);
    expect(result.action).toBe("error");

    rmSync(badDir, { recursive: true, force: true });
  });
});
