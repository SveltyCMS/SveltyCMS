/**
 * @file src/utils/rate-limit/adaptive.ts
 * @description Adaptive Throttling: passt die Bucket-Kapazitaet je nach Nutzerprofil an.
 *
 * Ziel: Schutz vor Brute-Force/Bots, ohne legitime Nutzer zu bremsen.
 *
 * Logik:
 * - Ein Basis-Profil (Standard) wird aus der Umgebung gelesen (RATE_LIMIT_*).
 * - Der benannte Nutzer wird einer Tier-Stufe zugeordnet (admin / staff / guest /
 *   anonymous). Admin und Mitarbeiter bekommen eine GROESSERE Kapazitaet
 *   (vertrauenswuerdiger), Gaeste/Anonym eine KLEINERE (Angriffsflaeche).
 * - `tenantId` skaliert zusaetzlich: PaegerTenants/Multi-Tenant lassen mehr Burst
 *   zu, global wird konservativer gehalten. Immer auf >= 1 gedeckelt.
 *
 * Kein PII im Ergebnis — nur eine Kapazitaetszahl.
 */

import type { TokenBucketConfig } from "./token-bucket";

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
  admin: 3,
  staff: 2,
  guest: 1,
  anonymous: 0.5,
};

/**
 * Leitet die Tier-Stufe aus Context ab. Reihenfolge: explizite Rolle →
 * isAdmin-Flag → userId vorhanden (staff) → Gast/Anonym (userId fehlt).
 */
export function resolveUserTier(ctx: AdaptiveContext): UserTier {
  const role = ctx.role?.toLowerCase() ?? "";
  if (role === "admin" || ctx.isAdmin === true) return "admin";
  if (role === "staff" || role === "editor" || role === "moderator") return "staff";
  if (ctx.userId) return "guest";
  return "anonymous";
}

/**
 * Skalierungsfaktor fuer den Tenant.
 * - Multi-Tenant-Kennungen (nicht "global") duerfen mehr Burst (Isolation).
 * - "global"/default bleibt konservativ (groesste gemeinsame Nutzerbasis).
 */
function tenantScale(tenantId: string | null | undefined): number {
  if (!tenantId || tenantId === "global" || tenantId === "default") return 1;
  return 1.5;
}

/**
 * Berechnet die effektive (adaptive) Bucket-Konfiguration fuer einen Request.
 * Kapazitaet = base.capacity * tierMultiplier * tenantScale, auf >= 1 geklemmt.
 * Die Refill-Rate skaliert proportional zur Kapazitaet, damit die "Zeit bis
 * zum vollen Bucket" konstant bleibt (kein Admin-Lemming-Spam, aber auch kein
 * Gast-Nachteil bei der Erholung).
 */
export function computeAdaptiveBucket(
  base: BaseRateLimitConfig,
  ctx: AdaptiveContext,
): TokenBucketConfig {
  const tier = resolveUserTier(ctx);
  const capacity = Math.max(
    1,
    Math.round(base.capacity * TIER_MULTIPLIER[tier] * tenantScale(ctx.tenantId)),
  );
  // Refill skaliert mit, damit die Erholungszeit (capacity/refill) stabil bleibt.
  const refillPerSecond = Math.max(0.001, (capacity / base.capacity) * base.refillPerSecond);
  return { capacity, refillPerSecond };
}

/**
 * Die effektive Tier fuer Debug/Log-Zwecke (ohne den Zustand selbst zu teilen).
 */
export function describeTier(ctx: AdaptiveContext): string {
  return resolveUserTier(ctx);
}
