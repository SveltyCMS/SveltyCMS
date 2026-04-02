/**
 * @file src/routes/api/content/nodes/+server.ts
 * @description Thin API wrapper for fetching node children delegating to Local SDK.
 */

import { json } from "@sveltejs/kit";
import { apiHandler } from "@utils/api-handler";
import { AppError } from "@utils/error-handling";

export const GET = apiHandler(async ({ url, locals }) => {
  const { tenantId, cms } = locals;
  const parentId = url.searchParams.get("parentId");

  if (!parentId) throw new AppError("parentId is required", 400);
  if (!cms) throw new AppError("CMS not initialized", 500);

  const children = await cms.collections.getNodeChildren(parentId, tenantId);

  return json({
    success: true,
    nodes: children.map((node: any) => ({
      _id: node._id,
      name: node.name,
      path: node.path,
      icon: node.icon,
      nodeType: node.nodeType,
      order: node.order,
      parentId: node.parentId,
      translations: node.translations,
      hasChildren: !!node.children?.length,
    })),
  });
});
