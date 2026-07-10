/**
 * @file tests/unit/services/identity-matching.test.ts
 * @description Unit tests for identity matching logic used during config
 * synchronization. When importing configuration entities, we need to match
 * source items to existing target items using a deterministic, auditable
 * identity resolution strategy.
 *
 * ### Identity Resolution Priority:
 * 1. `syncId` — explicit synchronization identifier (highest priority)
 * 2. External source ID — e.g., `externalId`, `sourceId`
 * 3. Declared natural key — collection-specific unique key
 * 4. (EXCLUDED) Case-insensitive name matching — NOT used
 * 5. (EXCLUDED) Filenames — NEVER used as identity
 *
 * ### Fail-Safe Rules:
 * - Ambiguous matches (two records with same natural key) → fail closed
 * - Missing identity field → no match (returns null)
 */

import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A source or target configuration entity */
interface IdentityRecord {
  id: string;
  syncId?: string;
  externalId?: string;
  sourceId?: string;
  name?: string;
  type: string;
  naturalKey?: string;
  [key: string]: unknown;
}

/** Result of an identity match attempt */
interface MatchResult {
  matched: IdentityRecord | null;
  strategy: MatchStrategy;
  confidence: "definitive" | "none";
}

type MatchStrategy = "syncId" | "externalSourceId" | "naturalKey" | "none";

// ---------------------------------------------------------------------------
// Identity matcher — mirrors the resolution logic
// ---------------------------------------------------------------------------

/**
 * Resolves identity for a source record against a pool of target records.
 *
 * Priority:
 * 1. syncId match (exact)
 * 2. external source ID match (externalId or sourceId)
 * 3. natural key — the item's declared unique key
 *
 * Explicitly excluded:
 * - Case-insensitive name matching
 * - Filename-based matching
 * - Fuzzy/heuristic matching
 */
function matchIdentity(source: IdentityRecord, targetPool: IdentityRecord[]): MatchResult {
  // ── Strategy 1: syncId (highest priority) ────────────────────────────
  if (source.syncId) {
    const match = targetPool.find((t) => t.syncId === source.syncId);
    if (match) {
      return { matched: match, strategy: "syncId", confidence: "definitive" };
    }
  }

  // ── Strategy 2: External source ID ────────────────────────────────────
  if (source.externalId || source.sourceId) {
    const searchId = (source.externalId || source.sourceId)!;
    const matches = targetPool.filter((t) => t.externalId === searchId || t.sourceId === searchId);
    if (matches.length === 1) {
      return {
        matched: matches[0],
        strategy: "externalSourceId",
        confidence: "definitive",
      };
    }
    // Ambiguous: fail closed
    if (matches.length > 1) {
      return { matched: null, strategy: "none", confidence: "none" };
    }
  }

  // ── Strategy 3: Natural key ──────────────────────────────────────────
  if (source.naturalKey) {
    const matches = targetPool.filter((t) => t.naturalKey === source.naturalKey);
    if (matches.length === 1) {
      return {
        matched: matches[0],
        strategy: "naturalKey",
        confidence: "definitive",
      };
    }
    // Ambiguous natural key → fail closed
    if (matches.length > 1) {
      return { matched: null, strategy: "none", confidence: "none" };
    }
  }

  // ── No match found ────────────────────────────────────────────────────
  return { matched: null, strategy: "none", confidence: "none" };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTarget(overrides: Partial<IdentityRecord> = {}): IdentityRecord {
  return {
    id: overrides.id ?? `target-${Math.random().toString(36).slice(2, 7)}`,
    type: overrides.type ?? "collection",
    name: overrides.name ?? "DefaultName",
    ...overrides,
  };
}

function makeSource(overrides: Partial<IdentityRecord> = {}): IdentityRecord {
  return {
    id: overrides.id ?? `source-${Math.random().toString(36).slice(2, 7)}`,
    type: overrides.type ?? "collection",
    name: overrides.name ?? "DefaultSource",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Identity Matching", () => {
  // ── syncId matching ───────────────────────────────────────────────────

  describe("syncId (highest priority)", () => {
    it("matches by syncId first when present on source", () => {
      const source = makeSource({ syncId: "sync-abc" });
      const pool = [
        makeTarget({ id: "t1", syncId: "sync-abc", name: "Matched" }),
        makeTarget({ id: "t2", syncId: "sync-xyz", name: "Other" }),
      ];

      const result = matchIdentity(source, pool);

      expect(result.matched).not.toBeNull();
      expect(result.matched!.id).toBe("t1");
      expect(result.strategy).toBe("syncId");
    });

    it("prefers syncId over externalId when both are present", () => {
      const source = makeSource({
        syncId: "sync-123",
        externalId: "ext-456",
      });
      const pool = [
        makeTarget({ id: "t1", syncId: "sync-123", name: "SyncMatch" }),
        makeTarget({ id: "t2", externalId: "ext-456", name: "ExtMatch" }),
      ];

      const result = matchIdentity(source, pool);

      // Should match by syncId, NOT by externalId
      expect(result.matched!.id).toBe("t1");
      expect(result.strategy).toBe("syncId");
    });

    it("falls through if syncId does not match any target", () => {
      const source = makeSource({ syncId: "sync-nonexistent", externalId: "ext-real" });
      const pool = [makeTarget({ id: "t1", externalId: "ext-real", name: "FallbackMatch" })];

      const result = matchIdentity(source, pool);

      expect(result.matched).not.toBeNull();
      expect(result.matched!.id).toBe("t1");
      expect(result.strategy).toBe("externalSourceId"); // fell through
    });
  });

  // ── External source ID matching ───────────────────────────────────────

  describe("external source ID (fallback when no syncId)", () => {
    it("matches by externalId when syncId is absent", () => {
      const source = makeSource({ externalId: "ext-789" });
      const pool = [makeTarget({ id: "t1", externalId: "ext-789", name: "ExtMatch" })];

      const result = matchIdentity(source, pool);

      expect(result.matched).not.toBeNull();
      expect(result.strategy).toBe("externalSourceId");
    });

    it("matches by sourceId when syncId is absent", () => {
      const source = makeSource({ sourceId: "src-101" });
      const pool = [makeTarget({ id: "t1", sourceId: "src-101", name: "SrcMatch" })];

      const result = matchIdentity(source, pool);

      expect(result.matched).not.toBeNull();
      expect(result.strategy).toBe("externalSourceId");
    });

    it("matches source.externalId against target.sourceId (cross-field)", () => {
      const source = makeSource({ externalId: "cross-id" });
      const pool = [makeTarget({ id: "t1", sourceId: "cross-id" })];

      const result = matchIdentity(source, pool);

      expect(result.matched).not.toBeNull();
      expect(result.strategy).toBe("externalSourceId");
    });

    it("fails closed on ambiguous external ID (two matches)", () => {
      const source = makeSource({ externalId: "duplicate-ext" });
      const pool = [
        makeTarget({ id: "t1", externalId: "duplicate-ext" }),
        makeTarget({ id: "t2", externalId: "duplicate-ext" }),
      ];

      const result = matchIdentity(source, pool);

      expect(result.matched).toBeNull();
      expect(result.confidence).toBe("none");
    });
  });

  // ── Natural key matching ──────────────────────────────────────────────

  describe("natural key (fallback when no IDs match)", () => {
    it("matches by declared natural key when no syncId or external IDs", () => {
      const source = makeSource({ naturalKey: "blog-collection" });
      const pool = [makeTarget({ id: "t1", naturalKey: "blog-collection", name: "Blog" })];

      const result = matchIdentity(source, pool);

      expect(result.matched).not.toBeNull();
      expect(result.matched!.id).toBe("t1");
      expect(result.strategy).toBe("naturalKey");
    });

    it("fails closed on ambiguous natural keys", () => {
      const source = makeSource({ naturalKey: "duplicate-key" });
      const pool = [
        makeTarget({ id: "t1", naturalKey: "duplicate-key" }),
        makeTarget({ id: "t2", naturalKey: "duplicate-key" }),
      ];

      const result = matchIdentity(source, pool);

      expect(result.matched).toBeNull();
      expect(result.strategy).toBe("none");
    });

    it("does not match when natural key differs", () => {
      const source = makeSource({ naturalKey: "key-source" });
      const pool = [makeTarget({ id: "t1", naturalKey: "key-different" })];

      const result = matchIdentity(source, pool);

      expect(result.matched).toBeNull();
    });
  });

  // ── Case-insensitive name matching is NOT used ───────────────────────

  describe("name matching (EXCLUDED)", () => {
    it("does NOT match by case-insensitive name", () => {
      const source = makeSource({ name: "BlogCollection" });
      const pool = [makeTarget({ id: "t1", name: "blogcollection" })];

      const result = matchIdentity(source, pool);

      // Name matching is intentionally excluded — no match should be found
      expect(result.matched).toBeNull();
      expect(result.strategy).toBe("none");
    });

    it("does NOT match by exact name either", () => {
      const source = makeSource({ name: "BlogCollection" });
      const pool = [makeTarget({ id: "t1", name: "BlogCollection" })];

      const result = matchIdentity(source, pool);

      // Name is not an identity resolution strategy
      expect(result.matched).toBeNull();
    });

    it("does NOT match when only the name is shared (no IDs, no natural key)", () => {
      const source = makeSource({ name: "SharedName" });
      const pool = [makeTarget({ id: "t1", name: "SharedName" })];

      const result = matchIdentity(source, pool);

      expect(result.matched).toBeNull();
    });
  });

  // ── Filename exclusion ────────────────────────────────────────────────

  describe("filenames (EXCLUDED)", () => {
    it("does NOT use filename as identity", () => {
      const source: IdentityRecord = {
        ...makeSource({ name: "foo" }),
        filename: "blog-collection.ts",
      };
      const pool: IdentityRecord[] = [
        {
          ...makeTarget({ id: "t1", name: "foo" }),
          filename: "blog-collection.ts",
        },
      ];

      const result = matchIdentity(source, pool);

      // Filename matching is intentionally excluded
      expect(result.matched).toBeNull();
    });

    it("does NOT match even when filename is the only shared field", () => {
      const source: IdentityRecord = {
        ...makeSource({ name: "Alpha" }),
        filename: "config.ts",
      };
      const pool: IdentityRecord[] = [
        {
          ...makeTarget({ id: "t1", name: "Beta" }),
          filename: "config.ts",
        },
      ];

      const result = matchIdentity(source, pool);

      expect(result.matched).toBeNull();
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("returns no match for empty pool", () => {
      const source = makeSource({ syncId: "sync-1" });
      const result = matchIdentity(source, []);

      expect(result.matched).toBeNull();
      expect(result.strategy).toBe("none");
    });

    it("returns no match when source has no identifying fields", () => {
      const source = makeSource({ name: "OnlyName" });
      // Remove all identity fields
      delete source.syncId;
      delete source.externalId;
      delete source.sourceId;
      delete source.naturalKey;

      const pool = [makeTarget({ id: "t1", name: "OnlyName" })];

      const result = matchIdentity(source, pool);

      expect(result.matched).toBeNull();
    });

    it("syncId with exact match works even when other fields differ", () => {
      const source = makeSource({
        syncId: "persistent-id",
        name: "NewName",
        externalId: "changed-ext",
      });
      const pool = [
        makeTarget({
          id: "t1",
          syncId: "persistent-id",
          name: "OldName",
          externalId: "old-ext",
        }),
      ];

      const result = matchIdentity(source, pool);

      expect(result.matched).not.toBeNull();
      expect(result.matched!.id).toBe("t1");
      expect(result.strategy).toBe("syncId");
    });

    it("handles target pool with diverse identity strategies", () => {
      const source = makeSource({ naturalKey: "nk-123" });
      const pool = [
        makeTarget({ id: "t-sync", syncId: "sync-other" }),
        makeTarget({ id: "t-ext", externalId: "ext-other" }),
        makeTarget({ id: "t-nk", naturalKey: "nk-123", name: "NKMatch" }),
        makeTarget({ id: "t-name", name: "NKMatch" }),
      ];

      const result = matchIdentity(source, pool);

      // Should match by natural key, not name
      expect(result.matched!.id).toBe("t-nk");
      expect(result.strategy).toBe("naturalKey");
    });
  });
});
