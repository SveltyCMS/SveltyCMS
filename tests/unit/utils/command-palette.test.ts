/**
 * @file tests/unit/utils/command-palette.test.ts
 * @description Unit tests for global command palette scoring, prefixes, recents,
 * and multi-locale matchTerms (EN typing under DE/HI UI).
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  parsePaletteQuery,
  scoreEntry,
  flattenToRankedItems,
  recentsStorageKey,
  loadRecents,
  pushRecent,
  collectionsToEntries,
  staticDefsToEntries,
  buildMatchTerms,
  tokenizeForSearch,
  type CommandPaletteEntry,
} from "@utils/command-palette";
import type { ContentNode } from "@src/content/types";

describe("parsePaletteQuery", () => {
  it("returns empty all-filter for blank input", () => {
    expect(parsePaletteQuery("")).toEqual({ filter: "all", query: "", raw: "" });
    expect(parsePaletteQuery("   ")).toEqual({ filter: "all", query: "", raw: "" });
  });

  it("parses collection prefix", () => {
    expect(parsePaletteQuery("c posts")).toEqual({
      filter: "collection",
      query: "posts",
      raw: "c posts",
    });
  });

  it("parses action prefix with >", () => {
    expect(parsePaletteQuery("> invite")).toEqual({
      filter: "action",
      query: "invite",
      raw: "> invite",
    });
  });

  it("parses path filter", () => {
    expect(parsePaletteQuery("/config")).toEqual({
      filter: "path",
      query: "config",
      raw: "/config",
    });
  });

  it("treats plain text as all-filter query", () => {
    expect(parsePaletteQuery("Dashboard")).toEqual({
      filter: "all",
      query: "dashboard",
      raw: "Dashboard",
    });
  });
});

describe("scoreEntry", () => {
  const dashboard: CommandPaletteEntry = {
    id: "page:dashboard",
    category: "page",
    title: "Dashboard",
    description: "System overview",
    keywords: ["home", "metrics"],
    icon: "mdi:view-dashboard",
    path: "/dashboard",
    contextBoost: ["/dashboard"],
    weight: 20,
  };

  it("scores exact title highest", () => {
    const exact = scoreEntry(dashboard, "dashboard");
    const partial = scoreEntry(dashboard, "dash");
    expect(exact).toBeGreaterThan(partial);
    expect(exact).toBeGreaterThan(50);
  });

  it("applies context boost on matching path", () => {
    const boosted = scoreEntry(dashboard, "", { pathname: "/dashboard" });
    const plain = scoreEntry(dashboard, "", { pathname: "/user" });
    expect(boosted).toBeGreaterThan(plain);
  });

  it("filters by category", () => {
    expect(scoreEntry(dashboard, "dash", { filter: "action" })).toBe(0);
    expect(scoreEntry(dashboard, "dash", { filter: "page" })).toBeGreaterThan(0);
  });
});

describe("flattenToRankedItems", () => {
  const media: CommandPaletteEntry = {
    id: "page:media",
    category: "page",
    title: "Media Gallery",
    description: "DAM",
    keywords: ["media"],
    icon: "mdi:image",
    path: "/mediagallery",
    triggers: {
      "Go to Media": { path: "/mediagallery" },
      Batch: { path: "/mediagallery?mode=batch" },
    },
  };

  it("expands multi-trigger entries into multiple rows", () => {
    const ranked = flattenToRankedItems([media], "media", { limit: 10 });
    expect(ranked.length).toBeGreaterThanOrEqual(2);
    expect(ranked.some((r) => r.triggerKey === "Batch")).toBe(true);
  });
});

describe("recents", () => {
  const key = recentsStorageKey("t1", "u1");

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("scopes storage key by tenant and user", () => {
    expect(recentsStorageKey("a", "b")).toContain("a");
    expect(recentsStorageKey("a", "b")).toContain("b");
  });

  it("pushes and loads recents with dedupe", () => {
    pushRecent(key, { id: "1", path: "/a", title: "A" });
    pushRecent(key, { id: "2", path: "/b", title: "B" });
    pushRecent(key, { id: "1", path: "/a", title: "A updated" });
    const list = loadRecents(key);
    expect(list[0]?.title).toBe("A updated");
    expect(list.filter((r) => r.path === "/a")).toHaveLength(1);
    expect(list).toHaveLength(2);
  });
});

describe("collectionsToEntries", () => {
  it("maps collection nodes to palette entries", () => {
    const nodes = [
      {
        _id: "1" as ContentNode["_id"],
        name: "posts",
        nodeType: "collection",
        order: 0,
        createdAt: "" as ContentNode["createdAt"],
        updatedAt: "" as ContentNode["updatedAt"],
        translations: [{ languageTag: "en", translationName: "Posts", isDefault: true }],
        path: "/en/posts",
        icon: "mdi:post",
      },
    ] as ContentNode[];

    const entries = collectionsToEntries(nodes, "en");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.title).toBe("Posts");
    expect(entries[0]?.category).toBe("collection");
    expect(entries[0]?.path).toBe("/en/posts");
  });
});

describe("staticDefsToEntries", () => {
  it("resolves titles via callback", () => {
    const entries = staticDefsToEntries((key, fb) =>
      key.includes("dashboard") ? "Übersicht" : fb,
    );
    const dash = entries.find((e) => e.id === "page:dashboard");
    expect(dash?.title).toBe("Übersicht");
  });

  it("keeps EN matchability when display locale is DE", () => {
    const entries = staticDefsToEntries(
      (key, fb) => {
        if (key === "global_search_profile_title") return "Benutzerprofil";
        if (key === "global_search_profile_description") {
          return "Konto, Avatar, Passwort, 2FA und Sitzungen.";
        }
        return fb;
      },
      {
        resolveAll: (key, fb) => {
          if (key === "global_search_profile_title") {
            return ["User Profile", "Benutzerprofil", "उपयोगकर्ता प्रोफ़ाइल"];
          }
          if (key === "global_search_profile_description") {
            return [
              "Account settings, avatar, password, 2FA, and sessions.",
              "Konto, Avatar, Passwort, 2FA und Sitzungen.",
            ];
          }
          return [fb];
        },
      },
    );

    const profile = entries.find((e) => e.id === "page:user");
    expect(profile).toBeDefined();
    // Localized display
    expect(profile!.title).toBe("Benutzerprofil");
    // EN keyword still scores (DE/HI users typing English)
    expect(scoreEntry(profile!, "user")).toBeGreaterThan(0);
    // EN title phrase still scores via matchTerms
    expect(scoreEntry(profile!, "profile")).toBeGreaterThan(0);
    // DE localized term
    expect(scoreEntry(profile!, "benutzer")).toBeGreaterThan(0);
    // HI harvested term
    expect(scoreEntry(profile!, "उपयोगकर्ता")).toBeGreaterThan(0);
    // Path always works
    expect(scoreEntry(profile!, "user")).toBeGreaterThan(scoreEntry(profile!, "zzzz-no-match"));
  });

  it("always includes titleFallback EN in matchTerms without resolveAll", () => {
    const entries = staticDefsToEntries((key, fb) =>
      key.includes("profile_title") ? "Benutzerprofil" : fb,
    );
    const profile = entries.find((e) => e.id === "page:user");
    expect(profile!.title).toBe("Benutzerprofil");
    // EN fallback still in bag
    expect(scoreEntry(profile!, "user")).toBeGreaterThan(0);
    expect(profile!.matchTerms?.some((t) => t.includes("user") || t.includes("profile"))).toBe(
      true,
    );
  });
});

describe("tokenizeForSearch / buildMatchTerms", () => {
  it("tokenizes unicode scripts", () => {
    expect(tokenizeForSearch("Benutzerprofil")).toContain("benutzerprofil");
    expect(tokenizeForSearch("User Profile")).toEqual(expect.arrayContaining(["user", "profile"]));
  });

  it("merges EN keywords and DE titles so both match", () => {
    const terms = buildMatchTerms({
      titleVariants: ["User Profile", "Benutzerprofil"],
      keywords: ["user", "profile"],
      path: "/user",
    });
    expect(terms).toEqual(expect.arrayContaining(["user", "profile", "benutzerprofil"]));
    // path segment
    expect(terms.some((t) => t.includes("user"))).toBe(true);
  });
});

describe("scoreEntry multi-locale", () => {
  it("matches EN query against DE display title via matchTerms", () => {
    const entry: CommandPaletteEntry = {
      id: "page:user",
      category: "page",
      title: "Benutzerprofil",
      description: "Konto und Sitzungen",
      keywords: ["user", "profile", "account"],
      matchTerms: buildMatchTerms({
        titleVariants: ["User Profile", "Benutzerprofil"],
        descriptionVariants: ["Account settings, avatar, password", "Konto, Avatar, Passwort"],
        keywords: ["user", "profile", "account"],
        path: "/user",
      }),
      icon: "mdi:account",
      path: "/user",
      weight: 12,
    };

    expect(scoreEntry(entry, "user")).toBeGreaterThan(40);
    expect(scoreEntry(entry, "benutzer")).toBeGreaterThan(0);
    expect(scoreEntry(entry, "account")).toBeGreaterThan(0);
  });
});
