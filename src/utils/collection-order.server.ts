/**
 * @file src/utils/collection-order.server.ts
 * @description Server-side utility for persisting collection organization in the compilation manifest.
 *
 * The `.compiledCollections/.compilation-manifest.json` stores:
 * - `collectionOrder`: `{ [collectionId]: number }` for sidebar/builder ordering
 * - `structureNodes`: GUI-created categories and organizational hierarchy (survives restarts)
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

/**
 * Resolves the manifest path, supporting multi-tenant setups.
 */
function getManifestPath(tenantId?: string | null): string {
  return path.join(getCompiledCollectionsPath(tenantId), MANIFEST_FILENAME);
}

/**
 * Reads the manifest file and returns parsed JSON.
 */
async function readManifest(filePath: string): Promise<ManifestData> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as ManifestData;
  } catch {
    return {};
  }
}

/**
 * Writes the manifest back to disk atomically.
 */
async function writeManifest(filePath: string, data: ManifestData): Promise<void> {
  const { assertLiveDataWriteAllowed } = await import("./benchmark-sandbox");
  assertLiveDataWriteAllowed(filePath);
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = filePath + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(tmp, filePath);
}

/**
 * Returns the current collection order map from the manifest.
 * Falls back to an empty object if no order has been persisted.
 */
export async function getCollectionOrder(
  tenantId?: string | null,
): Promise<Record<string, number>> {
  const manifestPath = getManifestPath(tenantId);
  const manifest = await readManifest(manifestPath);
  return manifest.collectionOrder ?? {};
}

/**
 * Returns GUI-persisted structure nodes (categories and organizational hierarchy).
 */
export async function getStructureNodes(
  tenantId?: string | null,
): Promise<StructureNodeSnapshot[]> {
  const manifestPath = getManifestPath(tenantId);
  const manifest = await readManifest(manifestPath);
  return manifest.structureNodes ?? [];
}

/**
 * Persists the collection order map to the manifest.
 * Merges with existing manifest data — only touches the `collectionOrder` key.
 */
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

/**
 * Persists order + organizational structure to the manifest.
 * Used by Collection Builder after drag-and-drop or category changes.
 */
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

/**
 * Builds manifest snapshots from flat content nodes.
 */
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
