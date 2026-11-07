/**
 * @file tests/unit/config/settings-groups.test.ts
 * @description Unit tests for system settings group catalog (role filter, structure).
 */

import { describe, it, expect } from "vitest";
import {
  settingsGroups,
  getSettingGroup,
  getEnabledSettingGroups,
  getSettingGroupsByRole,
} from "@src/services/system/settings-groups";

describe("settingsGroups catalog", () => {
  it("defines unique group ids", () => {
    const ids = settingsGroups.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every enabled group has fields or is a special panel (gdpr)", () => {
    for (const g of getEnabledSettingGroups()) {
      expect(g.name.length).toBeGreaterThan(0);
      expect(g.icon.length).toBeGreaterThan(0);
      if (g.id !== "gdpr") {
        expect(Array.isArray(g.fields)).toBe(true);
        expect(g.fields.length).toBeGreaterThan(0);
      }
    }
  });

  it("getSettingGroup returns known groups", () => {
    expect(getSettingGroup("cache")?.name).toMatch(/cache/i);
    expect(getSettingGroup("security")?.id).toBe("security");
    expect(getSettingGroup("no-such-group")).toBeUndefined();
  });

  it("getSettingGroupsByRole filters adminOnly for non-admin", () => {
    const admin = getSettingGroupsByRole(true);
    const nonAdmin = getSettingGroupsByRole(false);
    expect(admin.length).toBeGreaterThanOrEqual(nonAdmin.length);
    // Cache is adminOnly in catalog
    const cache = settingsGroups.find((g) => g.id === "cache");
    if (cache?.adminOnly) {
      expect(admin.some((g) => g.id === "cache")).toBe(true);
      expect(nonAdmin.some((g) => g.id === "cache")).toBe(false);
    }
  });

  it("includes core groups used by E2E", () => {
    const ids = getEnabledSettingGroups().map((g) => g.id);
    for (const id of ["cache", "security", "email", "media", "gdpr"]) {
      expect(ids).toContain(id);
    }
  });

  it("languages group exposes system language (LOCALES / BASE_LOCALE) and content languages", () => {
    const group = getSettingGroup("languages");
    expect(group).toBeDefined();
    const keys = group!.fields.map((f) => f.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "LOCALES",
        "BASE_LOCALE",
        "DEFAULT_CONTENT_LANGUAGE",
        "AVAILABLE_CONTENT_LANGUAGES",
      ]),
    );
    expect(group!.fields.find((f) => f.key === "LOCALES")?.label).toMatch(/system language/i);
    expect(group!.fields.find((f) => f.key === "BASE_LOCALE")?.label).toMatch(/system language/i);
  });
});
