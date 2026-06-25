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

export async function deleteContentNodes(
  event: RequestEvent,
  items: { id: string; path?: string }[],
) {
  requirePermission(event);
  const tenantId = (event.locals as any).tenantId;

  if (!(items && Array.isArray(items))) return fail(400, { message: "Invalid items" });

  try {
    // Use paths directly from client. If missing, fall back to DB lookup by _id.
    let paths: string[] = items.filter((i) => i.path).map((i) => i.path as string);
    if (paths.length < items.length) {
      const current = await contentSystem.getContentStructureFromDatabase("flat", tenantId);
      const itemIds = items.map((i) => i.id);
      for (const node of current) {
        const nodeId = (node as any)._id?.toString();
        if (nodeId && itemIds.includes(nodeId) && !paths.includes((node as any).path)) {
          paths.push((node as any).path);
        }
      }
    }

    // Delete compiled .js files so refresh() doesn't re-create them from disk
    deleteCompiledFiles(paths);

    const operations = paths.map((p: string) => ({
      type: "delete" as const,
      node: { path: p } as any,
    }));

    if (operations.length > 0) {
      await contentSystem.upsertContentNodes(operations, tenantId);
    }
    await contentSystem.refresh(tenantId);
    return { success: true };
  } catch (err) {
    logger.error("Error deleting nodes:", err);
    return fail(500, { message: "Failed to delete" });
  }
}

/**
 * Removes compiled .js files for deleted collections so refresh() won't re-create them.
 * Maps node path like `/collection/posts` to compiled file `.compiledCollections/posts.js`.
 */
function deleteCompiledFiles(paths: string[]): void {
  const compiledDir = path.resolve(process.cwd(), ".compiledCollections");
  if (!fs.existsSync(compiledDir)) return;

  const pathSet = new Set(paths.filter(Boolean));

  for (const p of paths) {
    if (!p) continue;
    let deleted = false;

    if (p.startsWith("/collection/")) {
      const relative = p.replace(/^\/collection\//, "");
      if (!relative) continue;

      // Try the full relative path: /collection/subdir/posts -> .compiledCollections/subdir/posts.js
      let filePath = path.join(compiledDir, `${relative}.js`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        deleted = true;
      } else {
        // Try just the basename for flat structure
        filePath = path.join(compiledDir, `${path.basename(relative)}.js`);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          deleted = true;
        }
      }
    }

    if (!deleted) {
      scanAndDeleteCompiledFile(compiledDir, pathSet);
    }
  }
}

/**
 * Recursively scan compiled directory for a .js file containing any of the given paths/ids.
 */
function scanAndDeleteCompiledFile(dir: string, paths: Set<string>): void {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        scanAndDeleteCompiledFile(path.join(dir, entry.name), paths);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".js") || entry.name.startsWith(".")) continue;
      const fullPath = path.join(dir, entry.name);
      try {
        const content = fs.readFileSync(fullPath, "utf-8");
        if (Array.from(paths).some((sp) => content.includes(sp))) {
          fs.unlinkSync(fullPath);
          logger.debug(`Deleted compiled file by content scan: ${entry.name}`);
          return;
        }
      } catch {
        // Skip unreadable files
      }
    }
  } catch {
    // Ignore directory read errors
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
      parts.push(`      ${f.db_fieldName}: widgets.${f.widget}({`);
      parts.push(`        label: "${f.label}",`);
      if (f.required) parts.push(`        required: true,`);
      if (f.translated) parts.push(`        translated: true,`);
      parts.push(`        helper: "${f.helper}",`);
      if (f.default !== undefined)
        parts.push(
          `        default: ${typeof f.default === "string" ? `"${f.default}"` : f.default},`,
        );
      if (f.options && f.options.length > 0) {
        if (f.options.includes("multiple")) {
          parts.push(`        multiple: true,`);
        }
      }
      parts.push(`      }),`);
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
