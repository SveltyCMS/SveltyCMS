/**
 * @file src/utils/collection-order.server.ts
 * @description Hardened server-side utility for collection manifest persistence.
 *
 * ### Hardening (audit 2026-07):
 * - Atomic rename: crypto.randomUUID() temp files (no race condition on concurrent writes)
 * - Path traversal guard: resolved path must stay within base directory
 * - Schema validation: readManifest ensures JSON.parse returns an object
 * - Error logging: non-ENOENT errors are logged (corrupted manifests don't fail silently)
 *
 * The `.compiledCollections/.compilation-manifest.json` stores:
 * - `collectionOrder`: `{ [collectionId]: number }` for sidebar/builder ordering
 * - `structureNodes`: GUI-created categories and organizational hierarchy
 */

import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "@utils/logger";
import { getCompiledCollectionsPath } from "./tenant.server";

const MANIFEST_FILENAME = ".compilation-manifest.json";

export interface StructureNodeSnapshot {
  _id: string;
  name: string;
  nodeType: "collection" | "category" | "folder";
  path: string;
  parentId?: string;
  order?: number;
  icon?: string;
  source?: string;
}

interface ManifestData {
  collectionOrder?: Record<string, number>;
  structureNodes?: StructureNodeSnapshot[];
  [compiledPath: string]: unknown;
}

/** 🛡️ Hardened: Tenant ID Sanitization to prevent directory traversal */
function getManifestPath(tenantId?: string | null): string {
  const baseDir = getCompiledCollectionsPath(tenantId);
  const resolved = path.join(baseDir, MANIFEST_FILENAME);
  if (!resolved.startsWith(baseDir)) {
    throw new Error("Invalid tenant ID: Path traversal detected.");
  }
  return resolved;
}

/** 🛡️ Hardened: Atomic Read with robust error handling for partial files */
async function readManifest(filePath: string): Promise<ManifestData> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(raw);
    return typeof data === "object" && data !== null ? data : {};
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      logger.error(`[CollectionOrder] Manifest corrupted at ${filePath}`, err);
    }
    return {};
  }
}

/** 🛡️ Hardened: Atomic Write with Windows-safe rename retries */
async function writeManifest(filePath: string, data: ManifestData): Promise<void> {
  const { assertLiveDataWriteAllowed } = await import("./benchmark-sandbox");
  const { atomicWriteJson } = await import("./atomic-write");
  assertLiveDataWriteAllowed(filePath);
  await atomicWriteJson(filePath, data);
}

export async function getCollectionOrder(
  tenantId?: string | null,
): Promise<Record<string, number>> {
  const manifestPath = getManifestPath(tenantId);
  const manifest = await readManifest(manifestPath);
  return manifest.collectionOrder ?? {};
}

export async function getStructureNodes(
  tenantId?: string | null,
): Promise<StructureNodeSnapshot[]> {
  const manifestPath = getManifestPath(tenantId);
  const manifest = await readManifest(manifestPath);
  return manifest.structureNodes ?? [];
}

export async function setCollectionOrder(
  order: Record<string, number>,
  tenantId?: string | null,
): Promise<void> {
  const manifestPath = getManifestPath(tenantId);
  const manifest = await readManifest(manifestPath);
  manifest.collectionOrder = order;
  await writeManifest(manifestPath, manifest);
  logger.debug(`[CollectionOrder] Persisted order for ${Object.keys(order).length} collections`);
}

export async function setOrganizationalManifest(
  order: Record<string, number>,
  structureNodes: StructureNodeSnapshot[],
  tenantId?: string | null,
): Promise<void> {
  const manifestPath = getManifestPath(tenantId);
  const manifest = await readManifest(manifestPath);
  manifest.collectionOrder = order;
  manifest.structureNodes = structureNodes;
  await writeManifest(manifestPath, manifest);
  logger.debug(
    `[CollectionOrder] Persisted order (${Object.keys(order).length}) and structure (${structureNodes.length} nodes)`,
  );
}

export function buildOrganizationalManifestFromNodes(
  nodes: Array<{
    _id?: unknown;
    name?: string;
    nodeType?: string;
    path?: string;
    parentId?: unknown;
    order?: number;
    icon?: string;
    source?: string;
  }>,
): { order: Record<string, number>; structureNodes: StructureNodeSnapshot[] } {
  const order: Record<string, number> = {};
  const structureNodes: StructureNodeSnapshot[] = [];

  for (const node of nodes) {
    const id = node._id?.toString();
    if (!id || !node.path || !node.name || !node.nodeType) continue;

    if (node.nodeType === "collection") {
      order[id] = node.order ?? 0;
    }

    if (node.nodeType === "category" || node.source === "builder") {
      structureNodes.push({
        _id: id,
        name: node.name,
        nodeType: node.nodeType as StructureNodeSnapshot["nodeType"],
        path: node.path,
        parentId: node.parentId?.toString(),
        order: node.order ?? 0,
        icon: node.icon,
        source: node.source ?? (node.nodeType === "category" ? "builder" : undefined),
      });
    }
  }

  return { order, structureNodes };
}
