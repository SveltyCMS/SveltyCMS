/**
 * @file src/utils/rate-limit/endpoint-cost.ts
 * @description Cost-Aware Limiting — weist teuren Endpunkten hoehere Token-Kosten zu.
 *
 * Teure Operationen (Bild-Upload, AI-Anfragen, GraphQL, Bulk-Import) konsumieren
 * mehr Tokens aus dem Bucket als ein einfacher GET. So wird Ressourcen-Gerechtigkeit
 * erzwungen, ohne die Bucket-Kapazitaet pauschal zu erhoehen.
 *
 * Features:
 * - Statische Kosten-Tabelle (ENDPOINT_COST_MAP) — kein DB-Lookup im Hot-Path.
 * - Longest-Prefix-Match via Iteration ueber sortierte Eintraege (kurze Liste, O(n)).
 * - Konfigurierbar via RATE_ENDPOINT_COST_JSON Umgebungsvariable (JSON-Override).
 * - Default-Kosten: 1.0 (aequivalent zu bisherigem Verhalten).
 */

import { logger } from "@utils/logger";

// ─── Kosten-Tabelle ───────────────────────────────────────────────────────────

/**
 * Statische Kosten pro Endpunkt-Praefix (in Token-Einheiten).
 * Eintraege werden von laengst nach kuerzest verglichen (Longest-Prefix-Match).
 *
 * Rationale:
 *  - `/api/media/upload`     = 5: I/O-intensiv, Sharp-Verarbeitung, libheif
 *  - `/api/ai`               = 10: externer LLM-Aufruf, Timeout-Risiko, teuer
 *  - `/api/graphql`          = 2: potentiell tiefe Queries
 *  - `/api/content/import`   = 8: Bulk-Schreiboperation (Prefix-Match)
 *  - `/api/migration`        = 8: Datenbank-Migration
 *  - `/api/auth`             = 3: Sicherheitskritisch, Brute-Force-Schutz
 *  - `/api/preview`          = 2: SSR-Rendering-Overhead
 */
const BUILT_IN_COSTS: Array<[string, number]> = [
  ["/api/media/upload", 5],
  ["/api/ai", 10],
  ["/api/graphql", 2],
  ["/api/content/import", 8],
  ["/api/migration", 8],
  ["/api/auth", 3],
  ["/api/preview", 2],
];

/** Sortiert nach Praefix-Laenge absteigend (Longest-Prefix-Match). */
let costEntries: Array<[string, number]> = [...BUILT_IN_COSTS].sort(
  (a, b) => b[0].length - a[0].length,
);

// ─── Optionaler JSON-Override aus Umgebung ────────────────────────────────────

(function applyEnvOverride() {
  const raw = process.env["RATE_ENDPOINT_COST_JSON"];
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as Record<string, number>;
    const overrides: Array<[string, number]> = Object.entries(parsed).map(([k, v]) => [
      k,
      Math.max(1, Number(v)),
    ]);
    // Merge: Override gewinnt gegen Built-in bei gleichem Praefix.
    const mergedMap = new Map<string, number>([...costEntries, ...overrides]);
    costEntries = [...mergedMap.entries()].sort((a, b) => b[0].length - a[0].length);
    logger.debug("[EndpointCost] Env-Override angewendet: %d Eintraege", overrides.length);
  } catch {
    logger.warn("[EndpointCost] RATE_ENDPOINT_COST_JSON ist kein gueltiges JSON — ignoriert.");
  }
})();

// ─── Öffentliche API ─────────────────────────────────────────────────────────

/**
 * Gibt die Token-Kosten fuer den angegebenen Pfad zurueck.
 * Longest-Prefix-Match — der spezifischste Eintrag gewinnt.
 * Default: 1.0 (kein Overhead fuer normale Endpunkte).
 */
export function getEndpointCost(pathname: string): number {
  for (const [prefix, cost] of costEntries) {
    if (
      pathname === prefix ||
      pathname.startsWith(prefix + "/") ||
      pathname.startsWith(prefix + "?")
    ) {
      return cost;
    }
  }
  return 1;
}

/**
 * Gibt alle registrierten Kosten-Eintraege zurueck (fuer Health/Debug).
 */
export function listEndpointCosts(): ReadonlyArray<[string, number]> {
  return costEntries;
}

/**
 * Ueberschreibt einen einzelnen Eintrag zur Laufzeit (fuer Tests).
 * @internal
 */
export function _setEndpointCostForTest(prefix: string, cost: number): void {
  const existing = costEntries.findIndex(([p]) => p === prefix);
  if (existing >= 0) {
    costEntries[existing] = [prefix, cost];
  } else {
    costEntries.push([prefix, cost]);
    costEntries.sort((a, b) => b[0].length - a[0].length);
  }
}

/**
 * Setzt die Kosten-Tabelle auf Built-In-Werte zurueck (fuer Tests).
 * @internal
 */
export function _resetEndpointCosts(): void {
  costEntries = [...BUILT_IN_COSTS].sort((a, b) => b[0].length - a[0].length);
}
