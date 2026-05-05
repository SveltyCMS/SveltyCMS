/**
 * @file tests/benchmarks/admin-ux-vitality.test.ts
 * @description Simulated Admin UX Vitality benchmark for SveltyCMS.
 * Measures the server-side processing cost of complex Svelte 5 logic for massive forms.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  stabilize,
  printTruthTable,
  printSummaryTable,
} from "./benchmark-utils";

async function runUXAudit() {
  console.log("🚀 Starting Simulated Admin UX Vitality Audit...\n");

  const { widgets: widgetStore } = await import("@src/stores/widget-store.svelte");
  const { LocalCMS } = await import("@src/services/sdk");
  const { getDb, ensureFullInitialization } = await import("@src/databases/db");

  await ensureFullInitialization();
  const db = getDb();
  const cms = new LocalCMS(db as any);

  // Mock Admin for Auth context
  const mockAdmin = { _id: "admin-123", username: "admin", role: "admin", isAdmin: true };
  const apiOptions = { user: mockAdmin, tenantId: "global" as any };

  // 🚀 CRITICAL: Initialize widgets for this environment
  await widgetStore.initialize("global", db!);

  await stabilize();

  try {
    // 1. Measure Schema-to-Form Transformation logic
    console.log("   → Measuring Form Resolution Logic (50 fields)...");
    const complexSchema = {
      _id: "ux_stress_test",
      fields: Array.from({ length: 50 }).map((_, i) => ({
        name: `field_${i}`,
        label: `Field ${i}`,
        type: i % 3 === 0 ? "text" : i % 3 === 1 ? "richtext" : "relation",
        required: true,
        widget: { Name: "Input", Icon: "mdi:text", Color: "#ccc" },
      })),
    };

    const formResult = await runBenchmark({
      name: "Form Logic (50f)",
      iterations: 500,
      runs: 2,
      onIteration: async () => {
        // Simulates the logic that runs when opening the editor
        await cms.collections.modifyRequest({
          collection: complexSchema as any,
          fields: complexSchema.fields,
          data: [{}],
          type: "GET",
          ...apiOptions,
        } as any);
      },
      silent: true,
    });

    // 2. Measure Widget Registration & Lookup
    console.log("   → Measuring Widget Registry lookup performance...");
    const widgetResult = await runBenchmark({
      name: "Widget Registry",
      iterations: 1000,
      runs: 1,
      onIteration: async () => {
        await widgetStore.getWidgetModule({ label: "text" } as any);
      },
      silent: true,
    });

    printTruthTable({
      title: "SVELTYCMS  —  ADMIN UX VITALITY AUDIT",
      subtitle: `Form Processor • Widget Registry • Stress: 50 Fields`,
      results: [
        { ...formResult, layer: "Form Proc" },
        { ...widgetResult, layer: "Registry" },
      ],
    });

    printSummaryTable([
      { key: "Complex Form Overhead", val: formResult.avgMs, unit: "ms" },
      { key: "Widget Lookup Latency", val: widgetResult.avgMs, unit: "ms" },
      {
        key: "Simulated Rendering Vitality",
        val: (100 - formResult.avgMs).toFixed(2),
        unit: "/100",
      },
      { key: "UX Performance Tier", val: formResult.avgMs < 5 ? "PLATINUM" : "GOLD", unit: "" },
    ]);

    exportResult(formResult);
  } catch (err: any) {
    console.error("❌ UX audit failed:", err.message);
  }

  console.log("\n✅ Admin UX vitality audit completed.");
}

test("Admin Dashboard Vitality Simulation", async () => {
  await runUXAudit();
}, 300000);
