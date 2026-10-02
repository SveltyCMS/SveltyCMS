/**
 * @vitest-environment jsdom
 * @file tests/unit/stores/theme-store.test.ts
 * @description Unit tests for theme-store dark mode initialization and preference persistence.
 *
 * Features:
 * - Cookie and localStorage preference retrieval
 * - Light and dark mode resolution
 * - DOM class synchronization
 * - System preference fallback
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

vi.mock("$app/env", () => ({
  browser: true,
  dev: true,
  building: false,
  version: "1.0.0",
}));

import {
  initializeDarkMode,
  setThemePreference,
  toggleDarkMode,
  useSystemPreference,
  themeStore,
} from "@src/stores/theme-store.svelte";

describe("Theme Store - Preference and Dark Mode Resolution", () => {
  let mockCookies: string = "";
  let mockLocalStorage: Record<string, string> = {};
  let matchMediaMatches = false;

  beforeEach(() => {
    mockCookies = "";
    mockLocalStorage = {};
    matchMediaMatches = false;

    // Mock document.cookie
    Object.defineProperty(document, "cookie", {
      get: () => mockCookies,
      set: (val: string) => {
        const [cookiePart] = val.split(";");
        const [k, v] = cookiePart.split("=");
        const existing = mockCookies
          ? mockCookies.split("; ").filter((c) => !c.startsWith(`${k}=`))
          : [];
        if (v !== undefined) {
          existing.push(`${k}=${v}`);
        }
        mockCookies = existing.join("; ");
      },
      configurable: true,
    });

    // Mock localStorage
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: vi.fn((key: string) => mockLocalStorage[key] ?? null),
        setItem: vi.fn((key: string, val: string) => {
          mockLocalStorage[key] = val;
        }),
        removeItem: vi.fn((key: string) => {
          delete mockLocalStorage[key];
        }),
        clear: vi.fn(() => {
          mockLocalStorage = {};
        }),
      },
      configurable: true,
      writable: true,
    });

    // Mock matchMedia: by default Windows dark mode (prefers-color-scheme: light matches false)
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("light") ? matchMediaMatches : !matchMediaMatches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    document.documentElement.className = "";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should resolve light mode and update DOM when cookie is 'light' even if OS is dark", () => {
    // OS is dark
    matchMediaMatches = false;
    // User set cookie to light
    mockCookies = "theme=light";
    // Simulate DOM starting with dark (e.g. from app.html default)
    document.documentElement.classList.add("dark");

    initializeDarkMode();

    expect(themeStore.themePreference).toBe("light");
    expect(themeStore.isDarkMode).toBe(false);
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("should fallback to localStorage if cookie is not present", () => {
    matchMediaMatches = false;
    mockLocalStorage["theme"] = "light";
    document.documentElement.classList.add("dark");

    initializeDarkMode();

    expect(themeStore.themePreference).toBe("light");
    expect(themeStore.isDarkMode).toBe(false);
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(mockCookies).toContain("theme=light");
  });

  it("should resolve dark mode when cookie is 'dark' even if OS is light", () => {
    matchMediaMatches = true; // OS prefers light
    mockCookies = "theme=dark";

    initializeDarkMode();

    expect(themeStore.themePreference).toBe("dark");
    expect(themeStore.isDarkMode).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);
  });

  it("should resolve system preference when preference is 'system'", () => {
    matchMediaMatches = false; // OS is dark
    mockCookies = "theme=system";

    initializeDarkMode();

    expect(themeStore.themePreference).toBe("system");
    expect(themeStore.isDarkMode).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    // Switch OS to light
    matchMediaMatches = true;
    initializeDarkMode("system");
    expect(themeStore.themePreference).toBe("system");
    expect(themeStore.isDarkMode).toBe(false);
    expect(document.documentElement.classList.contains("light")).toBe(true);
  });

  it("should update cookie, localStorage, state, and DOM on setThemePreference('light')", () => {
    matchMediaMatches = false; // OS is dark
    setThemePreference("light");

    expect(themeStore.themePreference).toBe("light");
    expect(themeStore.isDarkMode).toBe(false);
    expect(mockCookies).toContain("theme=light");
    expect(mockLocalStorage["theme"]).toBe("light");
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("should correctly cycle with toggleDarkMode()", () => {
    matchMediaMatches = false; // OS is dark
    setThemePreference("dark");
    expect(themeStore.isDarkMode).toBe(true);

    toggleDarkMode();
    expect(themeStore.themePreference).toBe("light");
    expect(themeStore.isDarkMode).toBe(false);

    toggleDarkMode();
    expect(themeStore.themePreference).toBe("dark");
    expect(themeStore.isDarkMode).toBe(true);
  });

  it("should reset to system preference with useSystemPreference()", () => {
    setThemePreference("light");
    expect(themeStore.themePreference).toBe("light");

    useSystemPreference();
    expect(themeStore.themePreference).toBe("system");
    expect(mockCookies).toContain("theme=system");
    expect(mockLocalStorage["theme"]).toBe("system");
  });
});
