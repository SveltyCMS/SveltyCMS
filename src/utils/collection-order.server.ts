/**
 * @file src/utils/collection-order.server.ts
 * @description Server-side utility for persisting collection display order in the compilation manifest.
 *
 * The `.compiledCollections/.compilation-manifest.json` stores a top-level `collectionOrder`
 * map: `{ [collectionId]: number }`. This is the single source of truth for sidebar and
 * collection builder ordering — surviving restarts without touching the database.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "@utils/logger";

const MANIFEST_FILENAME = ".compilation-manifest.json";

interface ManifestData {
  collectionOrder?: Record<string, number>;
  [compiledPath: string]: unknown;
}

/**
 * Resolves the manifest path, supporting multi-tenant setups.
 */
function getManifestPath(tenantId?: string | null): string {
  const base = tenantId
    ? path.resolve(process.cwd(), ".compiledCollections", tenantId)
    : path.resolve(process.cwd(), ".compiledCollections");
  return path.join(base, MANIFEST_FILENAME);
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
