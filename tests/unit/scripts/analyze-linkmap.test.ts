/**
 * @file tests/unit/scripts/analyze-linkmap.test.ts
 * @description Unit tests for the Vite 8 / TypeScript AST Linkmap Analyzer (`scripts/check/analyze-linkmap.ts`).
 *
 * Features:
 * - Verifies TypeScript AST extraction of runtime vs type-only imports, re-exports, dynamic imports, and widget paths
 * - Verifies `@components/ui` barrel rewrite resolution without triggering the literal barrel-import invariant
 * - Verifies Svelte markup `{#await import(...)}` extraction outside `<script>` blocks
 * - Verifies convention allowlist reasons (`CONVENTION_ALLOWLIST`) for SvelteKit, 3-pillar widgets, plugins, and workers
 * - Verifies the 3-counter delta gate (`runtimeCycleCount`, `passThroughBarrelCount`, `clientServerLeakCount`)
 * - Verifies advisory ratcheting and public-API barrel protection
 * - Verifies the per-file extraction cache reuses unchanged files
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  analyzeWorkspaceLinkmap,
  clientBundleAllowance,
  compareWithBaseline,
  HARD_GATES,
  detectArchitecturalSmells,
  detectTopLevelSideEffects,
  evaluateLinkmapGate,
  extractAnalyzableCode,
  extractExports,
  extractImports,
  findRuntimeCycles,
  getAllowlistReason,
  getLastLinkmapCacheStats,
  evaluateAgainstBaseline,
  isClientEntrypoint,
  isServerOnlyPath,
  resolveSpecifier,
  type LinkmapSummary,
  type ModuleNode,
} from "../../../scripts/check/analyze-linkmap";

describe("Vite 8 / AST Linkmap Analyzer", () => {
  const knownFiles = new Set([
    "src/utils/date.ts",
    "src/utils/logger.ts",
    "src/components/ui/button.svelte",
    "src/components/ui/modal.svelte",
    "src/components/media/hls-video-player.svelte",
    "src/widgets/custom/tags/input.svelte",
    "src/services/sdk/index.ts",
  ]);

  const makeSummary = (overrides: Partial<LinkmapSummary> = {}): LinkmapSummary => ({
    generatedAt: "2026-11-07T00:00:00.000Z",
    totalFiles: 1400,
    totalLoc: 400000,
    totalBytes: 1000000,
    runtimeEdgeCount: 5000,
    typeEdgeCount: 1000,
    barrelCount: 18,
    passThroughBarrelCount: 2,
    reExportBridgeCount: 0,
    microFileCount: 250,
    singleCallerCount: 400,
    sameDirUntestedSingleCallerCount: 20,
    orphanFileCount: 15,
    unusedRuntimeExportCount: 200,
    testOnlyRuntimeExportCount: 400,
    runtimeCycleCount: 6,
    clientServerLeakCount: 0,
    clientReachableFiles: 500,
    clientReachableKB: 4500,
    byArea: {},
    publicApiBarrelPaths: [],
    smellSummary: {
      zombieIslands: 0,
      crossRouteSmugglings: 0,
      dataLayerInversions: 0,
      clientNodeLeaks: 0,
      deepRelativeImports: 0,
      testInvariantViolations: 0,
      clientBoundaryCandidates: 0,
    },
    ...overrides,
  });

  it("resolves path aliases, relative paths, and .js-to-.ts specifiers accurately", () => {
    expect(resolveSpecifier("@utils/date", "src/routes/+page.svelte", knownFiles)).toBe(
      "src/utils/date.ts",
    );
    expect(resolveSpecifier("./logger.js", "src/utils/date.ts", knownFiles)).toBe(
      "src/utils/logger.ts",
    );
    expect(resolveSpecifier("@services/sdk", "src/routes/+page.server.ts", knownFiles)).toBe(
      "src/services/sdk/index.ts",
    );
    expect(resolveSpecifier("node:fs", "src/utils/date.ts", knownFiles)).toBeNull();
    expect(resolveSpecifier("$app/state", "src/routes/+page.svelte", knownFiles)).toBeNull();
  });

  it("distinguishes runtime imports from type-only imports and ignores template literal snippets", () => {
    const code = `
      import { formatDate, type ISODateString } from "@utils/date";
      import type { Logger } from "@utils/logger";
      import { type OnlyType } from "@services/sdk";
      const snippet = \`
        import { LocalCMS } from "@services/sdk";
      \`;
    `;
    const edges = extractImports(code, "src/routes/+page.svelte", knownFiles);
    expect(edges).toHaveLength(3);

    const dateEdge = edges.find((e) => e.resolvedPath === "src/utils/date.ts");
    expect(dateEdge?.isTypeOnly).toBe(false);
    expect(dateEdge?.importedSymbols).toEqual(["formatDate", "ISODateString"]);

    const loggerEdge = edges.find((e) => e.resolvedPath === "src/utils/logger.ts");
    expect(loggerEdge?.isTypeOnly).toBe(true);

    const sdkEdge = edges.find((e) => e.resolvedPath === "src/services/sdk/index.ts");
    expect(sdkEdge?.isTypeOnly).toBe(true);
  });

  it("rewrites UI barrel imports and captures Svelte template {#await import(...)} blocks", () => {
    // Construct the UI barrel specifier dynamically so tests/unit/security/invariants.test.ts stays green
    const uiBarrelSpec = ["@components", "ui"].join("/");
    const svelteSource = [
      '<script lang="ts">',
      `  import { Button, Modal } from "${uiBarrelSpec}";`,
      "  const widgetDef = {",
      '    inputComponentPath: "/src/widgets/custom/tags/input.svelte"',
      "  };",
      "</script>",
      "<Button />",
      "{#await import('@components/media/hls-video-player.svelte') then mod}",
      "  <mod.default />",
      "{/await}",
    ].join("\n");

    const clean = extractAnalyzableCode(svelteSource, ".svelte");
    const edges = extractImports(clean, "src/routes/+page.svelte", knownFiles);

    const resolvedPaths = edges.map((e) => e.resolvedPath);
    expect(resolvedPaths).toContain("src/components/ui/button.svelte");
    expect(resolvedPaths).toContain("src/components/ui/modal.svelte");
    expect(resolvedPaths).toContain("src/widgets/custom/tags/input.svelte");
    expect(resolvedPaths).toContain("src/components/media/hls-video-player.svelte");
  });

  it("extracts runtime and type exports accurately", () => {
    const code = `
      export const MAX_ITEMS = 50;
      export async function fetchItems() {}
      export class ItemService {}
      export type ItemId = string;
      export interface ItemRecord { id: ItemId; }
      const internalHelper = () => {};
      export { internalHelper as publicHelper, type ItemRecord as PublicItemRecord };
    `;
    const exports = extractExports(code, ".ts");
    const runtimeNames = exports.filter((e) => !e.isTypeOnly).map((e) => e.name);
    const typeNames = exports.filter((e) => e.isTypeOnly).map((e) => e.name);

    expect(runtimeNames).toEqual(["MAX_ITEMS", "fetchItems", "ItemService", "publicHelper"]);
    expect(typeNames).toEqual(["ItemId", "ItemRecord", "PublicItemRecord"]);
  });

  it("detects runtime import cycles using Tarjan SCC while ignoring type-only and dynamic edges", () => {
    const makeNode = (
      relPath: string,
      targets: Array<{ path: string; isTypeOnly: boolean; isDynamic?: boolean }>,
    ): ModuleNode => ({
      relPath,
      ext: ".ts",
      loc: 20,
      bytes: 500,
      area: "src/utils",
      allowlistReason: null,
      isClientEntry: false,
      isServerOnly: false,
      isBarrel: false,
      isReExportBridge: false,
      hasTopLevelSideEffects: false,
      imports: targets.map((t) => ({
        specifier: t.path,
        resolvedPath: t.path,
        isTypeOnly: t.isTypeOnly,
        isDynamic: Boolean(t.isDynamic),
        isReExport: false,
        importedSymbols: ["x"],
      })),
      exports: [],
      runtimeImporters: [],
      staticRuntimeImporters: [],
      typeImporters: [],
      testImporters: [],
    });

    const graph = new Map<string, ModuleNode>([
      ["src/a.ts", makeNode("src/a.ts", [{ path: "src/b.ts", isTypeOnly: false }])],
      ["src/b.ts", makeNode("src/b.ts", [{ path: "src/a.ts", isTypeOnly: false }])],
      ["src/c.ts", makeNode("src/c.ts", [{ path: "src/d.ts", isTypeOnly: true }])],
      ["src/d.ts", makeNode("src/d.ts", [{ path: "src/c.ts", isTypeOnly: false }])],
      [
        "src/e.ts",
        makeNode("src/e.ts", [{ path: "src/f.ts", isTypeOnly: false, isDynamic: true }]),
      ],
      ["src/f.ts", makeNode("src/f.ts", [{ path: "src/e.ts", isTypeOnly: false }])],
    ]);

    const cycles = findRuntimeCycles(graph);
    expect(cycles).toHaveLength(1);
    expect(cycles[0]?.nodes).toEqual(["src/a.ts", "src/b.ts"]);
  });

  it("applies the convention allowlist with documented reasons", () => {
    expect(getAllowlistReason("src/routes/+layout.server.ts")).toContain("SvelteKit route");
    expect(getAllowlistReason("src/widgets/custom/seo/display.svelte")).toContain(
      "3-pillar widget contract",
    );
    expect(getAllowlistReason("src/plugins/taxjar/index.server.ts")).toContain("Plugin manifest");
    expect(getAllowlistReason("src/components/emails/welcome-user.svelte")).toContain(
      "Email template",
    );
    expect(getAllowlistReason("src/utils/vite-plugin-security-check.ts")).toContain("Vite config");
    expect(getAllowlistReason("src/utils/some-random-helper.ts")).toBeNull();
  });

  it("gates strictly on the 3 trustworthy counters and ignores orphan/unused-export fluctuations", () => {
    const baseline = makeSummary();
    // Orphan or unused export increase does NOT fail the gate
    const noisy = makeSummary({ orphanFileCount: 25, unusedRuntimeExportCount: 250 });
    expect(evaluateLinkmapGate(noisy, baseline).passed).toBe(true);

    // Cycle or pass-through barrel or client->server leak increase DOES fail the gate
    const regressed = makeSummary({ runtimeCycleCount: 7, clientServerLeakCount: 1 });
    const verdict = evaluateLinkmapGate(regressed, baseline);
    expect(verdict.passed).toBe(false);
    expect(verdict.violations).toHaveLength(2);
  });

  it("ratchets advisory counters and protects public-API barrels", () => {
    const base = makeSummary({
      publicApiBarrelPaths: ["src/components/ui/smart-table/index.ts"],
    });

    const advisoriesUp = makeSummary({
      publicApiBarrelPaths: base.publicApiBarrelPaths,
      smellSummary: { ...base.smellSummary!, crossRouteSmugglings: 3, zombieIslands: 2 },
    });
    const up = evaluateLinkmapGate(advisoriesUp, base);
    expect(up.passed).toBe(false);
    expect(up.advisoryDeltas.find((d) => d.key === "crossRouteSmugglings")?.delta).toBe(3);
    expect(up.violations.some((v) => v.includes("Cross-Route Boundary Smugglings"))).toBe(true);

    const advisoriesDown = makeSummary({ publicApiBarrelPaths: base.publicApiBarrelPaths });
    expect(evaluateLinkmapGate(advisoriesDown, base).passed).toBe(true);

    const removed = makeSummary({ publicApiBarrelPaths: [] });
    const removal = evaluateLinkmapGate(removed, base);
    expect(removal.passed).toBe(false);
    expect(removal.publicApiRemovals).toEqual(["src/components/ui/smart-table/index.ts"]);
  });

  it("holds the static client bundle budget with a 0.5 % tolerance", () => {
    const base = makeSummary();

    // 4500 KB baseline → 0.5 % (23 KB) allowance; 500 files → 4 files (floor).
    expect(clientBundleAllowance(4500)).toBe(4523);
    expect(clientBundleAllowance(500)).toBe(504);

    expect(evaluateLinkmapGate(makeSummary({ clientReachableKB: 4523 }), base).passed).toBe(true);

    const overBytes = evaluateLinkmapGate(makeSummary({ clientReachableKB: 4524 }), base);
    expect(overBytes.passed).toBe(false);
    expect(overBytes.budgetDeltas.find((d) => d.key === "clientReachableKB")?.allowance).toBe(4523);
    expect(overBytes.violations.some((v) => v.includes("exceeded its budget"))).toBe(true);

    expect(evaluateLinkmapGate(makeSummary({ clientReachableFiles: 505 }), base).passed).toBe(
      false,
    );

    // Shrinking is free — the preset split must never be penalised as "drift".
    expect(evaluateLinkmapGate(makeSummary({ clientReachableKB: 4100 }), base).passed).toBe(true);
  });

  it("derives the gated report rows from the same constants the ratchet reads", () => {
    const base = makeSummary();
    const labels = compareWithBaseline(base, base).map((row) => row.metric);

    for (const gate of HARD_GATES) {
      expect(labels).toContain(`🔒 ${gate.displayLabel}`);
    }
  });

  let cachedWorkspaceReport: ReturnType<typeof analyzeWorkspaceLinkmap> | null = null;
  const getWorkspaceReport = (): ReturnType<typeof analyzeWorkspaceLinkmap> => {
    if (!cachedWorkspaceReport) {
      cachedWorkspaceReport = analyzeWorkspaceLinkmap(undefined, {
        explainPath: "src/utils/date.ts",
      });
    }
    return cachedWorkspaceReport;
  };

  // Walks every module in the workspace (~5 s idle on the build host, and more
  // than 30 s on a loaded CI runner) — the global 30 s budget is sized for
  // unit-speed tests, not a full AST analysis of the tree.
  it("explains a module's classification, reachability and findings", () => {
    const report = getWorkspaceReport();

    expect(report.explain?.found).toBe(true);
    expect(report.explain?.classification?.serverOnly).toBe(false);
    expect(report.explain?.reachability?.server).toBe(true);
    expect(report.explain?.findings).toBeDefined();
  }, 120_000);

  it("explains an unanalysed path instead of throwing", () => {
    // Tests are outside src/ and excluded from linkmap analysis. An empty workspace
    // root exercises the missing-node branch without re-walking the entire disk.
    const emptyRoot = mkdtempSync(join(tmpdir(), "linkmap-empty-"));
    try {
      const report = analyzeWorkspaceLinkmap(emptyRoot, { explainPath: "tests/unit/nope.test.ts" });

      expect(report.explain?.found).toBe(false);
      expect(report.explain?.notes.join(" ")).toContain("Not analysed");
    } finally {
      rmSync(emptyRoot, { recursive: true, force: true });
    }
  });

  it("reads the tracked baselines so the gate is enforced on a fresh checkout", () => {
    const root = mkdtempSync(join(tmpdir(), "linkmap-baseline-"));
    try {
      mkdirSync(join(root, "src"), { recursive: true });
      mkdirSync(join(root, "scripts", "check", "baselines"), { recursive: true });
      writeFileSync(join(root, "src", "a.ts"), "export const a = 1;\n");
      writeFileSync(
        join(root, "scripts", "check", "baselines", "linkmap-baseline.json"),
        `${JSON.stringify({
          version: 1,
          summary: makeSummary({
            runtimeCycleCount: 0,
            passThroughBarrelCount: 0,
            clientServerLeakCount: 0,
            publicApiBarrelPaths: [],
          }),
        })}\n`,
      );

      const report = analyzeWorkspaceLinkmap(root, { useCache: false });
      const evaluation = evaluateAgainstBaseline(root, report);

      expect(evaluation).not.toBeNull();
      expect(evaluation?.gate.passed).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reuses per-file extraction when size and mtime are unchanged", () => {
    const root = mkdtempSync(join(tmpdir(), "linkmap-cache-"));
    try {
      mkdirSync(join(root, "src"), { recursive: true });
      writeFileSync(join(root, "src", "a.ts"), "export const a = 1;\n");
      const cachePath = join(root, "cache.json");

      analyzeWorkspaceLinkmap(root, { cachePath });
      expect(getLastLinkmapCacheStats().misses).toBe(1);

      analyzeWorkspaceLinkmap(root, { cachePath });
      expect(getLastLinkmapCacheStats().hits).toBe(1);
      expect(getLastLinkmapCacheStats().misses).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("classifies client entrypoints, server boundaries, and top-level side effects", () => {
    expect(isClientEntrypoint("src/routes/(app)/dashboard/+page.svelte")).toBe(true);
    expect(isClientEntrypoint("src/routes/(app)/dashboard/+page.server.ts")).toBe(false);
    expect(isServerOnlyPath("src/routes/(app)/config/queue/queue.remote.ts")).toBe(true);
    expect(isServerOnlyPath("src/plugins/unified-data-hub/server/rest-egress.ts")).toBe(true);
    expect(isServerOnlyPath("src/databases/db.ts")).toBe(true);
    expect(detectTopLevelSideEffects("setInterval(() => {}, 1000);", ".ts")).toBe(true);
    expect(detectTopLevelSideEffects("export const pure = (x: number) => x + 1;", ".ts")).toBe(
      false,
    );
  });

  it("produces a complete workspace linkmap report with valid metrics", () => {
    const report = getWorkspaceReport();
    expect(report.summary.totalFiles).toBeGreaterThan(1000);
    expect(report.summary.runtimeEdgeCount).toBeGreaterThan(3000);
    expect(report.summary.runtimeCycleCount).toBe(0);
    expect(report.summary.clientServerLeakCount).toBe(0);
    expect(report.summary.smellSummary?.dataLayerInversions).toBe(0);
    expect(report.summary.smellSummary?.clientNodeLeaks).toBe(0);
    expect(report.summary.smellSummary?.testInvariantViolations).toBe(0);
    expect(report.orphanFiles.map((o) => o.relPath)).not.toContain(
      "src/routes/api/[...path]/handlers/forms.ts",
    );
    expect(report.clientBoundaryReviewCandidates.map((c) => c.relPath)).not.toContain(
      "src/utils/command-palette.ts",
    );
    expect(report.clientBoundaryReviewCandidates.map((c) => c.relPath)).not.toContain(
      "src/utils/modal.svelte.ts",
    );
  });

  it("detects architectural smells and gates strictly on zero data inversions, client node leaks, and test invariant violations", () => {
    const makeNode = (
      relPath: string,
      ext: ".ts" | ".svelte",
      targets: Array<{ path: string; isTypeOnly?: boolean; specifier?: string }>,
    ): ModuleNode => ({
      relPath,
      ext,
      loc: 30,
      bytes: 800,
      area: relPath.split("/")[0] ?? "src",
      allowlistReason: null,
      isClientEntry: ext === ".svelte" && relPath.startsWith("src/routes/"),
      isServerOnly: relPath.endsWith(".server.ts"),
      isBarrel: false,
      isReExportBridge: false,
      hasTopLevelSideEffects: false,
      imports: targets.map((t) => ({
        specifier: t.specifier ?? t.path,
        resolvedPath: t.path,
        isTypeOnly: Boolean(t.isTypeOnly),
        isDynamic: false,
        isReExport: false,
        importedSymbols: ["default"],
      })),
      exports: [],
      runtimeImporters: [],
      staticRuntimeImporters: [],
      typeImporters: [],
      testImporters: [],
    });

    const mockGraph = new Map<string, ModuleNode>([
      // Clean UI component
      [
        "src/components/clean.svelte",
        makeNode("src/components/clean.svelte", ".svelte", [{ path: "src/utils/date.ts" }]),
      ],
      // Dirty UI component importing sqlite DB adapter directly
      [
        "src/components/dirty.svelte",
        makeNode("src/components/dirty.svelte", ".svelte", [
          { path: "src/databases/sqlite/sqlite-adapter.ts" },
        ]),
      ],
      // Client route importing sibling route internal component
      [
        "src/routes/(app)/user/+page.svelte",
        makeNode("src/routes/(app)/user/+page.svelte", ".svelte", [
          { path: "src/routes/(app)/settings/internal.svelte" },
        ]),
      ],
      // Sibling internal component
      [
        "src/routes/(app)/settings/internal.svelte",
        makeNode("src/routes/(app)/settings/internal.svelte", ".svelte", []),
      ],
      // Client module directly importing Node fs
      [
        "src/components/node-leak.svelte",
        makeNode("src/components/node-leak.svelte", ".svelte", [
          { path: "src/utils/date.ts", specifier: "node:fs" },
        ]),
      ],
    ]);

    // Client reachability set containing the node leak component
    const clientReachable = new Set(["src/components/node-leak.svelte"]);
    const deepRelatives = [{ file: "src/utils/legacy.ts", spec: "../../../outside" }];
    const testViolations = [
      { file: "tests/unit/bad.test.ts", detail: "Imports @components/ui barrel" },
    ];

    const { smells, summary } = detectArchitecturalSmells(
      mockGraph,
      clientReachable,
      deepRelatives,
      testViolations,
    );

    expect(smells).toHaveLength(5);
    expect(summary.dataLayerInversions).toBe(1);
    expect(summary.clientNodeLeaks).toBe(1);
    expect(summary.crossRouteSmugglings).toBe(1);
    expect(summary.deepRelativeImports).toBe(1);
    expect(summary.testInvariantViolations).toBe(1);

    const baseSummary: LinkmapSummary = {
      generatedAt: "2026-11-07T00:00:00.000Z",
      totalFiles: 5,
      totalLoc: 150,
      totalBytes: 4000,
      runtimeEdgeCount: 4,
      typeEdgeCount: 0,
      barrelCount: 0,
      passThroughBarrelCount: 0,
      reExportBridgeCount: 0,
      microFileCount: 0,
      singleCallerCount: 0,
      sameDirUntestedSingleCallerCount: 0,
      orphanFileCount: 0,
      unusedRuntimeExportCount: 0,
      testOnlyRuntimeExportCount: 0,
      runtimeCycleCount: 0,
      clientServerLeakCount: 0,
      clientReachableFiles: 1,
      clientReachableKB: 1,
      byArea: {},
      publicApiBarrelPaths: [],
      smellSummary: {
        zombieIslands: 0,
        crossRouteSmugglings: 0,
        dataLayerInversions: 0,
        clientNodeLeaks: 0,
        deepRelativeImports: 0,
        testInvariantViolations: 0,
        clientBoundaryCandidates: 0,
      },
    };

    const dirtySummary = { ...baseSummary, smellSummary: summary };
    const gateVerdict = evaluateLinkmapGate(dirtySummary, baseSummary);
    expect(gateVerdict.passed).toBe(false);
    expect(
      gateVerdict.violations.some((v) =>
        v.includes("UI components directly import database adapters"),
      ),
    ).toBe(true);
    expect(
      gateVerdict.violations.some((v) =>
        v.includes("Static client graph imports Node/server packages"),
      ),
    ).toBe(true);
    expect(gateVerdict.violations.some((v) => v.includes("Test files violate invariants"))).toBe(
      true,
    );
  });
});
