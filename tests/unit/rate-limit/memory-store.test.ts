/**
 * @file tests/unit/rate-limit/memory-store.test.ts
 * @description Vertrags-Tests fuer den In-Memory-Token-Bucket-Store:
 * Konsum-/Refill-Semantik, dump/restore-Roundtrip, Praefix-Dump sowie die
 * gedrosselte LRU-Positions-Auffrischung (LRU_REFRESH_EVERY = 16).
 */

import { describe, expect, it } from "vitest";
import { MemoryRateLimitStore } from "@utils/rate-limit/memory-store";
import type { TokenBucketConfig, TokenBucketState } from "@utils/rate-limit/token-bucket";

const CFG: TokenBucketConfig = { capacity: 10, refillPerSecond: 1 };

describe("MemoryRateLimitStore — checkAndConsume", () => {
  it("konsumiert vom vollen Bucket und liefert die Ergebnisform", () => {
    const store = new MemoryRateLimitStore();
    const res = store.checkAndConsume("k", CFG);
    expect(res.allowed).toBe(true);
    expect(res.tokens).toBe(9);
    expect(res.retryAfterSeconds).toBe(0);
  });

  it("verweigert ab Kapazitaetsueberschreitung ohne Zustandsaenderung", () => {
    const store = new MemoryRateLimitStore();
    const one: TokenBucketConfig = { capacity: 1, refillPerSecond: 1 };
    expect(store.checkAndConsume("k", one).allowed).toBe(true);
    const denied = store.checkAndConsume("k", one);
    expect(denied.allowed).toBe(false);
    expect(denied.tokens).toBe(0);
    expect(denied.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("laesst nach Refill wieder durch (kontrolliert via restore)", () => {
    const store = new MemoryRateLimitStore();
    const fast: TokenBucketConfig = { capacity: 1, refillPerSecond: 2 };
    // 1s zurueckliegender leerer Zustand → +2 Tokens → wieder erlaubt.
    store.restore({ k: { tokens: 0, lastRefillMs: Date.now() - 1000 } });
    expect(store.checkAndConsume("k", fast).allowed).toBe(true);
  });

  it("overdraft bucht trotz Ablehnung ab (WAF-Paritaet)", () => {
    const store = new MemoryRateLimitStore();
    const one: TokenBucketConfig = { capacity: 1, refillPerSecond: 1 };
    expect(store.checkAndConsume("k", one).allowed).toBe(true);
    const denied = store.checkAndConsume("k", one, 1, true);
    expect(denied.allowed).toBe(false);
    expect(denied.tokens).toBe(-1);
  });
});

describe("MemoryRateLimitStore — Verwaltung", () => {
  it("trackt size und setzt reset() alles zurueck", () => {
    const store = new MemoryRateLimitStore();
    store.checkAndConsume("a", CFG);
    store.checkAndConsume("b", CFG);
    expect(store.size()).toBe(2);
    store.reset();
    expect(store.size()).toBe(0);
  });

  it("dump/restore-Roundtrip erhaelt den Bucket-Zustand", () => {
    const store = new MemoryRateLimitStore();
    store.checkAndConsume("a", CFG);
    store.checkAndConsume("b", CFG);
    const dump = store.dump();
    expect(Object.keys(dump).sort()).toEqual(["a", "b"]);

    const store2 = new MemoryRateLimitStore();
    store2.restore(dump);
    expect(store2.size()).toBe(2);
    // Zustand fortgefuehrt: "a" wurde einmal konsumiert → 9 Tokens.
    expect(store2.dump()["a"]!.tokens).toBe(9);
  });

  it("dumpWithPrefix filtert nach Key-Praefix", () => {
    const store = new MemoryRateLimitStore();
    store.checkAndConsume("waf:x", CFG);
    store.checkAndConsume("api:y", CFG);
    expect(Object.keys(store.dumpWithPrefix("waf:"))).toEqual(["waf:x"]);
    expect(store.dumpWithPrefix("api:")["api:y"]).toBeDefined();
  });

  it("restore ignoriert ungueltige Zustaende", () => {
    const store = new MemoryRateLimitStore();
    const bad = { tokens: "x", lastRefillMs: 1 } as unknown as Record<string, TokenBucketState>;
    store.restore(bad);
    expect(store.size()).toBe(0);
  });
});

describe("MemoryRateLimitStore — gedrosselter LRU-Refresh", () => {
  it("frischt die Insertion-Position erst nach 16 Touches auf", () => {
    const big: TokenBucketConfig = { capacity: 1000, refillPerSecond: 0 };
    const store = new MemoryRateLimitStore();
    store.checkAndConsume("a", big); // Insertion #1 (Touch-Zaehler = 1)
    store.checkAndConsume("b", big); // Insertion #2

    // 14 weitere Touches → Zaehler = 15: noch KEIN Re-Insert, "a" bleibt aeltester Key.
    for (let i = 0; i < 14; i++) store.checkAndConsume("a", big);
    expect(Object.keys(store.dump())[0]).toBe("a");

    // 16. Touch → Re-Insert: "a" wandert ans Ende der Insertion-Reihenfolge.
    store.checkAndConsume("a", big);
    expect(Object.keys(store.dump())).toEqual(["b", "a"]);
  });
});
