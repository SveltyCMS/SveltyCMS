/**
 * @file tests/benchmarks/modules/benchmark-dimensions.ts
 * @description Shared dimension mapping for executive rollups and grouped ledger sections.
 */

export type LedgerDimension = "Core" | "API" | "Scale" | "Resilience";

export const LEDGER_DIMENSION_ORDER: LedgerDimension[] = ["Core", "API", "Scale", "Resilience"];

export const SECTION_TO_DIMENSION: Record<string, LedgerDimension> = {
  baseline: "Core",
  internals: "Core",
  adapter: "Core",
  api: "API",
  logic: "API",
  scale: "Scale",
  streaming: "Scale",
  soak: "Scale",
  resilience: "Resilience",
  security: "Resilience",
  governance: "Resilience",
};

export function mapSectionToDimension(section: string): LedgerDimension {
  return SECTION_TO_DIMENSION[section] ?? "Core";
}
