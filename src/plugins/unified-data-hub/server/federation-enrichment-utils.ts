/**
 * @file src/plugins/unified-data-hub/server/federation-enrichment-utils.ts
 * @description Validation helpers for native collection federationEnrichments config.
 *
 * Features:
 * - Field/slug existence checks for Collection Builder picker
 * - Dedup by nativeField + virtualSlug pair
 */

import type { FederationEnrichment } from "@src/content/types";

export function enrichmentKey(e: FederationEnrichment): string {
  return `${e.nativeField}::${e.virtualSlug}`;
}

export function normalizeFederationEnrichments(
  items: FederationEnrichment[] | undefined,
): FederationEnrichment[] {
  if (!items?.length) return [];
  const seen = new Set<string>();
  const normalized: FederationEnrichment[] = [];

  for (const item of items) {
    const label = String(item.label ?? "").trim();
    const nativeField = String(item.nativeField ?? "").trim();
    const virtualSlug = String(item.virtualSlug ?? "").trim();
    if (!label || !nativeField || !virtualSlug) continue;

    const entry: FederationEnrichment = {
      label,
      nativeField,
      virtualSlug,
      virtualKeyField: item.virtualKeyField?.trim() || "id",
      displayFields: item.displayFields?.map((f) => f.trim()).filter(Boolean),
    };

    const key = enrichmentKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(entry);
  }

  return normalized;
}

export function validateFederationEnrichment(
  item: FederationEnrichment,
  nativeFields: string[],
  virtualSlugs: string[],
): string | null {
  if (!item.label?.trim()) return "Label is required";
  if (!item.nativeField?.trim()) return "Native field is required";
  if (!nativeFields.includes(item.nativeField)) {
    return `Native field '${item.nativeField}' is not defined on this collection`;
  }
  if (!item.virtualSlug?.trim()) return "Virtual collection is required";
  if (virtualSlugs.length > 0 && !virtualSlugs.includes(item.virtualSlug)) {
    return `Virtual collection '${item.virtualSlug}' was not found`;
  }
  return null;
}
