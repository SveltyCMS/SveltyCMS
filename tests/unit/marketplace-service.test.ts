/**
 * @vitest-environment node
 * @file tests/unit/marketplace-service.test.ts
 * @description Unit tests for marketplace catalog fallback and install flow.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockListThemes = vi.fn();
const mockCreateTheme = vi.fn();
const mockSaveAdminTheme = vi.fn();

vi.mock("../../src/services/core/admin-theme-service", () => ({
  adminThemeService: {
    listThemes: (...args: unknown[]) => mockListThemes(...args),
    createTheme: (...args: unknown[]) => mockCreateTheme(...args),
    saveAdminTheme: (...args: unknown[]) => mockSaveAdminTheme(...args),
  },
}));

describe("marketplace-service", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error("remote offline")) as unknown as typeof fetch;
    mockListThemes.mockResolvedValue([]);
    mockCreateTheme.mockResolvedValue({
      id: "1",
      name: "Corporate",
      isActive: false,
      isDefault: false,
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("lists local built-in themes when remote API is unavailable", async () => {
    const { marketplaceService } = await import("../../src/services/core/marketplace-service");
    const result = await marketplaceService.list({ type: "theme" });
    expect(result.source).toBe("local");
    expect(result.remoteAvailable).toBe(false);
    expect(result.items.length).toBeGreaterThanOrEqual(3);
    expect(result.items.every((i) => i.type === "theme")).toBe(true);
    expect(result.items.some((i) => i.name === "Corporate")).toBe(true);
  });

  it("filters marketplace items by search query", async () => {
    const { marketplaceService } = await import("../../src/services/core/marketplace-service");
    const result = await marketplaceService.list({ type: "theme", search: "operations" });
    expect(result.items.length).toBe(1);
    expect(result.items[0]?.name).toBe("Operations");
  });

  it("installs a local marketplace theme into the database", async () => {
    let themeInstalled = false;
    mockListThemes.mockImplementation(async () =>
      themeInstalled ? [{ id: "99", name: "Corporate", isActive: false, isDefault: false }] : [],
    );
    mockCreateTheme.mockImplementation(async () => {
      themeInstalled = true;
      return { id: "99", name: "Corporate", isActive: false, isDefault: false };
    });

    const { marketplaceService } = await import("../../src/services/core/marketplace-service");
    const catalog = await marketplaceService.list({ type: "theme" });
    const corporate = catalog.items.find((i) => i.name === "Corporate");
    expect(corporate).toBeTruthy();

    const installed = await marketplaceService.installTheme(corporate!.id);
    expect(installed.action).toBe("created");
    expect(installed.theme.name).toBe("Corporate");
    expect(mockCreateTheme).toHaveBeenCalled();
  });
});
