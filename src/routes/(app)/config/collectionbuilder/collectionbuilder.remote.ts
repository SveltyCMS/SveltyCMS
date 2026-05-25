/**
 * @file src/routes/(app)/config/collectionbuilder/collectionbuilder.remote.ts
 * @description Collection Builder Remote Functions — typed structure operations without JSON double-serialization.
 *
 * Replaces: JSON.parse(formData.get("items")) → direct typed ContentNode[] parameter.
 * Eliminates manual FormData packaging of large schema trees.
 */

import type { RequestEvent } from "@sveltejs/kit";
import { error, fail } from "@sveltejs/kit";
import { contentSystem } from "@src/content/index.server";
import { hasPermissionWithRoles } from "@src/databases/auth/permissions";
import { logger } from "@utils/logger";
import path from "node:path";
import fs from "node:fs";

export interface ContentNode {
  _id?: string;
  path: string;
  name: string;
  nodeType: "collection" | "category" | "folder";
  parentId?: string;
  order?: number;
  translations?: Record<string, unknown>[];
  [key: string]: unknown;
}

export interface UpsertOperation {
  type: "create" | "update" | "delete" | "move";
  node: ContentNode;
}

function requirePermission(event: RequestEvent) {
  const { user, roles: tenantRoles } = event.locals as any;
  if (!user) throw error(401, "Authentication required");
  if (!hasPermissionWithRoles(user, "config:collectionbuilder", tenantRoles))
    throw error(403, "Insufficient permissions");
}

export async function saveContentStructure(event: RequestEvent, operations: UpsertOperation[]) {
  requirePermission(event);
  const tenantId = (event.locals as any).tenantId;

  if (!(operations && Array.isArray(operations)))
    return fail(400, { message: "Invalid operations" });

  try {
    await contentSystem.upsertContentNodes(operations as any, tenantId);
    await contentSystem.refresh(tenantId);
    const updated = await contentSystem.getContentStructureFromDatabase("flat", tenantId);
    return { success: true, contentStructure: updated };
  } catch (err) {
    logger.error("Error saving structure:", err);
    return fail(500, { message: "Failed to save structure" });
  }
}

export async function deleteContentNodes(event: RequestEvent, ids: string[]) {
  requirePermission(event);
  const tenantId = (event.locals as any).tenantId;

  if (!(ids && Array.isArray(ids))) return fail(400, { message: "Invalid IDs" });

  try {
    const current = await contentSystem.getContentStructureFromDatabase("flat", tenantId);
    const paths = current
      .filter((n: any) => ids.includes(n._id?.toString()))
      .map((n: any) => n.path);

    const operations = paths.map((p: string) => ({
      type: "delete" as const,
      node: { path: p } as any,
    }));

    await contentSystem.upsertContentNodes(operations, tenantId);
    await contentSystem.refresh(tenantId);
    return { success: true };
  } catch (err) {
    logger.error("Error deleting nodes:", err);
    return fail(500, { message: "Failed to delete" });
  }
}

export async function installPreset(event: RequestEvent, presetId: string) {
  requirePermission(event);
  const tenantId = (event.locals as any).tenantId;

  if (!presetId || presetId === "blank") return fail(400, { message: "Invalid preset ID" });

  const presetDir = path.resolve(process.cwd(), "src", "presets", presetId);
  const expectedBase = path.resolve(process.cwd(), "src", "presets");

  if (!presetDir.startsWith(expectedBase) || !fs.existsSync(presetDir))
    return fail(404, { message: "Preset not found" });

  const targetDir = tenantId
    ? path.resolve(process.cwd(), "config", tenantId, "collections")
    : path.resolve(process.cwd(), "config", "collections");

  fs.mkdirSync(targetDir, { recursive: true });
  fs.cpSync(presetDir, targetDir, { recursive: true, force: true });

  await contentSystem.refresh(tenantId);
  return { success: true, message: `Preset ${presetId} installed` };
}
