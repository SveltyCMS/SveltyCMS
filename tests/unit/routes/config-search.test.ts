/**
 * @file tests/unit/routes/config-search.test.ts
 * @description Filter contract for the `/config` tile search.
 *
 * The search is pure data (no DOM), so this pins the behaviour the page relies
 * on: label/description matching, synonyms for setting-level terms, AND
 * semantics for multi-word queries, and match-all on an empty query.
 */

import { describe, expect, it } from "vitest";
import {
  CONFIG_SEARCH_ALIASES,
  matchesConfigQuery,
  tokenizeConfigQuery,
} from "../../../src/routes/(app)/config/config-search";

const SETTINGS = {
  id: "settings",
  label: "System Settings",
  displayLabel: "System Settings",
  name: "System Settings",
  description: "Database and infrastructure configuration — extensible via plugins",
};

const SYNC = {
  id: "sync",
  label: "Data Sync",
  displayLabel: "Content Sync",
  name: "Data Sync",
  description: "Import content from external platforms and sync config to filesystem",
};

const TRASH = {
  id: "trash",
  label: "Trash",
  displayLabel: "Trash",
  name: "Trash",
  description: "Recover or permanently delete soft-deleted content",
};

describe("config tile search", () => {
  it("matches the label, key, and description regardless of case", () => {
    expect(matchesConfigQuery(SETTINGS, tokenizeConfigQuery("settings"))).toBe(true);
    expect(matchesConfigQuery(SETTINGS, tokenizeConfigQuery("INFRASTRUCTURE"))).toBe(true);
    expect(matchesConfigQuery(SETTINGS, tokenizeConfigQuery("extensible"))).toBe(true);
  });

  it("folds punctuation so hyphenated queries still match", () => {
    expect(matchesConfigQuery(SETTINGS, tokenizeConfigQuery("system-settings"))).toBe(true);
    expect(matchesConfigQuery(SYNC, tokenizeConfigQuery("data_sync"))).toBe(true);
  });

  it("finds setting-level terms through the aliases", () => {
    expect(matchesConfigQuery(SETTINGS, tokenizeConfigQuery("cache"))).toBe(true);
    expect(matchesConfigQuery(SETTINGS, tokenizeConfigQuery("smtp"))).toBe(true);
    expect(matchesConfigQuery(SETTINGS, tokenizeConfigQuery("2fa"))).toBe(true);
    expect(matchesConfigQuery(SYNC, tokenizeConfigQuery("wordpress"))).toBe(true);
    expect(matchesConfigQuery(TRASH, tokenizeConfigQuery("restore"))).toBe(true);
  });

  it("requires every token (AND semantics)", () => {
    expect(matchesConfigQuery(SYNC, tokenizeConfigQuery("import migration"))).toBe(true);
    expect(matchesConfigQuery(SYNC, tokenizeConfigQuery("import cache"))).toBe(false);
  });

  it("returns false when nothing matches and true for an empty query", () => {
    expect(matchesConfigQuery(TRASH, tokenizeConfigQuery("no-such-page"))).toBe(false);
    expect(matchesConfigQuery(TRASH, tokenizeConfigQuery("   "))).toBe(true);
    expect(tokenizeConfigQuery("   ")).toEqual([]);
  });

  it("keeps aliases lower-case, trimmed, and non-empty", () => {
    for (const alias of Object.values(CONFIG_SEARCH_ALIASES)) {
      expect(alias.length).toBeGreaterThan(0);
      expect(alias).toBe(alias.trim());
      expect(alias).toBe(alias.toLowerCase());
    }
  });
});
