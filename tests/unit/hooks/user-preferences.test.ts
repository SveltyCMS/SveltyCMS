/**
 * @file tests/unit/hooks/user-preferences.test.ts
 * @description Tests for handleUserPreferences middleware.
 *
 * Exercises the real branches of the locale + theme sync hook:
 * - API / bootstrap / test-bypass / static fast-path skips
 * - systemLanguage + contentLanguage cookie validation and request-scoped locals
 * - dark / light / system theme resolution and the transformPageChunk FOUC guard
 * - ThemeManager initialized / uninitialized / throwing branches
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";
import { createMockEvent } from "./test-utils";

const themeMock = vi.hoisted(() => ({
  isInitialized: vi.fn(() => false),
  getTheme: vi.fn(async () => ({ name: "Default", customCss: "body { margin: 0 }" })),
}));

const sysState = vi.hoisted(() => ({
  overallState: "READY" as string,
}));

vi.mock("@src/databases/theme-manager", () => ({
  ThemeManager: {
    getInstance: () => ({
      isInitialized: themeMock.isInitialized,
      getTheme: themeMock.getTheme,
    }),
  },
}));

vi.mock("@src/stores/system/state.svelte.ts", () => ({
  getSystemState: () => ({ overallState: sysState.overallState }),
}));

import { handleUserPreferences } from "@src/hooks/handle-user-preferences";

const BASE_HTML = '<html lang="en" dir="ltr" class="dark"><head></head><body>OK</body></html>';

/** Simulates SvelteKit's resolve: applies transformPageChunk to a configurable HTML doc. */
function createHtmlResolve(baseHtml: string = BASE_HTML) {
  return vi.fn(
    async (
      _event: RequestEvent,
      opts?: { transformPageChunk?: (input: { html: string }) => string },
    ) => {
      let html = baseHtml;
      if (opts?.transformPageChunk) {
        const result = opts.transformPageChunk({ html });
        if (typeof result === "string") html = result;
      }
      return new Response(html, { status: 200, headers: { "Content-Type": "text/html" } });
    },
  );
}

describe("handleUserPreferences — fast-path skips", () => {
  beforeEach(() => {
    themeMock.isInitialized.mockReset();
    themeMock.getTheme.mockReset();
    sysState.overallState = "READY";
  });

  afterEach(() => vi.unstubAllEnvs());

  it("returns early without transform for API routes", async () => {
    const event = createMockEvent("/api/collections");
    const resolve = createHtmlResolve();

    await handleUserPreferences({ event, resolve });

    expect(resolve).toHaveBeenCalledWith(event);
    expect(event.locals.systemLanguage).toBeUndefined();
    expect(event.locals.darkMode).toBeUndefined();
  });

  it("returns early when the route spec skips preferences middleware", async () => {
    const event = createMockEvent("/dashboard");
    event.locals.routeSpec = { skipMiddlewares: ["preferences"] };
    const resolve = createHtmlResolve();

    await handleUserPreferences({ event, resolve });

    expect(resolve).toHaveBeenCalledWith(event);
    expect(event.locals.systemLanguage).toBeUndefined();
  });

  it("returns early on the terminal benchmark/test bypass", async () => {
    const event = createMockEvent("/dashboard");
    (event.locals as any).__testBypass = true;
    const resolve = createHtmlResolve();

    await handleUserPreferences({ event, resolve });

    expect(resolve).toHaveBeenCalledWith(event);
    expect(event.locals.systemLanguage).toBeUndefined();
  });

  it("returns early for static assets via pre-computed flags", async () => {
    const event = createMockEvent("/_app/immutable/chunks/index.js");
    (event.locals as any).__flags = {
      isStatic: true,
      isApi: false,
      isBootstrap: false,
      isPublic: false,
      isTestMode: true,
    };
    const resolve = createHtmlResolve();

    await handleUserPreferences({ event, resolve });

    expect(resolve).toHaveBeenCalledWith(event);
    expect(event.locals.systemLanguage).toBeUndefined();
  });
});

describe("handleUserPreferences — locale logic", () => {
  beforeEach(() => {
    themeMock.isInitialized.mockReset();
    themeMock.getTheme.mockReset();
    themeMock.isInitialized.mockReturnValue(false);
    sysState.overallState = "READY";
  });

  it("stamps request-scoped systemLanguage + contentLanguage from valid cookies", async () => {
    const event = createMockEvent("/dashboard", {
      cookies: { systemLanguage: "de", contentLanguage: "fr" },
    });
    const resolve = createHtmlResolve();

    const response = await handleUserPreferences({ event, resolve });
    const html = await response.text();

    expect(event.locals.systemLanguage).toBe("de");
    expect(event.locals.contentLanguage).toBe("fr");
    expect(html).toContain('lang="de"');
    expect(html).toContain('dir="ltr"');
  });

  it("normalizes region tags to their ISO 639-1 base", async () => {
    const event = createMockEvent("/dashboard", { cookies: { systemLanguage: "de-DE" } });
    const resolve = createHtmlResolve();

    await handleUserPreferences({ event, resolve });

    expect(event.locals.systemLanguage).toBe("de");
  });

  it("deletes an invalid systemLanguage cookie and leaves locals undefined", async () => {
    const event = createMockEvent("/dashboard", { cookies: { systemLanguage: "not-a-lang!" } });
    const resolve = createHtmlResolve();

    await handleUserPreferences({ event, resolve });

    expect(event.cookies.delete).toHaveBeenCalledWith("systemLanguage", { path: "/" });
    expect(event.locals.systemLanguage).toBeUndefined();
  });

  it("deletes an invalid contentLanguage cookie independently", async () => {
    const event = createMockEvent("/dashboard", {
      cookies: { systemLanguage: "en", contentLanguage: "1234" },
    });
    const resolve = createHtmlResolve();

    await handleUserPreferences({ event, resolve });

    expect(event.cookies.delete).toHaveBeenCalledWith("contentLanguage", { path: "/" });
    expect(event.locals.systemLanguage).toBe("en");
    expect(event.locals.contentLanguage).toBeUndefined();
  });

  it("applies RTL direction for a right-to-left system language", async () => {
    const event = createMockEvent("/dashboard", { cookies: { systemLanguage: "ar" } });
    const resolve = createHtmlResolve();

    const response = await handleUserPreferences({ event, resolve });
    const html = await response.text();

    expect(html).toContain('lang="ar"');
    expect(html).toContain('dir="rtl"');
  });
});

describe("handleUserPreferences — theme logic", () => {
  beforeEach(() => {
    themeMock.isInitialized.mockReset();
    themeMock.getTheme.mockReset();
    sysState.overallState = "READY";
  });

  it("sets darkMode true and keeps class=dark for a dark preference", async () => {
    themeMock.isInitialized.mockReturnValue(false);
    const event = createMockEvent("/dashboard", { cookies: { theme: "dark" } });
    const resolve = createHtmlResolve();

    const response = await handleUserPreferences({ event, resolve });
    const html = await response.text();

    expect(event.locals.darkMode).toBe(true);
    expect(html).toContain('class="dark"');
  });

  it("sets darkMode false and swaps class=dark to class=light for a light preference", async () => {
    themeMock.isInitialized.mockReturnValue(false);
    const event = createMockEvent("/dashboard", { cookies: { theme: "light" } });
    const resolve = createHtmlResolve();

    const response = await handleUserPreferences({ event, resolve });
    const html = await response.text();

    expect(event.locals.darkMode).toBe(false);
    expect(html).toContain('class="light"');
    expect(html).not.toContain('class="dark"');
  });

  it("defaults to darkMode false for the system preference without mutating the html class", async () => {
    themeMock.isInitialized.mockReturnValue(false);
    const event = createMockEvent("/dashboard");
    const resolve = createHtmlResolve();

    const response = await handleUserPreferences({ event, resolve });
    const html = await response.text();

    expect(event.locals.darkMode).toBe(false);
    expect(html).toContain('class="dark"');
  });

  it("hydrates locals.theme + customCss from an initialized ThemeManager", async () => {
    themeMock.isInitialized.mockReturnValue(true);
    themeMock.getTheme.mockResolvedValue({ name: "Custom", customCss: "h1 { color: red }" });
    const event = createMockEvent("/dashboard");
    const resolve = createHtmlResolve();

    await handleUserPreferences({ event, resolve });

    expect(themeMock.getTheme).toHaveBeenCalledWith(event.locals.tenantId);
    expect(event.locals.theme).toEqual({ name: "Custom", customCss: "h1 { color: red }" });
    expect(event.locals.customCss).toBe("h1 { color: red }");
  });

  it("leaves theme + customCss null/empty when ThemeManager is not initialized", async () => {
    themeMock.isInitialized.mockReturnValue(false);
    const event = createMockEvent("/dashboard");
    const resolve = createHtmlResolve();

    await handleUserPreferences({ event, resolve });

    expect(themeMock.getTheme).not.toHaveBeenCalled();
    expect(event.locals.theme).toBeNull();
    expect(event.locals.customCss).toBe("");
  });

  it("fails soft when getTheme throws while the system is READY", async () => {
    themeMock.isInitialized.mockReturnValue(true);
    themeMock.getTheme.mockRejectedValue(new Error("db down"));
    const event = createMockEvent("/dashboard");
    const resolve = createHtmlResolve();

    await handleUserPreferences({ event, resolve });

    expect(event.locals.theme).toBeNull();
    expect(event.locals.customCss).toBe("");
  });

  it("fails soft when getTheme throws while the system is not yet ready", async () => {
    themeMock.isInitialized.mockReturnValue(true);
    themeMock.getTheme.mockRejectedValue(new Error("db down"));
    sysState.overallState = "INITIALIZING";
    const event = createMockEvent("/dashboard");
    const resolve = createHtmlResolve();

    await handleUserPreferences({ event, resolve });

    expect(event.locals.theme).toBeNull();
    expect(event.locals.customCss).toBe("");
  });

  it("keeps an already-light html doc light for the light preference", async () => {
    themeMock.isInitialized.mockReturnValue(false);
    const event = createMockEvent("/dashboard", { cookies: { theme: "light" } });
    const resolve = createHtmlResolve('<html lang="en" dir="ltr" class="light"></html>');

    const response = await handleUserPreferences({ event, resolve });
    const html = await response.text();

    expect(html).toContain('class="light"');
    expect(html).not.toContain('class="dark"');
  });

  it("adds class=light when the html has no class for the light preference", async () => {
    themeMock.isInitialized.mockReturnValue(false);
    const event = createMockEvent("/dashboard", { cookies: { theme: "light" } });
    const resolve = createHtmlResolve('<html lang="en" dir="ltr"></html>');

    const response = await handleUserPreferences({ event, resolve });
    const html = await response.text();

    expect(html).toContain('class="light"');
  });

  it("adds class=dark when the html lacks it for the dark preference", async () => {
    themeMock.isInitialized.mockReturnValue(false);
    const event = createMockEvent("/dashboard", { cookies: { theme: "dark" } });
    const resolve = createHtmlResolve('<html lang="en" dir="ltr"></html>');

    const response = await handleUserPreferences({ event, resolve });
    const html = await response.text();

    expect(html).toContain('class="dark"');
  });

  it("defaults customCss to empty when the theme carries no custom CSS", async () => {
    themeMock.isInitialized.mockReturnValue(true);
    themeMock.getTheme.mockResolvedValue({ name: "Default" });
    const event = createMockEvent("/dashboard");
    const resolve = createHtmlResolve();

    await handleUserPreferences({ event, resolve });

    expect(event.locals.theme).toEqual({ name: "Default" });
    expect(event.locals.customCss).toBe("");
  });
});
