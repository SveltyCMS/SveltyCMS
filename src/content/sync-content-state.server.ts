/**
 * @file src/content/sync-content-state.server.ts
 * @description Unified content synchronization entry for boot, compile drift, GUI saves, and reload paths.
 *
 * ### Features:
 * - `detectCompilationDrift` — offline `.ts` edits newer than compiled `.js`
 * - `ensureCompiledCollectionsFresh` — compile only when drift detected
 * - `detectOrganizationalDrift` — manifest `collectionOrder` / `structureNodes` vs DB
 * - `reconcileOrganizationalManifest` — heal manifest from DB on boot when drift detected
 * - `syncContentState` — reason-dispatched sync (`boot` | `compile` | `gui-save` | `watcher` | `sidebar-reorder`)
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { DatabaseAdapter } from "@src/databases/db-interface";
import type { ContentNode, ContentNodeOperation } from "./types";
import { compile } from "@utils/compilation/compile";
import type { CompilationResult } from "@utils/compilation/types";
import { logger } from "@utils/logger";
import {
  buildOrganizationalManifestFromNodes,
  getCollectionOrder,
  getStructureNodes,
  setOrganizationalManifest,
  type StructureNodeSnapshot,
} from "@utils/collection-order.server";
import { contentStore } from "@stores/content-registry.svelte";

export type SyncContentReason = "boot" | "compile" | "gui-save" | "watcher" | "sidebar-reorder";

export interface CompilationDriftReport {
  drifted: boolean;
  driftedFiles: string[];
  checked: number;
}

export interface SyncContentStateOptions {
  reason: SyncContentReason;
  tenantId?: string | null;
  adapter?: DatabaseAdapter;
  operations?: ContentNodeOperation[];
  changedFile?: string | null;
  skipReconciliation?: boolean;
}

export interface OrganizationalDriftReport {
  drifted: boolean;
  orderMismatch: boolean;
  structureMismatch: boolean;
  reconciled: boolean;
}

export interface SyncContentStateResult {
  reason: SyncContentReason;
  drift: CompilationDriftReport | null;
  orgDrift: OrganizationalDriftReport | null;
  compiled: CompilationResult | null;
  contentStructure?: ContentNode[];
}

interface PathRoots {
  userCollections: string;
  compiledCollections: string;
}

function resolvePathRoots(tenantId?: string | null): PathRoots {
  const userCollections = path.resolve(process.cwd(), "config", "collections");
  const compiledCollections = tenantId
    ? path.resolve(process.cwd(), ".compiledCollections", tenantId)
    : path.resolve(process.cwd(), ".compiledCollections");
  return { userCollections, compiledCollections };
}

async function listSourceCollectionFiles(userCollections: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(dir: string, relative = ""): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const rel = relative ? path.posix.join(relative, entry.name) : entry.name;
      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        const { isBenchmarkRuntime } = await import("@utils/benchmark-runtime.ts");
        const { isBenchmarkRelativePath } = await import("@utils/benchmark-paths.ts");
        if (!isBenchmarkRuntime() && (entry.name === "test" || isBenchmarkRelativePath(rel))) {
          continue;
        }
        await walk(full, rel);
        continue;
      }

      if (/\.(ts|js)$/i.test(entry.name) && !entry.name.endsWith(".d.ts")) {
        files.push(rel.replace(/\\/g, "/"));
      }
    }
  }

  await walk(userCollections);
  return files;
}

/**
 * Detects source files that are newer than (or missing from) compiled output.
 */
export async function detectCompilationDrift(
  tenantId?: string | null,
): Promise<CompilationDriftReport> {
  const { userCollections, compiledCollections } = resolvePathRoots(tenantId);
  const sources = await listSourceCollectionFiles(userCollections);
  const driftedFiles: string[] = [];

  for (const relativeSource of sources) {
    const sourcePath = path.join(userCollections, relativeSource);
    const jsName = relativeSource.replace(/\.(ts|js)$/i, ".js");
    const compiledPath = path.join(compiledCollections, jsName);

    try {
      const [sourceStat, compiledStat] = await Promise.all([
        fs.stat(sourcePath),
        fs.stat(compiledPath).catch(() => null),
      ]);

      if (!compiledStat || sourceStat.mtimeMs > compiledStat.mtimeMs + 1) {
        driftedFiles.push(relativeSource);
      }
    } catch {
      driftedFiles.push(relativeSource);
    }
  }

  return {
    drifted: driftedFiles.length > 0,
    driftedFiles,
    checked: sources.length,
  };
}

/**
 * Compiles collections when drift is detected. No-op when sources are fresh.
 */
export async function ensureCompiledCollectionsFresh(
  tenantId?: string | null,
): Promise<CompilationResult | null> {
  const drift = await detectCompilationDrift(tenantId);
  if (!drift.drifted) return null;

  const { userCollections, compiledCollections } = resolvePathRoots(tenantId);
  logger.info(
    `[ContentSync] Compilation drift detected (${drift.driftedFiles.length}/${drift.checked} files). Recompiling...`,
  );

  return compile({
    userCollections,
    compiledCollections,
    tenantId,
    concurrency: Math.max(4, Math.floor((await import("node:os")).cpus().length * 0.75)),
  });
}

function orderMapsEqual(a: Record<string, number>, b: Record<string, number>): boolean {
  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();
  if (keysA.length !== keysB.length) return false;
  for (let i = 0; i < keysA.length; i++) {
    if (keysA[i] !== keysB[i] || a[keysA[i]] !== b[keysB[i]]) return false;
  }
  return true;
}

function structureNodesEqual(a: StructureNodeSnapshot[], b: StructureNodeSnapshot[]): boolean {
  if (a.length !== b.length) return false;
  const byId = (nodes: StructureNodeSnapshot[]) =>
    [...nodes].sort((x, y) => x._id.localeCompare(y._id));
  const sortedA = byId(a);
  const sortedB = byId(b);
  for (let i = 0; i < sortedA.length; i++) {
    const sa = sortedA[i];
    const sb = sortedB[i];
    if (
      sa._id !== sb._id ||
      sa.path !== sb.path ||
      sa.name !== sb.name ||
      sa.nodeType !== sb.nodeType ||
      (sa.parentId ?? "") !== (sb.parentId ?? "") ||
      (sa.order ?? 0) !== (sb.order ?? 0)
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Compares manifest organizational metadata against the current DB flat structure.
 */
export async function detectOrganizationalDrift(
  tenantId?: string | null,
  adapter?: DatabaseAdapter,
): Promise<OrganizationalDriftReport> {
  const { contentService } = await import("./engine.server");
  const [manifestOrder, manifestStructure, dbNodes] = await Promise.all([
    getCollectionOrder(tenantId ?? null),
    getStructureNodes(tenantId ?? null),
    contentService.getContentStructureFromDatabase("flat", tenantId, adapter),
  ]);

  const expected = buildOrganizationalManifestFromNodes(dbNodes);
  const orderMismatch = !orderMapsEqual(manifestOrder, expected.order);
  const structureMismatch = !structureNodesEqual(manifestStructure, expected.structureNodes);

  return {
    drifted: orderMismatch || structureMismatch,
    orderMismatch,
    structureMismatch,
    reconciled: false,
  };
}

/**
 * Re-aligns manifest organizational metadata with DB when drift is detected (boot watchdog).
 */
export async function reconcileOrganizationalManifest(
  tenantId?: string | null,
  adapter?: DatabaseAdapter,
): Promise<OrganizationalDriftReport> {
  const report = await detectOrganizationalDrift(tenantId, adapter);
  if (!report.drifted) return report;

  const { contentService } = await import("./engine.server");
  const dbNodes = await contentService.getContentStructureFromDatabase("flat", tenantId, adapter);
  const { order, structureNodes } = buildOrganizationalManifestFromNodes(dbNodes);
  await setOrganizationalManifest(order, structureNodes, tenantId ?? null);

  logger.info(
    `[ContentSync] Organizational manifest reconciled from DB (orderMismatch=${report.orderMismatch}, structureMismatch=${report.structureMismatch})`,
  );

  return { ...report, reconciled: true };
}

async function applyGuiStructureSave(
  operations: ContentNodeOperation[],
  tenantId?: string | null,
  _adapter?: DatabaseAdapter,
): Promise<ContentNode[]> {
  const { contentService } = await import("./engine.server");

  const normalized: ContentNodeOperation[] = operations.map((op) => {
    if (op.node.nodeType === "category" && !op.node.source) {
      return { ...op, node: { ...op.node, source: "builder" as const } };
    }
    return op;
  });

  await contentService.upsertContentNodes(normalized, tenantId, _adapter);
  const updated = (await contentService.getContentStructureFromDatabase(
    "flat",
    tenantId,
    _adapter,
  )) as ContentNode[];

  contentStore.batchUpsert(updated);

  const { order, structureNodes } = buildOrganizationalManifestFromNodes(updated);
  await setOrganizationalManifest(order, structureNodes, tenantId ?? null);

  // Broadcast SSE event so other tabs/clients learn about the GUI change
  const { notifyContentUpdate } = await import("./engine.server");
  await notifyContentUpdate(tenantId);

  return updated;
}

/**
 * Unified content sync coordinator.
 */
export async function syncContentState(
  options: SyncContentStateOptions,
): Promise<SyncContentStateResult> {
  const {
    reason,
    tenantId = null,
    adapter,
    operations = [],
    changedFile = null,
    skipReconciliation = false,
  } = options;

  const result: SyncContentStateResult = {
    reason,
    drift: null,
    orgDrift: null,
    compiled: null,
  };

  if (reason === "boot" || reason === "compile") {
    result.drift = await detectCompilationDrift(tenantId);
    if (result.drift.drifted) {
      result.compiled = await ensureCompiledCollectionsFresh(tenantId);
    }
  }

  const { refreshContent } = await import("./engine.server");

  switch (reason) {
    case "gui-save": {
      if (!operations.length) {
        throw new Error("[ContentSync] gui-save requires at least one operation");
      }
      result.contentStructure = await applyGuiStructureSave(operations, tenantId, adapter);

      const { userCollections, compiledCollections } = resolvePathRoots(tenantId);
      result.compiled = await compile({
        userCollections,
        compiledCollections,
        tenantId,
      });

      return result;
    }

    case "watcher":
      await refreshContent(tenantId, {
        mode: "incremental",
        adapter,
        changedFile,
        skipReconciliation,
      });
      return result;

    case "sidebar-reorder":
      await refreshContent(tenantId, {
        mode: "schemas",
        adapter,
        skipReconciliation: true,
      });
      return result;

    case "compile":
      await refreshContent(tenantId, {
        mode: changedFile ? "incremental" : "full",
        adapter,
        changedFile,
        skipReconciliation,
      });
      return result;

    case "boot":
    default: {
      const { isLocalBenchmarkSandbox } = await import("@utils/benchmark-sandbox");
      if (!isLocalBenchmarkSandbox()) {
        result.orgDrift = await reconcileOrganizationalManifest(tenantId, adapter);
      }
      await refreshContent(tenantId, {
        mode: "full",
        adapter,
        skipReconciliation,
      });
      return result;
    }
  }
}
