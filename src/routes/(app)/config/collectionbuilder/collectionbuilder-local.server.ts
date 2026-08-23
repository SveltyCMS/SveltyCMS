/**
 * @file src/routes/(app)/config/collectionbuilder/collectionbuilder-local.server.ts
 * @description LocalCMS bridge for Collection Builder structure operations (zero HTTP overhead).
 */

import { getDb } from "@src/databases/db";
import { LocalCMS } from "@src/services/sdk";
import type {
  ContentNode,
  ContentNodeInput,
  ContentNodeOperation,
  DatabaseId,
} from "@src/content/types";

let _cmsCache: { adapter: NonNullable<ReturnType<typeof getDb>>; cms: LocalCMS } | null = null;

export async function getCollectionBuilderCms(_tenantId: string | null): Promise<LocalCMS> {
  const adapter = await getDb();
  if (!adapter) throw new Error("[CollectionBuilder] Database adapter not initialized");
  if (_cmsCache && _cmsCache.adapter === adapter) return _cmsCache.cms;
  const { contentSystem } = await import("@src/content/index.server");
  const cms = new LocalCMS(adapter, contentSystem);
  _cmsCache = { adapter, cms };
  return cms;
}

export function serializeStructureNodes(
  nodes: Array<ContentNode | ContentNodeInput>,
): ContentNodeInput[] {
  return nodes.map((node) => {
    const serialized: ContentNodeInput = {
      path: node.path ?? "",
      name: node.name,
      nodeType: node.nodeType,
      order: node.order,
      source: node.source,
      icon: node.icon,
      description: node.description,
      translations: node.translations,
      _id: node._id?.toString(),
    };
    if (node.parentId) serialized.parentId = node.parentId.toString();
    const def = (node as { collectionDef?: Record<string, unknown> }).collectionDef;
    if (def && typeof def === "object") {
      serialized.collectionDef = {
        _id: (def._id as { toString?: () => string })?.toString?.() ?? def._id,
        name: def.name,
        path: def.path,
        icon: def.icon,
        slug: def.slug,
      };
    }
    return serialized;
  });
}

export async function executeGuiStructureSave(
  tenantId: string | null,
  operations: ContentNodeOperation[],
): Promise<{ success: true; contentStructure: ContentNodeInput[] }> {
  const cms = await getCollectionBuilderCms(tenantId);
  const syncResult = await cms.contentStructure.saveGuiStructure(operations, {
    tenantId: tenantId as DatabaseId | null,
  });
  // First collection may have moved/deleted — drop the memoized redirect path.
  const { invalidateFirstCollectionPathCache } =
    await import("@utils/server/collection-utils.server");
  invalidateFirstCollectionPathCache();
  const updated = syncResult.contentStructure ?? [];
  return { success: true, contentStructure: serializeStructureNodes(updated) };
}
