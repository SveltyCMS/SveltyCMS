/**
 * @file src/routes/setup/preset-collections.server.ts
 * @description Shared preset collection utilities for the setup wizard and Collection Builder.
 *
 * Single source of truth: `presets.ts` defines wizard presets; `seed.ts` PRESET_COLLECTIONS
 * remains for benchmark/demo-only schemas.
 *
 * ### Features:
 * - CollectionPreset → Schema conversion for database seeding
 * - TypeScript collection file generation (widgets-aware)
 * - Filesystem write + compile pipeline for setup completion
 */

import type { Schema } from "@src/content/types";
import type { CollectionPreset, FieldTemplate } from "./presets";
import { PRESETS } from "./presets";
import { logger } from "@utils/logger";
import {
  isBenchmarkArtifact,
  isBenchmarkRuntime,
  normalizeCollectionId,
} from "@utils/benchmark-runtime";

export { isBenchmarkArtifact, isBenchmarkRuntime, normalizeCollectionId };

/**
 * Content-scan / scale-stress debris that must never bloat the GraphQL schema,
 * even when BENCHMARK=true (matrix server loads 150+ mock files otherwise → HTTP 500).
 */
export function isMockScanCollection(id: string, displayName?: string): boolean {
  const lower = id.toLowerCase();
  const name = displayName ?? "";
  const norm = normalizeCollectionId(id);
  const normName = name ? normalizeCollectionId(name) : "";
  return (
    lower.startsWith("mock-") ||
    lower.startsWith("mock_") ||
    norm.startsWith("mockcollection") ||
    normName.startsWith("mockcollection") ||
    id.includes("Mock Collection") ||
    name.includes("Mock Collection") ||
    lower.startsWith("stress_") ||
    lower.startsWith("stress-")
  );
}

/**
 * Removes benchmark debris from config/collections and .compiledCollections.
 * @returns Number of files removed.
 */
export async function purgeBenchmarkCollectionArtifacts(options?: {
  wipeAllSource?: boolean;
}): Promise<number> {
  const pathMod = await import("node:path");
  const fs = await import("node:fs/promises");
  const { USER_COLLECTIONS_DIR, USER_COMPILED_DIR, cleanupAllBenchmarkWorkspaces } =
    await import("@utils/benchmark-paths");

  let removed = await cleanupAllBenchmarkWorkspaces();

  async function purgeRootArtifacts(dir: string, wipeAll: boolean): Promise<void> {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        // Only recurse into test-collections/ (handled by cleanupAllBenchmarkWorkspaces) or full wipe
        if (entry.name === "test-collections") continue;
        if (wipeAll) {
          await fs.rm(pathMod.join(dir, entry.name), {
            recursive: true,
            force: true,
          });
          removed++;
        }
        continue;
      }
      if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".js")) continue;
      if (wipeAll || isBenchmarkArtifact(entry.name)) {
        await fs.unlink(pathMod.join(dir, entry.name)).catch(() => {});
        removed++;
      }
    }
  }

  await purgeRootArtifacts(USER_COLLECTIONS_DIR, !!options?.wipeAllSource);
  await purgeRootArtifacts(USER_COMPILED_DIR, false);

  const { purgeBenchmarkDatabaseArtifacts } = await import("@utils/benchmark-db-purge");
  const dbResult = await purgeBenchmarkDatabaseArtifacts();
  removed += dbResult.tablesDropped + dbResult.nodesDeleted + dbResult.tempDbsRemoved;

  if (removed > 0) {
    logger.info(`🧹 Purged ${removed} benchmark/stale collection artifact(s)`);
  }
  return removed;
}

/**
 * Maps preset FieldTemplate.type → factory widget Name.
 * Must match createWidget({ Name }) in src/widgets/core|custom.
 */
const WIDGET_NAME_BY_TYPE: Record<string, string> = {
  input: "Input",
  textarea: "Input",
  richtext: "RichText",
  slug: "Slug",
  image: "MediaUpload",
  file: "MediaUpload",
  reference: "Relation",
  number: "Number",
  select: "Select",
  seo: "SEO",
  repeater: "Repeater",
  date: "DateTime",
  boolean: "Checkbox",
  tags: "Tags",
};

const TYPE_BY_FIELD: Record<string, string> = {
  input: "string",
  textarea: "string",
  richtext: "string",
  slug: "string",
  image: "string",
  file: "string",
  reference: "string",
  number: "number",
  select: "string",
  seo: "object",
  repeater: "object",
  date: "string",
  boolean: "boolean",
  tags: "array",
};

/** Resolve preset field → factory widget Name (e.g. RichText, MediaUpload, SEO). */
function resolveWidgetName(field: FieldTemplate): string {
  if (field.type && WIDGET_NAME_BY_TYPE[field.type]) {
    return WIDGET_NAME_BY_TYPE[field.type];
  }
  // field.widget in presets is often a loose string; map known folder-style values
  const w = (field.widget || "").toLowerCase();
  if (w === "media-upload" || w === "mediaupload") return "MediaUpload";
  if (w === "rich-text" || w === "richtext") return "RichText";
  if (w === "date-time" || w === "datetime") return "DateTime";
  if (w === "seo") return "SEO";
  if (w === "text" || w === "textarea") return "Input";
  if (w === "relation" || w === "reference") return "Relation";
  // PascalCase-from-kebab last resort for custom widgets already using folder names
  if (field.widget?.includes("-")) {
    return field.widget
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("");
  }
  if (field.widget) {
    return field.widget.charAt(0).toUpperCase() + field.widget.slice(1);
  }
  return "Input";
}

/**
 * Converts a CollectionPreset template into a database Schema object.
 */
export function collectionPresetToSchema(collection: CollectionPreset): Schema {
  const schema: Schema = {
    _id: collection.name,
    name: collection.label,
    slug: collection.name,
    icon: collection.icon,
    description: collection.description,
    fields: collection.fields.map((field) => {
      const schemaField: Record<string, unknown> = {
        db_fieldName: field.db_fieldName,
        label: field.label,
        widget: { Name: resolveWidgetName(field) },
        type: TYPE_BY_FIELD[field.type] || "string",
      };
      if (field.required) schemaField.required = true;
      if (field.translated) schemaField.translated = true;
      if (field.options?.length) schemaField.options = field.options;
      return schemaField;
    }),
  } as Schema;

  if (collection.livePreview !== undefined) {
    (schema as Schema).livePreview = collection.livePreview;
  }
  if (collection.plugins?.length) {
    (schema as Schema).plugins = collection.plugins;
  }

  return schema;
}

/**
 * Generates a TypeScript collection definition file from a CollectionPreset template.
 */
export function generateCollectionFileContent(collection: CollectionPreset): string {
  const fieldEntries = collection.fields
    .map((f) => {
      const widgetName = resolveWidgetName(f);
      const parts: string[] = [];
      parts.push(`    {`);
      parts.push(`      db_fieldName: "${f.db_fieldName}",`);
      parts.push(`      label: "${f.label}",`);
      parts.push(`      widget: { Name: "${widgetName}" },`);
      if (f.required) parts.push(`      required: true,`);
      if (f.translated) parts.push(`      translated: true,`);
      parts.push(`      helper: "${f.helper}",`);
      if (f.default !== undefined) {
        parts.push(
          `      default: ${typeof f.default === "string" ? `"${f.default}"` : f.default},`,
        );
      }
      if (f.options?.length) {
        parts.push(`      options: [${f.options.map((o) => `"${o}"`).join(", ")}],`);
      }
      parts.push(`    },`);
      return parts.join("\n");
    })
    .join("\n");

  return `/**
 * @file config/collections/${collection.name}.ts
 * @description ${collection.label} — ${collection.description}
 * Auto-generated from setup preset.
 */

export default {
  _id: "${collection.name}",
  name: "${collection.name}",
  label: "${collection.label}",
  description: "${collection.description}",
  icon: "${collection.icon}",${collection.livePreview !== undefined ? `\n  livePreview: ${typeof collection.livePreview === "string" ? `"${collection.livePreview}"` : collection.livePreview},` : ""}${collection.plugins?.length ? `\n  plugins: ${JSON.stringify(collection.plugins)},` : ""}
  fields: [
${fieldEntries}
  ],
};
`;
}

/**
 * Resolves preset schemas for the setup wizard (blog, agency, etc.).
 * Falls back to benchmark PRESET_COLLECTIONS for demo/benchmark presets.
 */
export async function getWizardPresetSchemas(presetId: string): Promise<Schema[]> {
  const preset = PRESETS.find((p) => p.id === presetId);
  if (preset?.collections?.length) {
    return preset.collections.map(collectionPresetToSchema);
  }

  // Benchmark / demo presets keep using seed.ts definitions
  const { PRESET_COLLECTIONS } = await import("./seed");
  return PRESET_COLLECTIONS[presetId] || [];
}

export interface WritePresetFilesOptions {
  /** Wipe existing .ts/.js files in config/collections before writing (fresh setup). */
  replaceAll?: boolean;
  tenantId?: string | null;
}

/**
 * Writes preset collection .ts files and compiles them to .compiledCollections/.
 */
export async function writePresetCollectionFiles(
  collections: CollectionPreset[],
  options: WritePresetFilesOptions = {},
): Promise<void> {
  const path = await import("node:path");
  const fs = await import("node:fs/promises");
  const { getCollectionsPath, getCompiledCollectionsPath } = await import("@utils/tenant.server");

  const dir = getCollectionsPath(options.tenantId);

  await fs.mkdir(dir, { recursive: true });

  if (options.replaceAll) {
    await purgeBenchmarkCollectionArtifacts({ wipeAllSource: true });
  }

  for (const collection of collections) {
    const fileName = `${collection.name}.ts`;
    const content = generateCollectionFileContent(collection);
    await fs.writeFile(path.join(dir, fileName), content, "utf-8");
    logger.info(`📄 Wrote collection file: config/collections/${fileName}`);
  }

  try {
    const { compile } = await import("@utils/compilation/compile");
    const compiledDir = options.tenantId
      ? getCompiledCollectionsPath(options.tenantId)
      : path.resolve(process.cwd(), ".compiledCollections");
    await compile({
      userCollections: dir,
      compiledCollections: compiledDir,
      tenantId: options.tenantId ?? undefined,
    });
    logger.info(`[Preset] Compiled ${collections.length} collection(s) to ${compiledDir}`);
  } catch (e) {
    logger.error("[Preset] Compilation after preset file write failed:", e);
    throw e; // Re-throw so callers know compilation failed
  }
}
