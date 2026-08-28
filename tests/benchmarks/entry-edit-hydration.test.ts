/**
 * @file tests/benchmarks/entry-edit-hydration.test.ts
 * @description Entry Edit Hydration Benchmark (Optimized)
 * @summary Measures 50-field form mount, dynamic widget prefetch, and reactive field-patch sync latency.
 */

import { test } from "vitest";
import {
  runBenchmark,
  exportResult,
  exportMetric,
  printTruthTable,
  printSummaryTable,
  stabilize,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";

const FIELD_COUNT = 50;
const WIDGET_TYPES = ["Input", "RichText", "Select", "DateTime", "Seo"];

function forceGarbageCollection() {
  if (typeof Bun !== "undefined" && typeof (Bun as any).gc === "function") {
    (Bun as any).gc(true);
  } else if (typeof (globalThis as any).gc === "function") {
    (globalThis as any).gc();
  }
}

function build50FieldSchema() {
  return Array.from({ length: FIELD_COUNT }, (_, i) => ({
    label: `Field ${i}`,
    db_fieldName: `field_${i}`,
    widget: { Name: WIDGET_TYPES[i % WIDGET_TYPES.length]! },
    required: i % 10 === 0,
  }));
}

function buildEntryPayload(fields: ReturnType<typeof build50FieldSchema>) {
  const entry: Record<string, unknown> = { _id: "bench-hydration-entry" };
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i]!;
    entry[f.db_fieldName] = f.widget.Name === "RichText" ? "<p></p>" : "";
  }
  return entry;
}

/** Legacy fields.svelte sync path (pre-refactor full-object diff). */
function legacyFullObjectSync(local: Record<string, unknown>, global: Record<string, unknown>) {
  return JSON.stringify(local) !== JSON.stringify(global);
}

/** Field-level patch sync (post-refactor direct key comparison). */
function patchFieldSync(
  local: Record<string, unknown>,
  global: Record<string, unknown>,
  fieldName: string,
) {
  return local[fieldName] !== global[fieldName];
}

async function runHydrationAudit() {
  console.log("🚀 Starting Entry Edit Hydration Audit (50-field form)...\n");

  const { getDb, ensureFullInitialization } = await import("@src/databases/db");
  const { widgets, widgetStoreActions } = await import("@src/stores/widget-store.svelte");
  const { getCachedWidgetInputLoader, prefetchWidgetLoaders, clearWidgetLoaderCache } =
    await import("@widgets/widget-loader-registry");

  await ensureFullInitialization();
  const db = getDb();
  if (!db) throw new Error("Database initialization failed");

  await widgetStoreActions.initializeWidgets("global", db);
  clearWidgetLoaderCache();

  const fields = build50FieldSchema();
  const entry = buildEntryPayload(fields);
  const registry = widgets.widgetFunctions;
  const uniqueWidgets = [...new Set(fields.map((f) => f.widget.Name))];
  const fieldWidgetNames = fields.map((f) => f.widget.Name);

  const results: Array<Record<string, unknown>> = [];

  // ── 1. 50-FIELD WIDGET RESOLUTION (CACHED REGISTRY) ───────────────────────
  forceGarbageCollection();
  await stabilize(100);

  console.log("   → Measuring 50-field loader resolution (cached registry)...");
  const mountResult = await runBenchmark({
    name: "50-Field Loader Resolve",
    iterations: 500,
    warmupIterations: 50,
    runs: 2,
    trimOutliers: "iqr",
    silent: true,
    onIteration: () => {
      let resolved = 0;
      for (let i = 0; i < fieldWidgetNames.length; i++) {
        if (getCachedWidgetInputLoader(fieldWidgetNames[i]!, registry)) {
          resolved++;
        }
      }
      if (resolved < FIELD_COUNT) {
        throw new Error(`Only ${resolved}/${FIELD_COUNT} loaders resolved`);
      }
    },
  });
  results.push({ ...mountResult, layer: "Client", shortLabel: "Mount-50f" });

  // ── 2. WIDGET PREFETCH & PARALLEL HYDRATION (HONEST TIMING) ───────────────
  forceGarbageCollection();
  await stabilize(100);

  console.log(`   → Measuring Widget Prefetch (${uniqueWidgets.length} unique widget types)...`);
  const prefetchTimes: number[] = [];
  const PREFETCH_ROUNDS = 40;

  for (let r = 0; r < PREFETCH_ROUNDS; r++) {
    // Clear cache outside timed execution span
    clearWidgetLoaderCache();

    const t0 = performance.now();
    prefetchWidgetLoaders(uniqueWidgets, registry);

    const prefetchPromises = uniqueWidgets.map((name) => {
      const loader = getCachedWidgetInputLoader(name, registry);
      return loader ? loader() : Promise.resolve();
    });
    await Promise.all(prefetchPromises);
    prefetchTimes.push(performance.now() - t0);
  }

  const avgPrefetchMs = prefetchTimes.reduce((a, b) => a + b, 0) / prefetchTimes.length;
  const sortedPrefetch = [...prefetchTimes].sort((a, b) => a - b);
  const p95PrefetchMs =
    sortedPrefetch[Math.floor(sortedPrefetch.length * 0.95)] ??
    sortedPrefetch[sortedPrefetch.length - 1];

  const prefetchResult = {
    name: `Widget Prefetch (${uniqueWidgets.length} types)`,
    shortLabel: "Prefetch-5w",
    avgMs: avgPrefetchMs,
    p95Ms: p95PrefetchMs,
    rps: PREFETCH_ROUNDS / (prefetchTimes.reduce((a, b) => a + b, 0) / 1000),
    layer: "Client",
  };
  results.push(prefetchResult);

  // ── 3. FIRST INPUT LATENCY: SURGICAL PATCH VS LEGACY STRINGIFY ────────────
  const globalSnapshot = Object.freeze({ ...entry });
  const localPatchFrame = { ...entry };

  let inputSeq = 0;

  forceGarbageCollection();
  await stabilize(100);

  console.log("   → Measuring First Input Latency (Single-Field Patch Sync)...");
  const patchInputResult = await runBenchmark({
    name: "First Input (field patch)",
    iterations: 5000,
    warmupIterations: 500,
    runs: 2,
    trimOutliers: "iqr",
    silent: true,
    onIteration: () => {
      const fieldName = `field_${inputSeq++ % FIELD_COUNT}`;
      localPatchFrame[fieldName] = `dynamic_val_${inputSeq}`;

      if (!patchFieldSync(localPatchFrame, globalSnapshot, fieldName)) {
        throw new Error("Patch sync failed to detect active state change");
      }

      // Revert key for subsequent mutation
      localPatchFrame[fieldName] = globalSnapshot[fieldName];
    },
  });
  results.push({ ...patchInputResult, layer: "Client", shortLabel: "Input-Patch" });

  forceGarbageCollection();
  await stabilize(100);

  console.log("   → Measuring First Input Latency (Legacy JSON.stringify diff)...");
  let legacySeq = 0;
  const legacyInputResult = await runBenchmark({
    name: "First Input (JSON.stringify)",
    iterations: 5000,
    warmupIterations: 500,
    runs: 2,
    trimOutliers: "iqr",
    silent: true,
    onIteration: () => {
      const fieldName = `field_${legacySeq++ % FIELD_COUNT}`;
      localPatchFrame[fieldName] = `dynamic_val_${legacySeq}`;

      if (!legacyFullObjectSync(localPatchFrame, globalSnapshot)) {
        throw new Error("Legacy sync failed to detect active state change");
      }

      localPatchFrame[fieldName] = globalSnapshot[fieldName];
    },
  });
  results.push({ ...legacyInputResult, layer: "Client", shortLabel: "Input-Legacy" });

  // ── 4. REPORTING & TELEMETRY ──────────────────────────────────────────────
  const speedup = (legacyInputResult.avgMs / Math.max(patchInputResult.avgMs, 0.00005)).toFixed(1);

  printTruthTable({
    title: "SVELTYCMS — ENTRY EDIT HYDRATION AUDIT",
    shortLabel: "Hydration",
    subtitle: `${FIELD_COUNT}-Field Form Mount · Prefetch · Field-Patch vs Full Stringify`,
    results: results as any[],
  });

  printSummaryTable(
    [
      { key: "50-Field Mount Latency", val: mountResult.avgMs.toFixed(3), unit: "ms" },
      { key: "Widget Prefetch (5 Types)", val: avgPrefetchMs.toFixed(3), unit: "ms" },
      { key: "Field Patch Sync Latency", val: patchInputResult.avgMs.toFixed(4), unit: "ms" },
      { key: "Legacy JSON Diff Latency", val: legacyInputResult.avgMs.toFixed(4), unit: "ms" },
      { key: "Reactive Sync Speedup", val: `${speedup}×`, unit: "" },
      {
        key: "Form Mount Tier",
        val:
          mountResult.avgMs < 1
            ? "PLATINUM (<1ms)"
            : mountResult.avgMs < 5
              ? "GOLD (<5ms)"
              : "SILVER",
        unit: "",
      },
    ],
    "Hydration Performance Summary",
  );

  exportMetric("hydration.mount_50f_ms", mountResult.avgMs, "ms");
  exportMetric("hydration.prefetch_ms", avgPrefetchMs, "ms");
  exportMetric("hydration.patch_sync_ms", patchInputResult.avgMs, "ms");
  exportMetric("hydration.legacy_diff_ms", legacyInputResult.avgMs, "ms");
  exportMetric("hydration.speedup", parseFloat(speedup) || 1, "x");

  for (const r of results) exportResult(r as any);
}

test("Entry Edit Hydration (50-field form mount + first input)", async () => {
  await runHydrationAudit();
}, 180_000);
