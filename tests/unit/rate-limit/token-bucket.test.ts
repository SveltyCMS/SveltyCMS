/**
 * @file tests/unit/rate-limit/token-bucket.test.ts
 * @description Unit-Tests für den puren Token-Bucket-Algorithmus.
 * Deterministisch — keine Redis-/Netz-/Zeit-Mocks, feste nowMs-Parameter.
 */
import { describe, expect, it } from "vitest";
import {
  createBucket,
  refillBucket,
  consumeToken,
  type TokenBucketConfig,
} from "@utils/rate-limit/token-bucket";

const BASE: TokenBucketConfig = { capacity: 10, refillPerSecond: 1 };
const T0 = 1_000_000_000; // feste Uhrzeit in ms

describe("createBucket", () => {
  it("startet voll (Burst = capacity)", () => {
    const bucket = createBucket(BASE, T0);
    expect(bucket.tokens).toBe(10);
    expect(bucket.lastRefillMs).toBe(T0);
  });
});

describe("refillBucket", () => {
  it("fuellt proportional zur verstrichenen Zeit auf", () => {
    const bucket = createBucket(BASE, T0);
    // 3 Sekunden später, capacity 10, refill 1/s → wieder voll (war schon voll)
    const refilled = refillBucket(bucket, T0 + 3000, BASE);
    expect(refilled.tokens).toBe(10);
  });

  it("deckelt auf capacity (kein Ueberlauf)", () => {
    const bucket: TokenBucketConfig = { capacity: 5, refillPerSecond: 2 };
    const start = createBucket(bucket, T0);
    const refilled = refillBucket(start, T0 + 10_000, bucket); // 10s × 2/s = 20
    expect(refilled.tokens).toBe(5);
  });

  it("refillt nach Teilverbrauch korrekt nach", () => {
    const start = createBucket(BASE, T0);
    // Verbrauche 4 → 6 übrig
    const after = consumeToken(start, T0, BASE);
    expect(after.tokens).toBe(9); // 1 verbraucht
    // 2s später → +2 → wieder voll (10)
    const refilled = refillBucket(after.state, T0 + 2000, BASE);
    expect(refilled.tokens).toBe(10);
  });
});

describe("consumeToken", () => {
  it("erlaubt bis zur Kapazitaet", () => {
    const bucket = createBucket({ capacity: 3, refillPerSecond: 1 }, T0);
    expect(consumeToken(bucket, T0, { capacity: 3, refillPerSecond: 1 }).allowed).toBe(true);
    // Verbrauch nacheinander: 3 erlaubt
    const c1 = consumeToken(bucket, T0, { capacity: 3, refillPerSecond: 1 });
    const c2 = consumeToken(c1.state, T0, { capacity: 3, refillPerSecond: 1 });
    const c3 = consumeToken(c2.state, T0, { capacity: 3, refillPerSecond: 1 });
    expect(c1.allowed).toBe(true);
    expect(c2.allowed).toBe(true);
    expect(c3.allowed).toBe(true);
    expect(c3.tokens).toBe(0);

    // 4. sofort → verweigert, Zustand unveraendert (kein Double-Penalty)
    const denied = consumeToken(c3.state, T0, { capacity: 3, refillPerSecond: 1 });
    expect(denied.allowed).toBe(false);
    expect(denied.tokens).toBe(0);
  });

  it("liefert retryAfterSeconds bei Ablehnung", () => {
    const cfg: TokenBucketConfig = { capacity: 1, refillPerSecond: 1 };
    const start = createBucket(cfg, T0);
    const first = consumeToken(start, T0, cfg);
    expect(first.allowed).toBe(true);
    const denied = consumeToken(first.state, T0, cfg);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("laesst nach Refill wieder durch", () => {
    const cfg: TokenBucketConfig = { capacity: 1, refillPerSecond: 2 };
    const start = createBucket(cfg, T0);
    const first = consumeToken(start, T0, cfg);
    const denied = consumeToken(first.state, T0, cfg);
    expect(denied.allowed).toBe(false);
    // Nach 1s → +2 Tokens → wieder erlaubt
    const later = consumeToken(denied.state, T0 + 1000, cfg);
    expect(later.allowed).toBe(true);
  });

  it("laesst Aktualschritt auf verwaistem/leerem Zustand korrekt laufen", () => {
    const cfg: TokenBucketConfig = { capacity: 5, refillPerSecond: 1 };
    // Empty state direkt konstruieren
    const empty = { tokens: 0, lastRefillMs: T0 };
    expect(consumeToken(empty, T0, cfg).allowed).toBe(false);
    // Nach 5s → +5 → erlaubt
    expect(consumeToken(empty, T0 + 5000, cfg).allowed).toBe(true);
  });
});
