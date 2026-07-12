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

export async function getCollectionBuilderCms(_tenantId: string | null): Promise<LocalCMS> {
  const adapter = await getDb();
  if (!adapter) throw new Error("[CollectionBuilder] Database adapter not initialized");
  const { contentSystem } = await import("@src/content/index.server");
  return new LocalCMS(adapter, contentSystem);
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
  const updated = syncResult.contentStructure ?? [];
  return { success: true, contentStructure: serializeStructureNodes(updated) };
}
