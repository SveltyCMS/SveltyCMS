/**
 * @file src/utils/rate-limit/adaptive.ts
 * @description Adaptive Throttling: passt die Bucket-Kapazitaet je nach Nutzerprofil an.
 *
 * Ziel: Schutz vor Brute-Force/Bots, ohne legitime Nutzer zu bremsen.
 *
 * Logik (3 Ebenen, von innen nach aussen):
 * 1. **Tier-Skalierung** — Admin/Staff/Guest/Anonymous bekommt unterschiedliche
 *    Basis-Kapazitaeten (vertrauensbasiert).
 * 2. **System-Druck** — Wenn CPU oder RAM ueber Schwellenwert steigen, werden
 *    Non-Admin-Limits automatisch abgesenkt ("Self-Healing Rate Limiting").
 *    Daten: EWMA ueber 5s-Intervalle via `system-pressure.ts`.
 * 3. **Predictive Throttling** — Ein 24h-Histogramm (15-Min-Slots) erkennt
 *    wiederkehrende Last-Spitzen und aktiviert den Druck-Modus prophylaktisch
 *    (via `request-clock.ts`).
 *
 * Kein PII im Ergebnis — nur Kapazitaetszahlen.
 */

import type { TokenBucketConfig } from "./token-bucket";
import { getPressureScale } from "./system-pressure";
import { getTenantPlanScale } from "./tenant-plan";
import { resolveRoleTier } from "./role-tiers";
import { getPredictedPressure } from "./request-clock";

export type UserTier = "admin" | "staff" | "guest" | "anonymous";

export interface AdaptiveContext {
  /** Tenant-Identitaet (z.B. "global", "acme"); optional. */
  tenantId?: string | null;
  /** Nutzer-Identitaet (z.B. Mongo-_id) oder null bei Gast/Anonym; optional. */
  userId?: string | null;
  /**
   * Optional vorbestimmte Rolle. Wenn gesetzt, gewinnt sie gegen die
   * userId-Heuristik (Auth-Hook liefert bereits die echte Rolle).
   */
  role?: string | null;
  isAdmin?: boolean;
}

/** Basis-Konfiguration, wie sie aus der Umgebung kommt (Default-Werte). */
export interface BaseRateLimitConfig extends TokenBucketConfig {
  /** Maximale Requests pro Fenster (Kompatibilitaet mit bestehendem Hook). */
  maxRequests: number;
  /** Fenster in ms (Kompatibilitaet). */
  windowMs: number;
}

/** Multiplikator je Tier gegenueber der Basis-Kapazitaet. */
const TIER_MULTIPLIER: Record<UserTier, number> = {
  admin: 10,
  staff: 2,
  guest: 2,
  anonymous: 1,
};

/**
 * Resolves tier. Order: admin role / isAdmin → staff-like roles → identified user
 * (guest) → anonymous. `isAdmin` is server-session only (never from a client body).
 */
export function resolveUserTier(ctx: AdaptiveContext): UserTier {
  const fromRbac = resolveRoleTier(ctx.role, ctx.isAdmin);
  if (fromRbac) return fromRbac;
  if (ctx.userId) return "guest";
  return "anonymous";
}

/**
 * Kombiniert System-Druck und Predictive-Throttling-Druck zu einem
 * effektiven Drosselungs-Faktor fuer den gegebenen Tier.
 *
 * Predictive-Druck aktiviert den System-Druck-Pfad prophylaktisch:
 * Wenn der Vorhersage-Druck > 0.75 ist, wird er wie ein mittlerer Last-Zustand
 * behandelt (auch ohne aktuelle CPU-Last).
 *
 * `nowMs`/`slot` werden vom Aufrufer durchgereicht (ein Timestamp pro
 * Request, keine zweite Slot-Berechnung); weggelassen wird wie bisher
 * intern aufgeloest — das Ergebnis ist identisch.
 *
 * Admin-Tier ist immer ausgenommen (Faktor = 1.0).
 */
function computePressureFactor(tier: UserTier, nowMs: number, slot?: number): number {
  if (tier === "admin") return 1.0;

  // Echter System-Druck (EWMA ueber CPU/RAM)
  const hardPressure = getPressureScale(tier);

  // Wenn harter Druck bereits aktiv ist, dominiert er.
  if (hardPressure < 1.0) return hardPressure;

  // Predictive Throttling: Vorhersage-Druck als Proxy fuer kommende Last.
  const predicted = getPredictedPressure(nowMs, slot);
  if (predicted > 0.75) {
    // Prophylaktisch: leichte Drosselung wie im "mittleren Last-Bereich".
    if (tier === "staff") return 0.85;
    if (tier === "guest") return 0.7;
    return 0.55; // anonymous
  }

  return 1.0; // Kein Druck
}

/**
 * Berechnet die effektive (adaptive) Bucket-Konfiguration fuer einen Request.
 *
 * Kapazitaet = base.capacity * tierMultiplier * tenantScale * pressureFactor,
 * auf >= 1 geklemmt.
 *
 * Die Refill-Rate skaliert proportional zur Kapazitaet, damit die "Zeit bis
 * zum vollen Bucket" konstant bleibt (kein Admin-Lemming-Spam, aber auch kein
 * Gast-Nachteil bei der Erholung).
 *
 * `tier`: optional voraufgeloester Tier (der Aufrufer hat ihn im Hot-Path
 * bereits fuer den Velocity-Gate bestimmt); weggelassen wird er hier intern
 * aufgeloest — das Ergebnis ist identisch.
 *
 * `nowMs`/`slot`: optionaler durchgereichter Timestamp bzw. bereits berechneter
 * Request-Clock-Slot (ein `Date.now()` pro Request); weggelassen wird intern
 * aufgeloest — das Ergebnis ist identisch.
 */
export function computeAdaptiveBucket(
  base: BaseRateLimitConfig,
  ctx: AdaptiveContext,
  tier?: UserTier,
  nowMs = Date.now(),
  slot?: number,
): TokenBucketConfig {
  const resolvedTier = tier ?? resolveUserTier(ctx);
  const pressureFactor = computePressureFactor(resolvedTier, nowMs, slot);
  // `capacity`/`refillPerSecond` sind bereits `number` (TokenBucketConfig) —
  // das `Number()`-Rewrap im Hot-Path ist entfallen.
  const baseCapacity = Math.max(1, base.capacity || 1);
  const baseRefill = Math.max(0, base.refillPerSecond || 0);

  const capacity = Math.max(
    1,
    Math.round(
      baseCapacity *
        TIER_MULTIPLIER[resolvedTier] *
        getTenantPlanScale(ctx.tenantId, nowMs) *
        pressureFactor,
    ),
  );
  const refillPerSecond = Math.max(0.001, (capacity / baseCapacity) * baseRefill);
  return { capacity, refillPerSecond };
}
