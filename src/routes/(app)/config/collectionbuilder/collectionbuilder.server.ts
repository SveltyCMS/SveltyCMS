/**
 * @file src/routes/(app)/config/collectionbuilder/collectionbuilder.server.ts
 * @description Collection Builder server functions — permission-gated remotes via LocalCMS.
 *
 * ### Features:
 * - `executeGuiStructureSave` — unified gui-save path (upsert, manifest, SSE)
 * - `saveContentStructure` — permission-gated remote for organizational ops
 * - Preset installation and collection duplication with content refresh
 */

import type { RequestEvent } from "@sveltejs/kit";
import { error, fail } from "@sveltejs/kit";
import fs from "node:fs/promises";
import path from "node:path";
import type { ContentNodeOperation, DatabaseId } from "@src/content/types";
import { hasCollectionBuilderPermission } from "@src/databases/auth/permissions";
import { logger } from "@utils/logger";
import { getAuthenticatedUser } from "@utils/page-guards.server";
import {
  executeGuiStructureSave,
  getCollectionBuilderCms,
  serializeStructureNodes,
} from "./collectionbuilder-local.server";
import { parseSchemaInput, type SchemaIngestionInput } from "./schema-ingestion";
import { parseOperations, validateStructureOperation } from "./collectionbuilder-utils";
import {
  createPrinter,
  createSourceFile,
  factory,
  forEachChild,
  isExportAssignment,
  isIdentifier,
  isObjectLiteralExpression,
  isPropertyAssignment,
  isStringLiteral,
  isVariableStatement,
  NewLineKind,
  ScriptKind,
  ScriptTarget,
  transform,
  visitEachChild,
  visitNode,
  type Node,
  type ObjectLiteralExpression,
  type PropertyAssignment,
  type SourceFile,
} from "typescript";

/** @deprecated Use `ContentNodeOperation` from `@src/content/types` */
export type UpsertOperation = ContentNodeOperation;

export { executeGuiStructureSave, serializeStructureNodes } from "./collectionbuilder-local.server";

function requirePermission(event: RequestEvent) {
  const user = getAuthenticatedUser(event.locals);
  const { roles: tenantRoles, isAdmin } = event.locals as App.Locals;
  if (!hasCollectionBuilderPermission(user, tenantRoles, isAdmin))
    throw error(403, "Insufficient permissions");
}

export async function saveContentStructure(
  event: RequestEvent,
  operations: ContentNodeOperation[],
) {
  requirePermission(event);
  const tenantId = (event.locals as App.Locals).tenantId ?? null;

  const parsed = parseOperations(operations);
  if (!parsed) return fail(400, { message: "Invalid operations" });

  // Minimum-viable guard: empty-name nodes persisted as unreachable tree junk
  // (the modal validates too, but remotes can be called directly).
  for (const op of parsed) {
    const nodeError = validateStructureOperation(op);
    if (nodeError) return fail(400, { message: nodeError });
  }

  try {
    return await executeGuiStructureSave(tenantId, parsed);
  } catch (err) {
    logger.error("Error saving structure:", err);
    return fail(500, { message: "Failed to save structure" });
  }
}

/** Shared preset installer — allowlisted ids only, no raw filesystem copy. */
export async function installPresetCollections(
  tenantId: string | null,
  presetId: string,
  opts?: { rejectDemo?: boolean },
) {
  if (!presetId || presetId === "blank" || (opts?.rejectDemo && presetId === "demo")) {
    return fail(400, { message: "Invalid preset ID" });
  }

  const { PRESETS } = await import("@src/routes/setup/presets");
  const preset = PRESETS.find((p) => p.id === presetId);

  if (!preset || !preset.collections || preset.collections.length === 0) {
    return fail(404, {
      message: `No collections defined for preset "${presetId}"`,
    });
  }

  const { writePresetCollectionFiles } =
    await import("@src/routes/setup/preset-collections.server");
  await writePresetCollectionFiles(preset.collections, { tenantId });

  const cms = await getCollectionBuilderCms(tenantId);
  await cms.content.refresh(tenantId);

  // A preset install can change which collection is "first" — drop the memoized
  // first-collection redirect so /login → collection navigation never goes stale.
  const { invalidateFirstCollectionPathCache } =
    await import("@utils/server/collection-utils.server");
  invalidateFirstCollectionPathCache();

  // Return the materialized structure so callers can adopt it directly. The
  // builder's page load does not depend on 'app:content', so invalidating alone
  // never refreshes `data.contentStructure` — the empty state would stay visible.
  const nodes =
    (await cms.contentStructure.getFlatStructure({ tenantId: tenantId as DatabaseId | null })) ??
    [];
  const created = preset.collections.map((c) => c.name);
  return {
    success: true,
    message: `Created ${created.length} collections: ${created.join(", ")}`,
    collections: created,
    contentStructure: serializeStructureNodes(nodes),
  };
}

export async function installTemplateCollections(event: RequestEvent, presetId: string) {
  requirePermission(event);
  const tenantId = (event.locals as App.Locals).tenantId ?? null;
  return installPresetCollections(tenantId, presetId, { rejectDemo: true });
}

/**
 * Server-side schema ingestion (SQL DDL / JSON sample → collection schema).
 *
 * Runs on the server so relation targets can be resolved against the live
 * collection list — a client-side parse cannot see it. Read-only: no writes.
 */
export async function parseSchemaIngestion(
  event: RequestEvent,
  input: SchemaIngestionInput,
): Promise<{ schema: ReturnType<typeof parseSchemaInput> | null; error: string | null }> {
  requirePermission(event);
  const tenantId = (event.locals as App.Locals).tenantId ?? null;

  let existingCollections: string[] = [];
  try {
    const cms = await getCollectionBuilderCms(tenantId);
    const nodes =
      (await cms.contentStructure.getFlatStructure({
        tenantId: tenantId as DatabaseId | null,
      })) ?? [];
    existingCollections = nodes
      .filter((node) => (node as { nodeType?: string }).nodeType !== "category")
      .map((node) => node.name)
      .filter((name): name is string => Boolean(name));
  } catch (err) {
    // Relation resolution is best-effort — never fail ingestion over it.
    logger.warn("[SchemaIngestion] Could not load collections for relation resolution:", err);
  }

  try {
    return { schema: parseSchemaInput({ ...input, existingCollections }), error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.debug("[SchemaIngestion] Parse rejected:", message);
    return { schema: null, error: message };
  }
}

/** Resolve the key of a schema property assignment (identifier or string literal). */
function propertyKey(prop: PropertyAssignment): string {
  if (isIdentifier(prop.name)) return prop.name.text;
  if (isStringLiteral(prop.name)) return prop.name.text;
  return "";
}

/**
 * Rewrite a collection source file's identity fields (`_id`, `name`, `label`,
 * `slug`) for a duplicated collection. Uses the TypeScript AST so the rewrite
 * only touches the root schema object — never a nested widget field's `label`.
 */
export function rewriteCollectionIdentity(source: string, newName: string): string {
  const slug = newName.replace(/_/g, "-");
  const identity: Record<string, string> = { _id: newName, name: newName, label: newName, slug };

  const sourceFile = createSourceFile(
    "collection.ts",
    source,
    ScriptTarget.Latest,
    true,
    ScriptKind.TS,
  );

  // Root schema object: `export default { … }` (preset) or `export const schema = { … }` (editor).
  let schemaObject: ObjectLiteralExpression | undefined;
  const locate = (node: Node): void => {
    if (schemaObject) return;
    if (isExportAssignment(node) && node.expression && isObjectLiteralExpression(node.expression)) {
      schemaObject = node.expression;
      return;
    }
    if (isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (
          isIdentifier(decl.name) &&
          decl.name.text === "schema" &&
          decl.initializer &&
          isObjectLiteralExpression(decl.initializer)
        ) {
          schemaObject = decl.initializer;
          return;
        }
      }
    }
    forEachChild(node, locate);
  };
  locate(sourceFile);

  if (!schemaObject) {
    throw new Error("Could not locate the collection schema object in the source file");
  }

  const nextProperties = schemaObject.properties.map((prop) => {
    if (!isPropertyAssignment(prop) || !isStringLiteral(prop.initializer)) return prop;
    const key = propertyKey(prop);
    if (key && key in identity) {
      return factory.updatePropertyAssignment(
        prop,
        prop.name,
        factory.createStringLiteral(identity[key]),
      );
    }
    return prop;
  });

  const nextSchema = factory.updateObjectLiteralExpression(
    schemaObject,
    factory.createNodeArray(nextProperties),
  );

  const result = transform(sourceFile, [
    (context) => {
      const visitor = (node: Node): Node => {
        if (node === schemaObject) return nextSchema;
        return visitEachChild(node, visitor, context);
      };
      return (root) => visitNode(root, visitor) as SourceFile;
    },
  ]);

  const printer = createPrinter({ newLine: NewLineKind.LineFeed });
  return printer.printFile(result.transformed[0]);
}

/**
 * Materialize a duplicated collection: copy the original `.ts` source and
 * rewrite its identity fields, then run the unified compile + refresh + models
 * coordinator. Files own collection existence (C1), so a builder duplicate must
 * produce a real source file — never a DB-only node.
 */
export async function duplicateCollectionSource(
  tenantId: string | null,
  originalName: string,
  newName: string,
) {
  const original = String(originalName ?? "").trim();
  const next = String(newName ?? "").trim();
  if (!original || !next) return fail(400, { message: "Collection names are required" });
  if (
    /[\\/]|\.\./.test(original) ||
    /[\\/]|\.\./.test(next) ||
    original.includes("\u0000") ||
    next.includes("\u0000")
  ) {
    return fail(400, { message: "Collection name contains invalid characters" });
  }

  const { getCollectionFilePath, getCollectionsPath } = await import("@utils/tenant.server");
  const collectionsRoot = getCollectionsPath(tenantId);
  const sourcePath = getCollectionFilePath(original, tenantId);
  const targetPath = getCollectionFilePath(next, tenantId);

  const relSource = path.relative(collectionsRoot, sourcePath);
  const relTarget = path.relative(collectionsRoot, targetPath);
  if (
    relSource.startsWith("..") ||
    relTarget.startsWith("..") ||
    path.isAbsolute(relSource) ||
    path.isAbsolute(relTarget)
  ) {
    return fail(400, { message: "Invalid collection path" });
  }

  let source: string;
  try {
    source = await fs.readFile(sourcePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return fail(404, { message: `Source collection "${original}" not found` });
    }
    throw err;
  }

  const targetExists = await fs
    .access(targetPath)
    .then(() => true)
    .catch(() => false);
  if (targetExists) {
    return fail(409, { message: `A collection named "${next}" already exists` });
  }

  try {
    const content = rewriteCollectionIdentity(source, next);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, content, "utf-8");

    const { syncContentState } = await import("@src/content/sync-content-state.server");
    await syncContentState({
      reason: "collection-save",
      tenantId,
      targetFile: path.basename(targetPath),
      changedFile: targetPath,
      // Targeted compile of the new file (no rename, so no full rebuild needed).
      fullBuild: false,
    });

    const cms = await getCollectionBuilderCms(tenantId);
    const nodes =
      (await cms.contentStructure.getFlatStructure({
        tenantId: tenantId as DatabaseId | null,
      })) ?? [];
    return {
      success: true,
      message: `Duplicated "${original}" as "${next}"`,
      contentStructure: serializeStructureNodes(nodes),
    };
  } catch (err) {
    // Best-effort cleanup so a failed duplicate never leaves a half-written file.
    await fs.unlink(targetPath).catch(() => {});
    logger.error("Error duplicating collection:", err);
    return fail(500, { message: "Failed to duplicate collection" });
  }
}

/** Permission-gated remote for duplicating a collection (source `.ts` copy). */
export async function duplicateCollection(
  event: RequestEvent,
  input: { originalName: string; newName: string },
) {
  requirePermission(event);
  const tenantId = (event.locals as App.Locals).tenantId ?? null;
  return duplicateCollectionSource(tenantId, input?.originalName, input?.newName);
}
