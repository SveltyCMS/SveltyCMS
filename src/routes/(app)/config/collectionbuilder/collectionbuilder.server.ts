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
import { hasCollectionBuilderPermission } from "@src/databases/auth/permissions";
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
  const { user, roles: tenantRoles, isAdmin } = event.locals as any;
  if (!user) throw error(401, "Authentication required");
  if (!hasCollectionBuilderPermission(user, tenantRoles, isAdmin))
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

  // Use presets.ts data — single source of truth for all preset definitions
  const { PRESETS } = await import("@src/routes/setup/presets");
  const preset = PRESETS.find((p) => p.id === presetId);

  if (!preset || !preset.collections || preset.collections.length === 0) {
    return fail(404, {
      message: `No collections defined for preset "${presetId}"`,
    });
  }

  const collectionsDir = tenantId
    ? path.resolve(process.cwd(), "config", tenantId, "collections")
    : path.resolve(process.cwd(), "config", "collections");

  fs.mkdirSync(collectionsDir, { recursive: true });

  const created: string[] = [];
  for (const collection of preset.collections) {
    const tsContent = generateCollectionTemplate(collection);
    const filePath = path.join(collectionsDir, `${collection.name}.ts`);
    fs.writeFileSync(filePath, tsContent, "utf-8");
    created.push(collection.name);
    logger.info(`Created collection template: ${collection.name}`);
  }

  // Compile the new .ts files so the content system can load them
  const { compile } = await import("@src/utils/compilation/compile");
  const compiledDir = tenantId
    ? path.resolve(process.cwd(), ".compiledCollections", tenantId)
    : path.resolve(process.cwd(), ".compiledCollections");
  await compile({
    userCollections: collectionsDir,
    compiledCollections: compiledDir,
  });

  await contentSystem.refresh(tenantId);
  return {
    success: true,
    message: `Created ${created.length} collections: ${created.join(", ")}`,
    collections: created,
  };
}

/**
 * Installs collection templates from a Quick-Start preset by creating
 * collection definition files and registering them with the content system.
 */
export async function installTemplateCollections(event: RequestEvent, presetId: string) {
  requirePermission(event);
  const tenantId = (event.locals as any).tenantId;

  if (!presetId || presetId === "blank" || presetId === "demo")
    return fail(400, { message: "Invalid preset ID" });

  // Dynamically import the preset definitions
  const { PRESETS } = await import("@src/routes/setup/presets");
  const preset = PRESETS.find((p) => p.id === presetId);

  if (!preset || !preset.collections || preset.collections.length === 0) {
    return fail(404, {
      message: `No collections defined for preset "${presetId}"`,
    });
  }

  const collectionsDir = tenantId
    ? path.resolve(process.cwd(), "config", tenantId, "collections")
    : path.resolve(process.cwd(), "config", "collections");

  fs.mkdirSync(collectionsDir, { recursive: true });

  const created: string[] = [];

  for (const collection of preset.collections) {
    const tsContent = generateCollectionTemplate(collection);
    const filePath = path.join(collectionsDir, `${collection.name}.ts`);
    fs.writeFileSync(filePath, tsContent, "utf-8");
    created.push(collection.name);
    logger.info(`Created collection template: ${collection.name}`);
  }

  // Compile the new .ts files to .compiledCollections/ so the content system can load them
  const { compile } = await import("@src/utils/compilation/compile");
  const compiledDir = tenantId
    ? path.resolve(process.cwd(), ".compiledCollections", tenantId)
    : path.resolve(process.cwd(), ".compiledCollections");
  await compile({
    userCollections: collectionsDir,
    compiledCollections: compiledDir,
  });

  // Trigger content system refresh to pick up the new collections
  await contentSystem.refresh(tenantId);

  return {
    success: true,
    message: `Created ${created.length} collections: ${created.join(", ")}`,
    collections: created,
  };
}

/**
 * Generates a TypeScript collection definition file from a CollectionPreset template.
 */
function generateCollectionTemplate(collection: {
  name: string;
  label: string;
  description: string;
  fields: Array<{
    db_fieldName: string;
    label: string;
    widget: string;
    required: boolean;
    translated: boolean;
    helper: string;
    default?: unknown;
    options?: string[];
  }>;
}): string {
  const fieldEntries = collection.fields
    .map((f) => {
      const parts: string[] = [];
      parts.push(`    {`);
      parts.push(`      db_fieldName: "${f.db_fieldName}",`);
      parts.push(`      label: "${f.label}",`);
      parts.push(
        `      widget: { Name: "${f.widget.charAt(0).toUpperCase() + f.widget.slice(1)}" },`,
      );
      if (f.required) parts.push(`      required: true,`);
      if (f.translated) parts.push(`      translated: true,`);
      parts.push(`      helper: "${f.helper}",`);
      if (f.default !== undefined)
        parts.push(
          `      default: ${typeof f.default === "string" ? `"${f.default}"` : f.default},`,
        );
      if (f.options && f.options.length > 0) {
        parts.push(`      options: [${f.options.map((o) => `"${o}"`).join(", ")}],`);
      }
      parts.push(`    },`);
      return parts.join("\n");
    })
    .join("\n");

  return `/**
 * @file config/collections/${collection.name}.ts
 * @description ${collection.label} — ${collection.description}
 * Auto-generated from Quick-Start Template.
 */

import { widgets } from "@src/widgets";

export default {
  name: "${collection.name}",
  label: "${collection.label}",
  description: "${collection.description}",
  fields: [
${fieldEntries}
  ],
};
`;
}
