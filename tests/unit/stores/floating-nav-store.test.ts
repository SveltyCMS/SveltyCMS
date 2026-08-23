/**
 * @file tests/unit/stores/floating-nav-store.test.ts
 * @description Unit tests for floating-nav prefs resolve, migrate, empty-safe fixed anchors.
 */

import { describe, expect, it } from "vitest";
import {
  createDefaultPrefs,
  DEFAULT_ENABLED_SYSTEM_IDS,
  DEFAULT_FAVORITE_COLOR,
  findSystemEndpointByPath,
  isNavFavoriteColor,
  isPathActiveInPrefs,
  isPathFixed,
  migrateLegacyFavorites,
  NAV_FAVORITE_COLORS,
  normalizeNavPath,
  parsePrefsPayload,
  resolveFloatingNavEndpoints,
  SYSTEM_ENDPOINTS,
  togglePathInPrefs,
  type FloatingNavPrefs,
} from "@src/stores/floating-nav-store.svelte.ts";

describe("floating-nav-store helpers", () => {
  describe("normalizeNavPath", () => {
    it("normalizes trailing slashes and empty", () => {
      expect(normalizeNavPath("/")).toBe("/");
      expect(normalizeNavPath("")).toBe("/");
      expect(normalizeNavPath("/user/")).toBe("/user");
      expect(normalizeNavPath("/config/system-settings/")).toBe("/config/system-settings");
    });

    it("leaves external URLs intact", () => {
      expect(normalizeNavPath("https://www.sveltycms.com")).toBe("https://www.sveltycms.com");
    });
  });

  describe("system catalog", () => {
    it("marks home and settings as fixed", () => {
      expect(SYSTEM_ENDPOINTS.find((e) => e.id === "home")?.fixed).toBe(true);
      expect(SYSTEM_ENDPOINTS.find((e) => e.id === "settings")?.fixed).toBe(true);
      expect(isPathFixed("/")).toBe(true);
      expect(isPathFixed("/config/system-settings")).toBe(true);
      expect(isPathFixed("/user")).toBe(false);
    });

    it("maps known page paths to system endpoints", () => {
      expect(findSystemEndpointByPath("/user")?.id).toBe("user");
      expect(findSystemEndpointByPath("/config/")?.id).toBe("config");
      expect(findSystemEndpointByPath("/collections/posts")).toBeUndefined();
    });
  });

  describe("migrateLegacyFavorites", () => {
    it("flattens url.path shape and dedupes", () => {
      const migrated = migrateLegacyFavorites([
        { id: "a", tooltip: "User", url: { path: "/user", external: false }, icon: "x" },
        { path: "/user", tooltip: "dup" },
        { tooltip: "broken" },
        null,
      ]);
      expect(migrated).toHaveLength(1);
      expect(migrated[0].path).toBe("/user");
      expect(migrated[0].tooltip).toBe("User");
    });
  });

  describe("parsePrefsPayload", () => {
    it("returns first-run defaults when empty", () => {
      const prefs = parsePrefsPayload(null);
      expect(prefs.enabledSystemIds).toEqual([...DEFAULT_ENABLED_SYSTEM_IDS]);
      expect(prefs.favorites).toEqual([]);
    });

    it("upgrades legacy home-only pins to full defaults", () => {
      const prefs = parsePrefsPayload(null, JSON.stringify(["home"]), null);
      expect(prefs.enabledSystemIds).toContain("user");
      expect(prefs.enabledSystemIds).toContain("config");
      expect(prefs.enabledSystemIds).toContain("settings");
    });

    it("respects explicit legacy multi-pin lists", () => {
      const prefs = parsePrefsPayload(null, JSON.stringify(["home", "media"]), null);
      expect(prefs.enabledSystemIds).toEqual(expect.arrayContaining(["home", "media"]));
      expect(prefs.enabledSystemIds).not.toContain("dashboard");
    });

    it("loads v1 prefs JSON", () => {
      const raw = JSON.stringify({
        version: 1,
        enabledSystemIds: ["home", "user", "settings"],
        favorites: [{ id: "f1", path: "/foo", tooltip: "Foo", icon: "mdi:star" }],
      });
      const prefs = parsePrefsPayload(raw);
      expect(prefs.enabledSystemIds).toEqual(["home", "user", "settings"]);
      expect(prefs.favorites).toHaveLength(1);
      expect(prefs.favorites[0].path).toBe("/foo");
    });
  });

  describe("resolveFloatingNavEndpoints", () => {
    it("includes default system routes on first run", () => {
      const items = resolveFloatingNavEndpoints(createDefaultPrefs(), { role: "editor" });
      const ids = items.map((i) => i.id);
      expect(ids[0]).toBe("home");
      expect(ids).toContain("user");
      expect(ids).toContain("config");
      expect(ids).toContain("media");
      expect(ids).toContain("settings");
      expect(ids).not.toContain("collectionbuilder"); // admin only
    });

    it("includes admin-only endpoints for admins", () => {
      const prefs = createDefaultPrefs();
      prefs.enabledSystemIds = [...prefs.enabledSystemIds, "collectionbuilder"];
      const items = resolveFloatingNavEndpoints(prefs, { role: "admin", isAdmin: true });
      expect(items.some((i) => i.id === "collectionbuilder")).toBe(true);
    });

    it("always keeps fixed Home + Settings even when all system ids cleared", () => {
      const prefs: FloatingNavPrefs = {
        version: 1,
        enabledSystemIds: [],
        favorites: [],
      };
      const items = resolveFloatingNavEndpoints(prefs, { role: "editor" });
      expect(items.length).toBeGreaterThanOrEqual(2);
      expect(items[0].id).toBe("home");
      expect(items.some((i) => i.id === "settings")).toBe(true);
      // No divide-by-zero risk: length always >= 1
      expect(items.length).toBeGreaterThan(0);
    });

    it("merges custom favorites and never re-lists system paths as favorites", () => {
      const prefs: FloatingNavPrefs = {
        version: 1,
        enabledSystemIds: ["home", "user", "settings"],
        favorites: [
          { id: "f1", path: "/user", tooltip: "dup user", icon: "x" },
          { id: "f2", path: "/collections/posts", tooltip: "Posts", icon: "mdi:post" },
        ],
      };
      const items = resolveFloatingNavEndpoints(prefs, null);
      // /user only once (system), custom collection kept
      expect(items.filter((i) => normalizeNavPath(i.path) === "/user")).toHaveLength(1);
      expect(items.some((i) => i.path === "/collections/posts")).toBe(true);

      // Disabled system path must not reappear via leftover favorite
      const stripped: FloatingNavPrefs = {
        version: 1,
        enabledSystemIds: ["home", "settings"],
        favorites: [{ id: "f1", path: "/user", tooltip: "legacy", icon: "x" }],
      };
      const minimal = resolveFloatingNavEndpoints(stripped, null);
      expect(minimal.some((i) => normalizeNavPath(i.path) === "/user")).toBe(false);
    });

    it("never returns empty list", () => {
      const prefs: FloatingNavPrefs = { version: 1, enabledSystemIds: [], favorites: [] };
      // Even if fixed flags were ignored somehow, home is forced
      const items = resolveFloatingNavEndpoints(prefs, null);
      expect(items.length).toBeGreaterThan(0);
      expect(items[0].id).toBe("home");
    });
  });

  describe("togglePathInPrefs", () => {
    it("disables a default system route via PageTitle path", () => {
      const prefs = createDefaultPrefs();
      expect(isPathActiveInPrefs(prefs, "/user")).toBe(true);
      const next = togglePathInPrefs(prefs, "/user", { name: "User Profile" });
      expect(isPathActiveInPrefs(next, "/user")).toBe(false);
      expect(next.enabledSystemIds).not.toContain("user");
      // fixed still on
      expect(isPathActiveInPrefs(next, "/")).toBe(true);
      expect(isPathActiveInPrefs(next, "/config/system-settings")).toBe(true);
    });

    it("re-enables a system route", () => {
      let prefs = createDefaultPrefs();
      prefs = togglePathInPrefs(prefs, "/user", { name: "User" });
      prefs = togglePathInPrefs(prefs, "/user", { name: "User" });
      expect(prefs.enabledSystemIds).toContain("user");
    });

    it("does not disable fixed Home / Settings", () => {
      const prefs = createDefaultPrefs();
      const afterHome = togglePathInPrefs(prefs, "/", { name: "Home" });
      expect(afterHome.enabledSystemIds).toEqual(prefs.enabledSystemIds);
      const afterSettings = togglePathInPrefs(prefs, "/config/system-settings", {
        name: "Settings",
      });
      expect(afterSettings.enabledSystemIds).toEqual(prefs.enabledSystemIds);
    });

    it("adds and removes custom favorites with correct path field", () => {
      let prefs = createDefaultPrefs();
      prefs = togglePathInPrefs(prefs, "/collections/articles", {
        name: "Articles",
        icon: "mdi:newspaper",
      });
      expect(prefs.favorites).toHaveLength(1);
      expect(prefs.favorites[0].path).toBe("/collections/articles");
      expect(prefs.favorites[0].color).toBe("bg-warning-500"); // default when color omitted
      expect(isPathActiveInPrefs(prefs, "/collections/articles")).toBe(true);

      prefs = togglePathInPrefs(prefs, "/collections/articles/", { name: "Articles" });
      expect(prefs.favorites).toHaveLength(0);
      expect(isPathActiveInPrefs(prefs, "/collections/articles")).toBe(false);
    });

    it("stores PageTitle navColor on custom favorites", () => {
      const prefs = togglePathInPrefs(createDefaultPrefs(), "/collections/posts", {
        name: "Posts",
        icon: "mdi:post",
        color: "bg-primary-500",
      });
      expect(prefs.favorites[0]).toMatchObject({
        path: "/collections/posts",
        tooltip: "Posts",
        icon: "mdi:post",
        color: "bg-primary-500",
      });
    });

    it("rejects unknown navColor strings (Tailwind JIT guard)", () => {
      const prefs = togglePathInPrefs(createDefaultPrefs(), "/collections/unknown", {
        name: "Unknown",
        // @ts-expect-error — NavFavoriteColor forbids this; runtime guard must still hold
        color: "bg-indigo-600",
      });
      expect(prefs.favorites[0].color).toBe(DEFAULT_FAVORITE_COLOR);
    });

    it("isNavFavoriteColor matches only the exported palette", () => {
      expect(NAV_FAVORITE_COLORS.length).toBeGreaterThanOrEqual(5);
      for (const c of NAV_FAVORITE_COLORS) expect(isNavFavoriteColor(c)).toBe(true);
      expect(isNavFavoriteColor("bg-indigo-600")).toBe(false);
      expect(isNavFavoriteColor("red")).toBe(false);
      expect(isNavFavoriteColor("")).toBe(false);
    });

    it("uses unique CSPRNG favorite ids (keyed {#each} safety)", () => {
      const a = togglePathInPrefs(createDefaultPrefs(), "/collections/a", { name: "A" });
      const b = togglePathInPrefs(createDefaultPrefs(), "/collections/b", { name: "B" });
      expect(a.favorites[0].id).toMatch(/^fav_/);
      expect(a.favorites[0].id).not.toBe(b.favorites[0].id);
      // uuid shape after the fav_ prefix
      expect(a.favorites[0].id.length).toBeGreaterThan(10);
    });
  });
});
