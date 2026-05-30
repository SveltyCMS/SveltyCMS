/**
 * @file tests/benchmarks/modules/benchmark-cross-correlate.ts
 * @description Cross-test correlation for single-test runs.
 *
 * When a single benchmark regresses, this module checks history.sqlite
 * for related tests (from benchmark-scripts.ts correlatedWith/antiCorrelatedWith)
 * and determines if the pattern is isolated or systemic.
 *
 * This bridges the gap between single-test "suspected" and matrix "confirmed".
 */
import { loadHistory } from "./benchmark-history";

// ─────────────────────────────────────────────────────────────
// Correlation result
// ─────────────────────────────────────────────────────────────

export interface CrossCorrelationResult {
  /** Can we confirm the regression pattern? */
  isConfirmed: boolean;
  /** Related tests that also degraded (positive correlation) */
  correlatedDegradations: string[];
  /** Related tests that stayed stable (negative correlation) */
  correlatedStable: string[];
  /** What the pattern suggests */
  pattern: "isolated" | "systemic" | "adapter_specific" | "unknown";
  /** Human-readable explanation */
  explanation: string;
}

// ─────────────────────────────────────────────────────────────
// Correlation rules (mirrors benchmark-scripts.ts metadata)
// ─────────────────────────────────────────────────────────────

const CORRELATION_MAP: Record<string, { with: string[]; anti: string[] }> = {
  "hooks-performance": {
    with: ["rest-api-performance", "auth-performance"],
    anti: ["database-performance"],
  },
  "auth-performance": {
    with: ["hooks-performance", "rest-api-performance"],
    anti: [],
  },
  "rest-api-performance": {
    with: ["hooks-performance", "auth-performance"],
    anti: ["database-performance"],
  },
  "database-performance": {
    with: ["index-pressure", "graphql-api-performance"],
    anti: ["hooks-performance"],
  },
  "graphql-api-performance": {
    with: ["rest-api-performance"],
    anti: [],
  },
  "index-pressure": {
    with: ["mixed-workload", "database-performance"],
    anti: ["hooks-performance"],
  },
  "mixed-workload": {
    with: ["index-pressure", "rest-api-performance", "graphql-api-performance"],
    anti: [],
  },
  "memory-stability": {
    with: ["media-performance"],
    anti: ["hooks-performance", "database-performance"],
  },
  "media-performance": {
    with: ["memory-stability"],
    anti: [],
  },
};

// ─────────────────────────────────────────────────────────────
// Analysis
// ─────────────────────────────────────────────────────────────

/**
 * Check if related tests in history.sqlite show the same degradation pattern.
 * Called after a single test regresses.
 */
export function crossCorrelate(
  testId: string,
  dbType: string,
  deltaPct: number,
): CrossCorrelationResult {
  if (Math.abs(deltaPct) < 5) {
    return {
      isConfirmed: false,
      correlatedDegradations: [],
      correlatedStable: [],
      pattern: "unknown",
      explanation: "Delta too small for correlation analysis.",
    };
  }

  const rule = CORRELATION_MAP[testId];
  if (!rule) {
    return {
      isConfirmed: false,
      correlatedDegradations: [],
      correlatedStable: [],
      pattern: "unknown",
      explanation: "No correlation rules defined for this test.",
    };
  }

  const correlatedDegradations: string[] = [];
  const correlatedStable: string[] = [];

  // Check positively correlated tests
  for (const relatedId of rule.with) {
    const history = loadHistory(relatedId, dbType, false, "warm", 5);
    if (history.length < 2) continue;

    const recent = history[0];
    const prev = history.slice(1);
    const med = (arr: number[]) => {
      const s = [...arr].sort((a, b) => a - b);
      return s.length > 0 ? s[Math.floor(s.length / 2)] : 0;
    };
    const baseline = med(prev.map((h) => h.avgMs));
    if (baseline <= 0) continue;

    const relatedDelta = ((recent.avgMs - baseline) / baseline) * 100;

    if (relatedDelta > 5) {
      correlatedDegradations.push(relatedId);
    } else {
      correlatedStable.push(relatedId);
    }
  }

  // Check anti-correlated tests (should NOT be affected)
  for (const relatedId of rule.anti) {
    const history = loadHistory(relatedId, dbType, false, "warm", 5);
    if (history.length < 2) continue;

    const recent = history[0];
    const prev = history.slice(1);
    const med = (arr: number[]) => {
      const s = [...arr].sort((a, b) => a - b);
      return s.length > 0 ? s[Math.floor(s.length / 2)] : 0;
    };
    const baseline = med(prev.map((h) => h.avgMs));
    if (baseline <= 0) continue;

    const relatedDelta = ((recent.avgMs - baseline) / baseline) * 100;

    if (Math.abs(relatedDelta) < 5) {
      correlatedStable.push(relatedId);
    }
  }

  // Classify pattern
  let pattern: CrossCorrelationResult["pattern"] = "unknown";
  let explanation = "";

  if (correlatedDegradations.length > 0 && correlatedStable.length > 0) {
    pattern = "systemic";
    explanation = `Systemic issue — ${correlatedDegradations.join(", ")} also degraded, but ${correlatedStable.join(", ")} stayed stable. Likely shared middleware or logic path affected.`;
  } else if (correlatedDegradations.length > 0) {
    pattern = "systemic";
    explanation = `Systemic issue — all correlated tests (${correlatedDegradations.join(", ")}) degraded together. Likely shared infrastructure or adapter problem.`;
  } else if (correlatedStable.length > 0) {
    pattern = "adapter_specific";
    explanation = `Isolated to adapter — anti-correlated tests (${correlatedStable.join(", ")}) stayed stable. Check adapter-specific code paths.`;
  } else {
    pattern = "isolated";
    explanation =
      "Isolated regression — no correlated tests showed the same pattern. May be test-specific or noise.";
  }

  const isConfirmed = correlatedDegradations.length > 0;

  return {
    isConfirmed,
    correlatedDegradations,
    correlatedStable,
    pattern,
    explanation,
  };
}
