/**
 * @file tests/benchmarks/entry-edit-hydration.test.ts
 * @description Entry Edit Hydration Benchmark
 * @summary Measures 50-field form mount (widget loader resolve + prefetch) and first-input sync latency.
 *
 * ### Features:
 * - 50-field schema simulation (5 widget types)
 * - Cached widget loader resolution per field
 * - Field-level patch sync vs legacy JSON.stringify full-object compare
 */

import { test } from "bun:test";
import {
  runBenchmark,
  exportResult,
  printTruthTable,
  printSummaryTable,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";

const FIELD_COUNT = 50;
const WIDGET_TYPES = ["Input", "RichText", "Select", "DateTime", "Seo"];

function build50FieldSchema() {
  return Array.from({ length: FIELD_COUNT }, (_, i) => ({
    label: `Field ${i}`,
    db_fieldName: `field_${i}`,
    widget: { Name: WIDGET_TYPES[i % WIDGET_TYPES.length] },
    required: i % 10 === 0,
  }));
}

function buildEntryPayload(fields: ReturnType<typeof build50FieldSchema>) {
  const entry: Record<string, unknown> = { _id: "bench-hydration-entry" };
  for (const f of fields) {
    entry[f.db_fieldName] = f.widget.Name === "RichText" ? "<p></p>" : "";
  }
  return entry;
}

/** Legacy fields.svelte sync path (pre-refactor). */
function legacyFullObjectSync(local: Record<string, unknown>, global: Record<string, unknown>) {
  return JSON.stringify(local) !== JSON.stringify(global);
}

/** Field-level patch sync (post-refactor). */
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
  if (!db) throw new Error("DB not initialized");

  await widgetStoreActions.initializeWidgets("global", db);
  clearWidgetLoaderCache();

  const fields = build50FieldSchema();
  const entry = buildEntryPayload(fields);
  const registry = widgets.widgetFunctions;
  const uniqueWidgets = [...new Set(fields.map((f) => f.widget.Name))];

  const results: Array<Record<string, unknown>> = [];

  console.log("   → Measuring 50-field loader resolution (cached registry)...");
  const mountResult = await runBenchmark({
    name: "50-Field Loader Resolve",
    iterations: 200,
    warmupIterations: 30,
    runs: 2,
    trimOutliers: "iqr",
    silent: true,
    onIteration: () => {
      let resolved = 0;
      for (const f of fields) {
        if (getCachedWidgetInputLoader(f.widget.Name, registry)) resolved++;
      }
      if (resolved < FIELD_COUNT)
        throw new Error(`Only ${resolved}/${FIELD_COUNT} loaders resolved`);
    },
  });
  results.push({ ...mountResult, layer: "Client", shortLabel: "Mount-50f" });

  console.log("   → Measuring widget prefetch (unique types)...");
  clearWidgetLoaderCache();
  const prefetchResult = await runBenchmark({
    name: "Widget Prefetch (5 types)",
    iterations: 50,
    warmupIterations: 5,
    runs: 2,
    trimOutliers: "iqr",
    silent: true,
    onIteration: async () => {
      clearWidgetLoaderCache();
      prefetchWidgetLoaders(uniqueWidgets, registry);
      await Promise.all(
        uniqueWidgets.map((name) => {
          const loader = getCachedWidgetInputLoader(name, registry);
          return loader ? loader() : Promise.resolve();
        }),
      );
    },
  });
  results.push({
    ...prefetchResult,
    layer: "Client",
    shortLabel: "Prefetch-5w",
  });

  console.log("   → Measuring first-input latency (field patch vs JSON.stringify)...");
  const globalSnapshot = { ...entry };

  const patchInputResult = await runBenchmark({
    name: "First Input (field patch)",
    iterations: 5000,
    warmupIterations: 500,
    runs: 2,
    trimOutliers: "iqr",
    silent: true,
    onIteration: () => {
      const local = { ...entry, field_0: "typed-value" };
      if (!patchFieldSync(local, globalSnapshot, "field_0")) {
        throw new Error("patch sync missed change");
      }
    },
  });
  results.push({
    ...patchInputResult,
    layer: "Client",
    shortLabel: "Input-Patch",
  });

  const legacyInputResult = await runBenchmark({
    name: "First Input (JSON.stringify)",
    iterations: 5000,
    warmupIterations: 500,
    runs: 2,
    trimOutliers: "iqr",
    silent: true,
    onIteration: () => {
      const local = { ...entry, field_0: "typed-value" };
      if (!legacyFullObjectSync(local, globalSnapshot)) {
        throw new Error("legacy sync missed change");
      }
    },
  });
  results.push({
    ...legacyInputResult,
    layer: "Client",
    shortLabel: "Input-Legacy",
  });

  const speedup =
    legacyInputResult.avgMs > 0
      ? (legacyInputResult.avgMs / patchInputResult.avgMs).toFixed(1)
      : "n/a";

  printTruthTable({
    title: "SVELTYCMS  —  ENTRY EDIT HYDRATION AUDIT",
    subtitle: "50-Field Mount · Widget Prefetch · First Input Latency",
    results,
  });

  printSummaryTable([
    { key: "50-Field Loader Resolve", val: mountResult.avgMs, unit: "ms" },
    { key: "Widget Prefetch (5 types)", val: prefetchResult.avgMs, unit: "ms" },
    {
      key: "First Input (field patch)",
      val: patchInputResult.avgMs,
      unit: "ms",
    },
    {
      key: "First Input (legacy stringify)",
      val: legacyInputResult.avgMs,
      unit: "ms",
    },
    { key: "Patch vs Legacy speedup", val: speedup, unit: "×" },
    {
      key: "Hydration Tier",
      val: mountResult.avgMs < 2 ? "PLATINUM" : mountResult.avgMs < 8 ? "GOLD" : "SILVER",
      unit: "",
    },
  ]);

  for (const r of results) exportResult(r);
}

test("Entry Edit Hydration (50-field form mount + first input)", async () => {
  await runHydrationAudit();
}, 180000);
