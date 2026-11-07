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

import fs from "node:fs/promises";
import path from "node:path";
import type { Schema } from "@src/content/types";
import { DEFAULT_REVISION_LIMIT } from "@src/content/revision-defaults";
import type { CollectionPreset, FieldTemplate } from "./presets";
import { PRESETS } from "./presets";
import { logger } from "@utils/logger";
import { isAutomatedTestHarness } from "@utils/private-config-policy";
import { isBenchmarkArtifact, normalizeCollectionId } from "@utils/benchmark-runtime";

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
 * Fail-closed guard for the setup/preset writer. Test-aware resolution alone is
 * not enough: a future caller (or a `COLLECTIONS_DIR` override) can point back
 * at the live tree, so a harness must refuse before any purge or write.
 */
export function assertHarnessCollectionsWritable(targetDir: string): void {
  if (!isAutomatedTestHarness()) return;
  const live = path.normalize(path.resolve(process.cwd(), "config", "collections"));
  const target = path.normalize(path.resolve(targetDir));
  if (target === live || target.startsWith(`${live}${path.sep}`)) {
    throw new Error(
      `[LiveDataGuard] Automated harness refused to write live collections at '${path.relative(process.cwd(), target)}'. ` +
        "Use config/test-collections/ (paths.getCollections()) only.",
    );
  }
}

/**
 * Removes benchmark debris from config/collections and .compiledCollections.
 * @returns Number of files removed.
 */
export async function purgeBenchmarkCollectionArtifacts(options?: {
  wipeAllSource?: boolean;
  /** Directory the caller is about to write; defaults to the active (test-aware) dir. */
  collectionsDir?: string;
}): Promise<number> {
  const { USER_COMPILED_DIR, cleanupAllBenchmarkWorkspaces } =
    await import("@utils/benchmark-paths");
  const { paths } = await import("@utils/path-resolver");

  // `paths.collections` is the LIVE directory regardless of TEST_MODE. A setup
  // completion (including the E2E wizard) must purge the directory it is about
  // to write to, or it deletes the developer's real collection files.
  const sourceDir = options?.collectionsDir ?? paths.getCollections();
  assertHarnessCollectionsWritable(sourceDir);
  const compiledDir = isAutomatedTestHarness() ? paths.getCompiledCollections() : USER_COMPILED_DIR;

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
          await fs.rm(path.join(dir, entry.name), {
            recursive: true,
            force: true,
          });
          removed++;
        }
        continue;
      }
      if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".js")) continue;
      if (wipeAll || isBenchmarkArtifact(entry.name)) {
        await fs.unlink(path.join(dir, entry.name)).catch(() => {});
        removed++;
      }
    }
  }

  await purgeRootArtifacts(sourceDir, !!options?.wipeAllSource);
  await purgeRootArtifacts(compiledDir, false);

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

/** Preset field → schema field, including repeater rows and relation targets. */
function fieldToSchemaField(field: FieldTemplate): Record<string, unknown> {
  const schemaField: Record<string, unknown> = {
    db_fieldName: field.db_fieldName,
    label: field.label,
    widget: { Name: resolveWidgetName(field) },
    type: TYPE_BY_FIELD[field.type] || "string",
  };
  if (field.required) schemaField.required = true;
  if (field.translated) schemaField.translated = true;
  if (field.helper) schemaField.helper = field.helper;
  if (field.default !== undefined) schemaField.default = field.default;
  if (field.min !== undefined) schemaField.min = field.min;
  if (field.max !== undefined) schemaField.max = field.max;
  if (field.type === "select" && field.options?.length) schemaField.options = field.options;
  if (field.collection) schemaField.collection = field.collection;
  if (field.displayField) schemaField.displayField = field.displayField;
  if (field.multiple) schemaField.multiple = true;
  if (field.type === "repeater" && field.fields?.length) {
    schemaField.fields = field.fields.map((child) => fieldToSchemaField(child));
  }
  return schemaField;
}

/**
 * Converts a CollectionPreset template into a database Schema object.
 *
 * Presets model authored content, so revision history defaults to **on**; a
 * preset opts out explicitly (`revision: false`) for structural/transactional
 * tables. The limit is pinned so the seeded schema and the generated `.ts` file
 * agree with what the editor shows on the Define tab.
 */
export function collectionPresetToSchema(collection: CollectionPreset, order?: number): Schema {
  const revision = collection.revision ?? true;
  const schema: Schema = {
    _id: collection.name,
    name: collection.label,
    slug: collection.name,
    icon: collection.icon,
    description: collection.description,
    order: collection.order ?? order,
    fields: collection.fields.map((field) => fieldToSchemaField(field)),
    revision,
  } as Schema;

  if (revision) {
    schema.revisionLimit = collection.revisionLimit ?? DEFAULT_REVISION_LIMIT;
  }
  if (collection.livePreview !== undefined) {
    (schema as Schema).livePreview = collection.livePreview;
  }
  if (collection.plugins?.length) {
    (schema as Schema).plugins = collection.plugins;
  }

  return schema;
}

function quoteSource(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** One preset field as TypeScript object source. `indent` is the brace column. */
function emitFieldSource(field: FieldTemplate, indent: number): string {
  const pad = " ".repeat(indent);
  const inner = " ".repeat(indent + 2);
  const lines = [
    `${pad}{`,
    `${inner}db_fieldName: ${quoteSource(field.db_fieldName)},`,
    `${inner}label: ${quoteSource(field.label)},`,
    `${inner}widget: { Name: ${quoteSource(resolveWidgetName(field))} },`,
  ];
  if (field.required) lines.push(`${inner}required: true,`);
  if (field.translated) lines.push(`${inner}translated: true,`);
  lines.push(`${inner}helper: ${quoteSource(field.helper)},`);
  if (field.default !== undefined) {
    const literal =
      typeof field.default === "string" ? quoteSource(field.default) : String(field.default);
    lines.push(`${inner}default: ${literal},`);
  }
  if (field.min !== undefined) lines.push(`${inner}min: ${field.min},`);
  if (field.max !== undefined) lines.push(`${inner}max: ${field.max},`);
  if (field.type === "select" && field.options?.length) {
    lines.push(
      `${inner}options: [${field.options.map((option) => quoteSource(option)).join(", ")}],`,
    );
  }
  if (field.collection) lines.push(`${inner}collection: ${quoteSource(field.collection)},`);
  if (field.displayField) lines.push(`${inner}displayField: ${quoteSource(field.displayField)},`);
  if (field.multiple) lines.push(`${inner}multiple: true,`);
  if (field.type === "repeater" && field.fields?.length) {
    const children = field.fields.map((child) => emitFieldSource(child, indent + 4)).join("\n");
    lines.push(`${inner}fields: [`, children, `${inner}],`);
  }
  lines.push(`${pad}},`);
  return lines.join("\n");
}

/**
 * Generates a TypeScript collection definition file from a CollectionPreset template.
 */
export function generateCollectionFileContent(
  collection: CollectionPreset,
  order?: number,
): string {
  const fieldEntries = collection.fields.map((field) => emitFieldSource(field, 4)).join("\n");
  const revision = collection.revision ?? true;
  // Mirror `collectionPresetToSchema`: the file and the seeded node must carry
  // the same history flags, or the first save from the builder would flip them.
  const revisionProps = revision
    ? `\n  revision: true,\n  revisionLimit: ${collection.revisionLimit ?? DEFAULT_REVISION_LIMIT},`
    : "";

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
  icon: "${collection.icon}",
  order: ${collection.order ?? order ?? 999},${revisionProps}${collection.livePreview !== undefined ? `\n  livePreview: ${typeof collection.livePreview === "string" ? `"${collection.livePreview}"` : collection.livePreview},` : ""}${collection.plugins?.length ? `\n  plugins: ${JSON.stringify(collection.plugins)},` : ""}
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
    return preset.collections.map((collection, index) =>
      collectionPresetToSchema(collection, index),
    );
  }

  // Benchmark / demo presets keep using seed.ts definitions
  const { PRESET_COLLECTIONS } = await import("./seed");
  return (PRESET_COLLECTIONS[presetId] || []).map((schema, index) => ({
    ...schema,
    order: schema.order ?? index,
  }));
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
  const { getCollectionsPath, getCompiledCollectionsPath } = await import("@utils/tenant.server");

  const dir = getCollectionsPath(options.tenantId);

  await fs.mkdir(dir, { recursive: true });

  // A harness must never touch the live tree, even if the resolved dir drifts.
  assertHarnessCollectionsWritable(dir);

  if (options.replaceAll) {
    await purgeBenchmarkCollectionArtifacts({ wipeAllSource: true, collectionsDir: dir });
  }

  for (const [index, collection] of collections.entries()) {
    const fileName = `${collection.name}.ts`;
    const content = generateCollectionFileContent(collection, index);
    await fs.writeFile(path.join(dir, fileName), content, "utf-8");
    logger.info(`📄 Wrote collection file: config/collections/${fileName}`);
  }

  try {
    const { compile } = await import("@utils/compilation/compile");
    const compiledDir = getCompiledCollectionsPath(options.tenantId);
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
