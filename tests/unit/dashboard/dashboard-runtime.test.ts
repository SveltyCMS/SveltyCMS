/**
 * @file tests/unit/dashboard/dashboard-runtime.test.ts
 * @description Unit tests for dashboard picker mapping, layout unwrap, and poll gating.
 */

import { describe, expect, it } from "vitest";
import type { DashboardWidgetManifest } from "@src/routes/(app)/dashboard/widgets/manifest-registry";
import {
  filterPickerByPlugins,
  manifestsToPickerList,
  normalizeDashboardLayout,
  shouldFetchOnVisibility,
  shouldSkipScheduledPoll,
  sortWidgetsByHotCollections,
} from "@src/routes/(app)/dashboard/widget-runtime";

function manifest(
  overrides: Partial<DashboardWidgetManifest> & Pick<DashboardWidgetManifest, "id" | "name">,
): DashboardWidgetManifest {
  return {
    icon: "mdi:widgets",
    version: "1.0.0",
    sveltycms: ">=0.0.8",
    type: "dashboard-widget",
    author: "SveltyCMS",
    license: "free",
    component: "index",
    defaultSize: { w: 1, h: 1 },
    ...overrides,
  };
}

// Timing knobs for the picker-mapping regression check. A single 5k-iteration sample
// flaked on CI once at 120ms (≈24µs/op) after measuring 56ms (≈11µs/op) on the same
// suite — one batch is at the mercy of a GC pause or a noisy neighbour, so the test
// below times several batches and asserts on their median instead.
const PICKER_WARMUP_ITERATIONS = 1_000;
const PICKER_BATCH_ITERATIONS = 1_000;
const PICKER_BATCH_COUNT = 5;
// Per-op budget from the observed CI range: 11µs/op true cost (56ms/5k), 14µs/op cold
// (71ms/5k), 24µs/op worst observed (120ms/5k). 60µs/op leaves ~2.5× headroom over the
// worst sample while still failing a 10× regression from the true cost (≈110µs/op) —
// and because the median discards a lone outlier batch, the budget does not have to
// absorb the single worst spike the way the old 100ms/5k single-sample budget did.
const PICKER_US_PER_OP_BUDGET = 60;

describe("manifestsToPickerList", () => {
  it("maps widget.json to picker entries without a Svelte component", () => {
    const list = manifestsToPickerList([
      manifest({
        id: "system-health",
        name: "System Health",
        description: "Health",
        icon: "mdi:heart-pulse",
        defaultSize: { w: 2, h: 2 },
      }),
    ]);
    expect(list).toEqual([
      {
        category: undefined,
        componentName: "index",
        defaultSize: { w: 2, h: 2 },
        description: "Health",
        folder: "system-health",
        icon: "mdi:heart-pulse",
        license: "free",
        name: "System Health",
        requiresPlugin: undefined,
      },
    ]);
    expect(list[0]).not.toHaveProperty("component");
  });

  it("drops packages whose CMS range the host does not satisfy", () => {
    const list = manifestsToPickerList(
      [
        manifest({ id: "ok", name: "Ok", sveltycms: ">=0.0.8" }),
        manifest({ id: "future", name: "Future", sveltycms: ">=9.0.0" }),
      ],
      "0.0.8",
    );
    expect(list.map((w) => w.folder)).toEqual(["ok"]);
  });

  it("hides optional widgets until their plugin is enabled", () => {
    const list = manifestsToPickerList([
      manifest({ id: "cpu", name: "CPU" }),
      manifest({
        id: "commerce-orders",
        name: "Orders",
        license: "freemium",
        requiresPlugin: "commerce",
      }),
    ]);
    expect(filterPickerByPlugins(list, {}).map((w) => w.folder)).toEqual(["cpu"]);
    expect(filterPickerByPlugins(list, { commerce: false }).map((w) => w.folder)).toEqual(["cpu"]);
    expect(filterPickerByPlugins(list, { commerce: true }).map((w) => w.folder)).toEqual([
      "cpu",
      "commerce-orders",
    ]);
  });

  it("skips manifests without an id or name", () => {
    const list = manifestsToPickerList([
      manifest({ id: "", name: "No Id" }),
      manifest({ id: "named", name: "" }),
      manifest({ id: "keep", name: "Keep" }),
    ]);
    expect(list.map((w) => w.folder)).toEqual(["keep"]);
  });

  it("maps 22 manifests in well under a millisecond (picker is JSON, not Svelte eval)", () => {
    const manifests = Array.from({ length: 22 }, (_, i) =>
      manifest({ id: `w-${i}`, name: `Widget ${i}` }),
    );
    // JIT warm-up before the timed batches — a cold first call on a busy CI runner
    // pays the compiler and made the old warm-up-less <50ms budget flaky (71ms/5k).
    for (let i = 0; i < PICKER_WARMUP_ITERATIONS; i++) manifestsToPickerList(manifests, "0.0.8");

    // Median of PICKER_BATCH_COUNT batches. The previous single 5k sample failed CI at
    // 120ms/5k while the documented steady state was 56ms/5k (and the pre-warm-up run
    // 71ms/5k); a lone GC pause or contended runner must not fail a mapping whose true
    // cost is ~11µs/op, but a real slowdown hits the median too.
    const batchMs: number[] = [];
    for (let batch = 0; batch < PICKER_BATCH_COUNT; batch++) {
      const t0 = performance.now();
      for (let i = 0; i < PICKER_BATCH_ITERATIONS; i++) manifestsToPickerList(manifests, "0.0.8");
      batchMs.push(performance.now() - t0);
    }
    batchMs.sort((a, b) => a - b);
    const medianUsPerOp =
      (batchMs[Math.floor(PICKER_BATCH_COUNT / 2)] / PICKER_BATCH_ITERATIONS) * 1_000;
    expect(
      medianUsPerOp,
      `median ${medianUsPerOp.toFixed(2)}µs/op (budget ${PICKER_US_PER_OP_BUDGET}µs/op) from batches [${batchMs
        .map((ms) => ms.toFixed(2))
        .join(", ")}]ms × ${PICKER_BATCH_ITERATIONS} iterations`,
    ).toBeLessThan(PICKER_US_PER_OP_BUDGET);
  });
});

describe("sortWidgetsByHotCollections", () => {
  it("boosts hot folder ids to the front without dropping the rest", () => {
    const widgets = [
      { folder: "cpu", componentName: "index", name: "CPU" },
      { folder: "system-health", componentName: "index", name: "Health" },
    ];
    const sorted = sortWidgetsByHotCollections(widgets, new Set(["system-health"]));
    expect(sorted.map((w) => w.folder)).toEqual(["system-health", "cpu"]);
  });
});

describe("normalizeDashboardLayout", () => {
  const widget = {
    id: "widget-1",
    component: "cpu",
    label: "CPU",
    icon: "mdi:cpu",
    size: { w: 1, h: 2 },
    settings: {},
  };

  it("accepts a raw widget array", () => {
    expect(normalizeDashboardLayout([widget])).toEqual([widget]);
  });

  it("unwraps { preferences } and { value } envelopes", () => {
    expect(normalizeDashboardLayout({ preferences: [widget] })).toEqual([widget]);
    expect(normalizeDashboardLayout({ value: { preferences: [widget] } })).toEqual([widget]);
  });

  it("returns [] for null / garbage and drops malformed rows", () => {
    expect(normalizeDashboardLayout(null)).toEqual([]);
    expect(normalizeDashboardLayout("nope")).toEqual([]);
    expect(normalizeDashboardLayout([{ id: "x" }])).toEqual([]);
  });
});

describe("widget poll gating", () => {
  it("skips scheduled polls while the document is hidden", () => {
    expect(shouldSkipScheduledPoll(true)).toBe(true);
    expect(shouldSkipScheduledPoll(false)).toBe(false);
  });

  it("refetches on visibility only after the poll interval", () => {
    expect(shouldFetchOnVisibility(true, 1, 5_000, 10_000)).toBe(false);
    expect(shouldFetchOnVisibility(false, 9_000, 5_000, 10_000)).toBe(false);
    expect(shouldFetchOnVisibility(false, 1_000, 5_000, 10_000)).toBe(true);
    expect(shouldFetchOnVisibility(false, 0, 5_000, 10_000)).toBe(true);
  });
});
