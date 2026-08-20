/**
 * @file src/content/sync-content-state.server.ts
 * @description Unified content synchronization entry for boot, compile drift, GUI saves, and HMR.
 *
 * ### Features:
 * - `detectCompilationDrift` — mtime prefilter + manifest sourceHash confirm
 * - `ensureCompiledCollectionsFresh` — compile only when drift detected
 * - `detectOrganizationalDrift` / `reconcileOrganizationalManifest`
 * - GUI ↔ watcher **compile lock** (dedupe double compile after builder save)
 * - Watcher path: **compile → surgical refresh → model provision → metrics**
 * - Structured HMR payload fields (`changedIds`, `changedNodes`, `contentVersion`, `noOp`)
 * - Path roots always via `tenant.server` (`getCollectionsPath` / `getCompiledCollectionsPath`)
 *
 * ### Reasons:
 * `boot` | `compile` | `gui-save` | `watcher` | `sidebar-reorder` | `collection-save`
 */

import fs from "node:fs/promises";
import path from "node:path";
import { xxhash64 } from "hash-wasm";
import type { DatabaseAdapter } from "@src/databases/db-interface";
import type { ContentNode, ContentNodeOperation, Schema } from "./types";
import { getSchemaPath } from "./first-collection";
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
import { getCollectionsPath, getCompiledCollectionsPath } from "@utils/tenant.server";
import { contentStore } from "@stores/content-registry.svelte";
import { shouldRequireLayoutInvalidate } from "./content-hmr";

export type SyncContentReason =
  | "boot"
  | "compile"
  | "gui-save"
  | "watcher"
  | "sidebar-reorder"
  | "collection-save";

export interface CompilationDriftReport {
  drifted: boolean;
  driftedFiles: string[];
  checked: number;
  /** Files that looked drifted by mtime but matched manifest hash (false positives avoided) */
  hashConfirmedFresh?: number;
}

export interface SyncContentStateOptions {
  reason: SyncContentReason;
  tenantId?: string | null;
  adapter?: DatabaseAdapter;
  operations?: ContentNodeOperation[];
  /** Absolute or relative path of the changed source/compiled file */
  changedFile?: string | null;
  /**
   * Relative path under userCollections for single-file compile
   * (e.g. `posts.ts`). Ignored when `fullBuild` is true.
   */
  targetFile?: string | null;
  /** Force full compile (delete/rename/multi-file). Default false for watcher. */
  fullBuild?: boolean;
  skipReconciliation?: boolean;
}

export interface OrganizationalDriftReport {
  drifted: boolean;
  orderMismatch: boolean;
  structureMismatch: boolean;
  reconciled: boolean;
}

export interface SyncContentMetrics {
  totalMs: number;
  compileMs: number;
  refreshMs: number;
  modelMs: number;
  processed: number;
  skipped: number;
  orphaned: number;
}

export interface SyncContentStateResult {
  reason: SyncContentReason;
  drift: CompilationDriftReport | null;
  orgDrift: OrganizationalDriftReport | null;
  compiled: CompilationResult | null;
  contentStructure?: ContentNode[];
  /** Schema / node ids touched this sync */
  changedIds: string[];
  /**
   * Serializable nodes for surgical client HMR (omit large fullBuilds).
   * Client can batchUpsert without `invalidate("app:content")`.
   */
  changedNodes: ContentNode[];
  /** When true, clients must full-invalidate layout (new/orphan/fullBuild) */
  requiresLayoutInvalidate: boolean;
  contentVersion: number;
  /** True when compile+refresh produced no material change */
  noOp: boolean;
  /** Watcher skipped because GUI compile session owns the lock */
  skippedByDedupe: boolean;
  metrics: SyncContentMetrics;
}

interface PathRoots {
  userCollections: string;
  compiledCollections: string;
}

/** Max nodes embedded in HMR WS payload (prevents huge messages) */
const HMR_NODE_PAYLOAD_LIMIT = 20;

// ─── GUI ↔ watcher compile lock ─────────────────────────────────────────
// Builder saves write `.ts` which re-fires the Vite watcher. The lock
// suppresses the redundant watcher compile for a short cooldown window.

type CompileLockOwner = "gui" | "watcher" | "boot" | "compile";

interface CompileLock {
  owner: CompileLockOwner;
  generation: number;
  /** Epoch ms — lock suppresses competing watcher syncs until this time */
  until: number;
  /** Optional relative file keys (basenames) the session owns; watcher skips only these */
  files?: string[];
}

let _lockGeneration = 0;
let _compileLock: CompileLock | null = null;

const GUI_LOCK_TTL_MS = 2_500;
const GUI_COOLDOWN_MS = 450;

/** Options for beginGuiCompileSession */
export interface BeginCompileSessionOptions {
  ttlMs?: number;
  /** Relative file keys the GUI session writes — watcher skips only these */
  files?: string[];
}

/** Normalize a path to a comparable basename key (lowercased, extension stripped). */
function normalizeFileKey(file: string): string {
  const name = file.replace(/\\/g, "/").split("/").pop()?.toLowerCase() ?? "";
  // Strip .ts/.js so a GUI save key ('posts.ts') matches the file-watcher echo
  // for the compiled output ('posts.js') — otherwise dedupe always misses.
  return name.replace(/\.(ts|js)$/i, "");
}

/**
 * Begin a GUI-owned compile session. Watcher syncs skip while held + cooldown.
 * Returns a generation token for `endGuiCompileSession` / `releaseGuiCompileSession`.
 *
 * When `files` are provided the lock is file-keyed: watcher events for OTHER
 * files still compile (external edits are never silently dropped). Without
 * files (structure renames/deletes) the lock is a blanket session.
 */
export function beginGuiCompileSession(
  ttlOrOpts: number | BeginCompileSessionOptions = GUI_LOCK_TTL_MS,
): number {
  const opts: BeginCompileSessionOptions =
    typeof ttlOrOpts === "number" ? { ttlMs: ttlOrOpts } : ttlOrOpts;
  _lockGeneration += 1;
  _compileLock = {
    owner: "gui",
    generation: _lockGeneration,
    until: Date.now() + (opts.ttlMs ?? GUI_LOCK_TTL_MS),
    ...(opts.files?.length ? { files: opts.files.map(normalizeFileKey) } : {}),
  };
  return _lockGeneration;
}

/**
 * End a GUI compile session. Extends a short cooldown so chokidar events
 * from the same write are still suppressed. `until` extends from the lock's
 * current expiry (not now) so long compiles can't let the watcher run a
 * concurrent compile of the same file mid-session.
 */
export function endGuiCompileSession(generation: number, cooldownMs = GUI_COOLDOWN_MS): void {
  if (_compileLock?.generation === generation) {
    _compileLock = {
      owner: "gui",
      generation,
      until: Math.max(_compileLock.until, Date.now()) + cooldownMs,
      files: _compileLock.files,
    };
  }
}

/**
 * Abandon a GUI session WITHOUT cooldown (compile failed). The watcher event
 * for the same write is then allowed to retry the failed compile immediately.
 */
export function releaseGuiCompileSession(generation: number): void {
  if (_compileLock?.generation === generation) {
    _compileLock = null;
  }
}

/**
 * True when a watcher event for the given file should be skipped because a
 * GUI session owns it. File-keyed locks only suppress matching files; blanket
 * sessions suppress everything while held. Expired locks are cleared lazily.
 */
export function shouldSkipWatcherSync(
  targetFile?: string | null,
  changedFile?: string | null,
): boolean {
  if (!_compileLock) return false;
  if (_compileLock.until <= Date.now()) {
    _compileLock = null;
    return false;
  }
  if (_compileLock.owner !== "gui") return false;
  if (!_compileLock.files?.length) return true; // blanket session
  const incoming = normalizeFileKey(targetFile ?? changedFile ?? "");
  return incoming !== "" && _compileLock.files.includes(incoming);
}

/**
 * Resolve user + compiled roots via tenant.server helpers.
 * Supports flat `config/collections`, nested `config/{tenant}/collections`,
 * COLLECTIONS_DIR override, and sandbox/test harness paths.
 */
function resolvePathRoots(tenantId?: string | null): PathRoots {
  return {
    userCollections: path.resolve(getCollectionsPath(tenantId)),
    compiledCollections: path.resolve(getCompiledCollectionsPath(tenantId)),
  };
}

function emptyMetrics(): SyncContentMetrics {
  return {
    totalMs: 0,
    compileMs: 0,
    refreshMs: 0,
    modelMs: 0,
    processed: 0,
    skipped: 0,
    orphaned: 0,
  };
}

function baseResult(reason: SyncContentReason): SyncContentStateResult {
  return {
    reason,
    drift: null,
    orgDrift: null,
    compiled: null,
    changedIds: [],
    changedNodes: [],
    requiresLayoutInvalidate: false,
    contentVersion: contentStore.contentVersion,
    noOp: false,
    skippedByDedupe: false,
    metrics: emptyMetrics(),
  };
}

/**
 * Build serializable ContentNodes for HMR from store + changed ids.
 */
function collectChangedNodesForHmr(
  changedIds: string[],
  tenantId?: string | null,
): { nodes: ContentNode[]; hasNewCollections: boolean } {
  const nodes: ContentNode[] = [];
  let hasNewCollections = false;

  for (const id of changedIds) {
    if (nodes.length >= HMR_NODE_PAYLOAD_LIMIT) break;

    const existingNode =
      contentStore.getNode(id) ||
      contentStore.getNodeByPath(`/collection/${id}`) ||
      contentStore.getNodeByPath(`/collection/${id.toLowerCase()}`);

    let schema: Schema | undefined =
      existingNode?.collectionDef || contentStore.getCollection(id, tenantId);

    if (!existingNode && !schema) {
      hasNewCollections = true;
    }

    if (existingNode?.collectionDef) {
      nodes.push(structuredCloneSafe(existingNode));
      continue;
    }

    if (schema) {
      const node: ContentNode = {
        _id: (schema._id || id) as ContentNode["_id"],
        name: String(schema.name || id),
        path: getSchemaPath(schema),
        nodeType: "collection",
        collectionDef: schema,
        icon: schema.icon || "mdi:database",
        order: schema.order ?? 999,
        translations: schema.translations || [],
        tenantId: (schema.tenantId ?? tenantId ?? undefined) as ContentNode["tenantId"],
        source: "filesystem",
        createdAt:
          existingNode?.createdAt || (new Date().toISOString() as ContentNode["createdAt"]),
        updatedAt: new Date().toISOString() as ContentNode["updatedAt"],
      };
      nodes.push(structuredCloneSafe(node));
    }
  }

  return { nodes, hasNewCollections };
}

function structuredCloneSafe<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}

function attachHmrNodes(
  result: SyncContentStateResult,
  options: { fullBuild?: boolean; tenantId?: string | null },
): void {
  if (result.noOp || result.changedIds.length === 0) {
    result.changedNodes = [];
    result.requiresLayoutInvalidate = false;
    return;
  }

  const { nodes, hasNewCollections } = collectChangedNodesForHmr(
    result.changedIds,
    options.tenantId,
  );
  result.changedNodes = nodes;
  // When more ids changed than fit in the WS payload, clients would never
  // learn about the tail — force a layout invalidate instead of a partial patch.
  const exceededPayloadCap = result.changedIds.length > nodes.length;
  result.requiresLayoutInvalidate =
    shouldRequireLayoutInvalidate({
      fullBuild: options.fullBuild,
      orphanedCount: result.metrics.orphaned,
      hasNewCollections,
    }) || exceededPayloadCap;
}

async function listSourceCollectionFiles(userCollections: string): Promise<string[]> {
  const files: string[] = [];
  // Hoisted: resolved once per scan — importing inside walk() re-resolved the
  // modules for every subdirectory visited.
  const { isBenchmarkRuntime } = await import("@utils/benchmark-runtime");
  const { isBenchmarkRelativePath } = await import("@utils/benchmark-paths");
  const benchRuntime = isBenchmarkRuntime();

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
        if (!benchRuntime && (entry.name === "test-collections" || isBenchmarkRelativePath(rel))) {
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
 * Load sourceHash map from compilation manifest (relative sourcePath → hash).
 */
async function loadManifestSourceHashes(compiledCollections: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const manifestPath = path.join(compiledCollections, ".compilation-manifest.json");
  try {
    const raw = JSON.parse(await fs.readFile(manifestPath, "utf8")) as Record<string, unknown>;
    for (const [key, value] of Object.entries(raw)) {
      if (key.startsWith("__") || key === "collectionOrder" || key === "structureNodes") continue;
      if (
        value &&
        typeof value === "object" &&
        "sourcePath" in value &&
        "sourceHash" in value &&
        typeof (value as { sourcePath: unknown }).sourcePath === "string" &&
        typeof (value as { sourceHash: unknown }).sourceHash === "string"
      ) {
        const entry = value as { sourcePath: string; sourceHash: string };
        map.set(entry.sourcePath.replace(/\\/g, "/"), entry.sourceHash);
      }
    }
  } catch {
    /* no manifest yet */
  }
  return map;
}

/**
 * Detects source files that need recompile.
 * mtime is a cheap prefilter; matching manifest sourceHash cancels false positives.
 */
export async function detectCompilationDrift(
  tenantId?: string | null,
): Promise<CompilationDriftReport> {
  const { userCollections, compiledCollections } = resolvePathRoots(tenantId);
  const sources = await listSourceCollectionFiles(userCollections);
  const driftedFiles: string[] = [];
  let hashConfirmedFresh = 0;
  const hashMap = await loadManifestSourceHashes(compiledCollections);

  for (const relativeSource of sources) {
    const sourcePath = path.join(userCollections, relativeSource);
    const jsName = relativeSource.replace(/\.(ts|js)$/i, ".js");
    const compiledPath = path.join(compiledCollections, jsName);

    try {
      const [sourceStat, compiledStat] = await Promise.all([
        fs.stat(sourcePath),
        fs.stat(compiledPath).catch(() => null),
      ]);

      if (!compiledStat) {
        driftedFiles.push(relativeSource);
        continue;
      }

      if (sourceStat.mtimeMs <= compiledStat.mtimeMs + 1) {
        continue; // clearly fresh by mtime
      }

      // mtime says source is newer — confirm with content hash when available
      const knownHash = hashMap.get(relativeSource.replace(/\\/g, "/"));
      if (knownHash) {
        try {
          const content = await fs.readFile(sourcePath, "utf8");
          const sourceHash = await xxhash64(content);
          if (sourceHash === knownHash) {
            hashConfirmedFresh++;
            continue;
          }
        } catch {
          /* fall through to drift */
        }
      }

      driftedFiles.push(relativeSource);
    } catch {
      driftedFiles.push(relativeSource);
    }
  }

  return {
    drifted: driftedFiles.length > 0,
    driftedFiles,
    checked: sources.length,
    hashConfirmedFresh,
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
  logger.debug(
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

  logger.debug(
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
 * Resolve relative targetFile under userCollections from a watcher absolute path.
 */
function toRelativeSource(
  changedFile: string | null | undefined,
  userCollections: string,
): string | undefined {
  if (!changedFile) return undefined;
  const abs = path.resolve(changedFile);
  const root = path.resolve(userCollections);
  if (!abs.toLowerCase().startsWith(root.toLowerCase())) {
    // Already relative?
    if (!path.isAbsolute(changedFile) && /\.(ts|js)$/i.test(changedFile)) {
      return changedFile.replace(/\\/g, "/");
    }
    return undefined;
  }
  return path.relative(root, abs).replace(/\\/g, "/");
}

/**
 * Map compiled .js paths → collection ids. Subfolder schemas (blog/posts.js)
 * must map to the engine-generated auto-id (blog_posts) — basename-only
 * produced mismatched ids that broke surgical client HMR lookups.
 */
function idsFromJsPaths(jsPaths: string[], compiledCollectionsDir?: string): string[] {
  const root = compiledCollectionsDir ? path.resolve(compiledCollectionsDir) : "";
  return jsPaths.map((p) => {
    const abs = path.resolve(p);
    if (root && abs.toLowerCase().startsWith(root.toLowerCase())) {
      const rel = path.relative(root, abs);
      return rel.replace(/\.js$/i, "").replace(/[\\/]/g, "_").toLowerCase();
    }
    return path.basename(p, ".js").toLowerCase();
  });
}

/**
 * Compile + incremental refresh shared by watcher and collection-save.
 * Physical models are provisioned inside `handleIncrementalReload` / fullReload
 * (diff-only, bulk when available) — no separate createModel loop here.
 */
async function compileAndRefresh(
  result: SyncContentStateResult,
  options: {
    tenantId?: string | null;
    adapter?: DatabaseAdapter;
    targetFile?: string | null;
    fullBuild?: boolean;
    changedFile?: string | null;
    skipReconciliation?: boolean;
  },
): Promise<void> {
  const { userCollections, compiledCollections } = resolvePathRoots(options.tenantId);
  const relativeTarget =
    options.targetFile || toRelativeSource(options.changedFile, userCollections);
  const useTarget = !options.fullBuild && !!relativeTarget;

  const compileStart = Date.now();
  result.compiled = await compile({
    userCollections,
    compiledCollections,
    tenantId: options.tenantId,
    targetFile: useTarget ? relativeTarget! : undefined,
  });
  result.metrics.compileMs = Date.now() - compileStart;
  result.metrics.processed = result.compiled.processed;
  result.metrics.skipped = result.compiled.skipped;
  result.metrics.orphaned = result.compiled.orphanedFiles.length;

  if (result.compiled.noOp) {
    result.noOp = true;
    result.changedIds = [];
    result.contentVersion = contentStore.contentVersion;
    return;
  }

  const { markFileDirty, invalidateScanCache, refreshContent } = await import("./engine.server");
  invalidateScanCache();

  for (const js of result.compiled.changedJsPaths) {
    markFileDirty(js);
  }
  for (const orphan of result.compiled.orphanedFiles) {
    markFileDirty(orphan);
  }

  const refreshStart = Date.now();
  const singleJs =
    result.compiled.changedJsPaths.length === 1 ? result.compiled.changedJsPaths[0] : null;

  if (singleJs && result.compiled.orphanedFiles.length === 0) {
    await refreshContent(options.tenantId, {
      mode: "incremental",
      adapter: options.adapter,
      changedFile: singleJs,
      skipReconciliation: options.skipReconciliation,
    });
  } else if (
    result.compiled.changedJsPaths.length > 0 ||
    result.compiled.orphanedFiles.length > 0
  ) {
    // Multi-file or orphans: process dirty set, full reload if orphans
    const { contentService } = await import("./engine.server");
    await contentService.processChangedFiles(options.tenantId, options.adapter, {
      requireFullReload: result.compiled.orphanedFiles.length > 0 || options.fullBuild === true,
    });
  } else {
    await refreshContent(options.tenantId, {
      mode: "full",
      adapter: options.adapter,
      skipReconciliation: options.skipReconciliation,
    });
  }
  // modelMs ≈ refresh time for incremental (createModel runs inside handleIncrementalReload)
  result.metrics.refreshMs = Date.now() - refreshStart;
  result.metrics.modelMs = result.metrics.refreshMs;

  result.changedIds = idsFromJsPaths(result.compiled.changedJsPaths, compiledCollections);
  result.contentVersion = contentStore.contentVersion;
  result.noOp = false;
  attachHmrNodes(result, {
    fullBuild: options.fullBuild,
    tenantId: options.tenantId,
  });
}

/**
 * Unified content sync coordinator.
 */
export async function syncContentState(
  options: SyncContentStateOptions,
): Promise<SyncContentStateResult> {
  const totalStart = Date.now();
  const {
    reason,
    tenantId = null,
    adapter,
    operations = [],
    changedFile = null,
    targetFile = null,
    fullBuild = false,
    skipReconciliation = false,
  } = options;

  const result = baseResult(reason);

  // Watcher dedupe: GUI save already compiled + refreshed. File-keyed so
  // external edits to OTHER files still compile during the GUI window.
  if (reason === "watcher" && shouldSkipWatcherSync(targetFile, changedFile)) {
    result.skippedByDedupe = true;
    result.noOp = true;
    result.metrics.totalMs = Date.now() - totalStart;
    logger.info("[ContentSync] Watcher sync skipped (GUI compile session active)");
    return result;
  }

  if (reason === "boot" || reason === "compile") {
    result.drift = await detectCompilationDrift(tenantId);
    if (result.drift.drifted) {
      const compileStart = Date.now();
      result.compiled = await ensureCompiledCollectionsFresh(tenantId);
      result.metrics.compileMs = Date.now() - compileStart;
      if (result.compiled) {
        result.metrics.processed = result.compiled.processed;
        result.metrics.skipped = result.compiled.skipped;
      }
    }
  }

  const { refreshContent } = await import("./engine.server");

  // Track success so a failed compile RELEASES the lock (no cooldown) and
  // lets the watcher retry the same write instead of suppressing it.
  let ok = false;

  switch (reason) {
    case "gui-save": {
      if (!operations.length) {
        throw new Error("[ContentSync] gui-save requires at least one operation");
      }
      const gen = beginGuiCompileSession(); // blanket session (structure ops)
      try {
        result.contentStructure = await applyGuiStructureSave(operations, tenantId, adapter);
        result.changedIds = result.contentStructure
          .map((n) => (n._id as string) || n.name || "")
          .filter(Boolean);

        const { userCollections, compiledCollections } = resolvePathRoots(tenantId);
        const compileStart = Date.now();
        result.compiled = await compile({
          userCollections,
          compiledCollections,
          tenantId,
        });
        result.metrics.compileMs = Date.now() - compileStart;
        result.metrics.processed = result.compiled.processed;
        result.metrics.skipped = result.compiled.skipped;
        result.contentVersion = contentStore.contentVersion;
        ok = true;
      } finally {
        if (ok) endGuiCompileSession(gen);
        else releaseGuiCompileSession(gen);
      }
      break;
    }

    case "collection-save": {
      // File-keyed lock: only the written file's watcher echo is suppressed.
      const gen = beginGuiCompileSession({ files: targetFile ? [targetFile] : undefined });
      try {
        await compileAndRefresh(result, {
          tenantId,
          adapter,
          targetFile,
          fullBuild: fullBuild || !targetFile,
          changedFile,
          skipReconciliation,
        });
        ok = true;
      } finally {
        if (ok) endGuiCompileSession(gen);
        else releaseGuiCompileSession(gen);
      }
      break;
    }

    case "watcher": {
      await compileAndRefresh(result, {
        tenantId,
        adapter,
        targetFile,
        fullBuild,
        changedFile,
        skipReconciliation,
      });
      break;
    }

    case "sidebar-reorder":
      await refreshContent(tenantId, {
        mode: "schemas",
        adapter,
        skipReconciliation: true,
      });
      result.contentVersion = contentStore.contentVersion;
      break;

    case "compile": {
      if (targetFile || changedFile) {
        await compileAndRefresh(result, {
          tenantId,
          adapter,
          targetFile,
          fullBuild,
          changedFile,
          skipReconciliation,
        });
      } else {
        const refreshStart = Date.now();
        await refreshContent(tenantId, {
          mode: "full",
          adapter,
          skipReconciliation,
        });
        result.metrics.refreshMs = Date.now() - refreshStart;
        result.contentVersion = contentStore.contentVersion;
      }
      break;
    }

    case "boot":
    default: {
      const { isLocalBenchmarkSandbox } = await import("@utils/benchmark-sandbox");
      if (!isLocalBenchmarkSandbox()) {
        result.orgDrift = await reconcileOrganizationalManifest(tenantId, adapter);
      }
      const refreshStart = Date.now();
      // Mode defaults inside refreshContent are benchmark-aware (schemas for
      // BENCHMARK/TEST_MODE servers) so DB-created collections bootstrap config
      // files instead of being pruned as orphans.
      await refreshContent(tenantId, {
        adapter,
        skipReconciliation,
      });
      result.metrics.refreshMs = Date.now() - refreshStart;
      result.contentVersion = contentStore.contentVersion;
      break;
    }
  }

  result.metrics.totalMs = Date.now() - totalStart;
  if (result.metrics.totalMs > 50 || !result.noOp) {
    logger.debug(
      `[ContentSync] ${reason}: ${result.metrics.totalMs}ms (compile=${result.metrics.compileMs} refresh=${result.metrics.refreshMs} models=${result.metrics.modelMs}) processed=${result.metrics.processed} noOp=${result.noOp} dedupe=${result.skippedByDedupe}`,
    );
  }
  return result;
}
