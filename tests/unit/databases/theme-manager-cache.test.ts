/**
 * @file tests/unit/databases/theme-manager-cache.test.ts
 * @description Regression tests for ThemeManager cache scoping (TM1), local-cache
 *              TTL (TM2), and the tenant→global mapping cache (TM3).
 *
 * ### Features:
 * - global theme is written and read under tenant "global" (not "default")
 * - process-local theme cache expires and re-fetches (no stale-forever)
 * - a tenant without its own theme caches the global mapping (no per-request re-resolve)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeManager, DEFAULT_THEME } from "@src/databases/theme-manager";
import type { IDBAdapter, Theme } from "@src/databases/db-interface";

const mockGet = vi.fn();
const mockSet = vi.fn();
const mockPublishInvalidation = vi.fn();
const mockClearByPattern = vi.fn();

vi.mock("@src/databases/cache/cache-service", () => ({
  cacheService: {
    get: (...args: unknown[]) => mockGet(...args),
    set: (...args: unknown[]) => mockSet(...args),
    publishInvalidation: (...args: unknown[]) => mockPublishInvalidation(...args),
    clearByPattern: (...args: unknown[]) => mockClearByPattern(...args),
  },
}));

function makeTheme(name: string): Theme {
  return { ...DEFAULT_THEME, name, isActive: true, isDefault: true };
}

function makeDb(themes: Theme[]): IDBAdapter {
  return {
    isConnected: () => true,
    system: {
      themes: {
        getAllThemes: vi.fn().mockResolvedValue(themes),
        setDefault: vi.fn().mockResolvedValue({ success: true }),
      },
    },
  } as unknown as IDBAdapter;
}

describe("ThemeManager cache scoping / TTL / mapping", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockSet.mockReset();
    mockPublishInvalidation.mockReset();
    mockClearByPattern.mockReset();
    mockGet.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("TM1: writes the global theme under the 'global' tenant scope", async () => {
    const theme = makeTheme("Configured Theme");
    const db = makeDb([theme]);
    const manager = ThemeManager.getInstance();

    await manager.initialize(db);

    expect(mockSet).toHaveBeenCalledWith("theme:global", theme, 300, "global");
  });

  it("TM1: reads the global theme under the 'global' tenant scope", async () => {
    const theme = makeTheme("Configured Theme");
    const db = makeDb([theme]);
    const manager = ThemeManager.getInstance();

    vi.useFakeTimers();
    await manager.initialize(db);
    mockSet.mockClear();
    mockGet.mockResolvedValue(undefined);

    // Expire the process-local entry so the read path reaches cacheService.
    vi.advanceTimersByTime(300_001);
    await manager.getTheme(null);

    expect(mockGet).toHaveBeenCalledWith("theme:global", "global");
  });

  it("TM2: the process-local cache expires and re-fetches instead of staying stale", async () => {
    const theme = makeTheme("Configured Theme");
    const db = makeDb([theme]);
    const manager = ThemeManager.getInstance();

    vi.useFakeTimers();
    await manager.initialize(db);

    // First read hits the local cache — no cacheService.get, no DB reload.
    const first = await manager.getTheme(null);
    expect(first.name).toBe("Configured Theme");
    expect(mockGet).not.toHaveBeenCalled();

    // After TTL the local entry is dropped; the read re-fetches from the DB.
    vi.advanceTimersByTime(300_001);
    await manager.getTheme(null);
    expect(db.system.themes.getAllThemes).toHaveBeenCalledTimes(2);
  });

  it("TM3: a tenant without its own theme caches the global mapping", async () => {
    const theme = makeTheme("Configured Theme");
    const db = makeDb([theme]);
    const manager = ThemeManager.getInstance();

    await manager.initialize(db);

    // First tenant read misses tenant scope and falls back to global.
    const first = await manager.getTheme("tenant-a");
    expect(first.name).toBe("Configured Theme");
    expect(mockGet).toHaveBeenCalledWith("theme:tenant-a", "tenant-a");

    // The tenant→global mapping is now cached: a second read never re-resolves.
    mockGet.mockClear();
    const second = await manager.getTheme("tenant-a");
    expect(second.name).toBe("Configured Theme");
    expect(mockGet).not.toHaveBeenCalled();
  });
});
