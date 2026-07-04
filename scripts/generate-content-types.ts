/**
 * @file scripts/generate-content-types.ts
 * @description Vite plugin for generating TypeScript types for Content.
 *
 * Features:
 * - Generate TypeScript types for collections
 * - Write types to src/content/types.generated.ts
 * - Validate collection fields
 * - Generate proper TypeScript union types
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { logger } from "@utils/logger";
import type { ViteDevServer } from "vite";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GENERATED_PATH = path.join(process.cwd(), "src/content/types.generated.ts");

const AUTOGEN_START = "/* AUTOGEN_START: ContentTypes */";
const AUTOGEN_END = "/* AUTOGEN_END: ContentTypes */";

const FILE_TEMPLATE = `/**
 * @file src/content/types.generated.ts
 * @description Automatically generated collection and entry types for SveltyCMS.
 * This file is managed by the Vite build plugin and should NOT be edited manually.
 */

import type { DatabaseId, ISODateString, CollectionEntry } from "./types";

${AUTOGEN_START}
${AUTOGEN_END}`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProcessedField {
  name: string;
  type: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sanitizes a string for use as a TypeScript identifier.
 */
function sanitizeIdentifier(name: string): string {
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name)) return name;
  return `'${name}'`;
}

/**
 * Generates the AUTOGEN block content for a set of content types.
 */
function generateAutogenBlock(
  contentTypes: Record<string, { fields: string[]; type: string }>,
): string {
  const collectionNames = Object.keys(contentTypes)
    .sort()
    .map((name) => (name.startsWith("'") ? name : `'${name}'`))
    .join(" | ");

  const collectionMapEntries = Object.entries(contentTypes)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, config]) => `  ${name}: ${config.type}`)
    .join(",\n");

  return `\nexport type ContentTypes = ${collectionNames ? collectionNames + " | " : ""}(string & {});\n\nexport interface CollectionMap {\n  [key: string]: CollectionEntry & Record<string, any>;\n${collectionMapEntries || ""}\n}\n`;
}

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------

export async function generateContentTypes(
  server: ViteDevServer,
): Promise<Record<string, { fields: string[]; type: string }>> {
  try {
    const { scanCompiledCollections } = await server.ssrLoadModule(
      path.join(process.cwd(), "src/content/engine.server.ts"),
    );

    const collectionsData = await scanCompiledCollections();

    const contentTypes: Record<string, { fields: string[]; type: string }> = {};

    if (!collectionsData || !Array.isArray(collectionsData)) {
      throw new Error(
        `Invalid collections data: expected array, got ${collectionsData === null ? "null" : typeof collectionsData}`,
      );
    }

    /**
     * Recursively processes fields to generate high-fidelity TypeScript types.
     */
    function processFields(fields: any[], depth = 0): ProcessedField[] {
      if (depth > 5) return []; // Hard recursion guard — omit deeply nested fields

      const typeMapping: Record<string, string> = {
        date: "ISODateString",
        datetime: "ISODateString",
        number: "number",
        checkbox: "boolean",
        boolean: "boolean",
        text: "string",
        textarea: "string",
        richtext: "string",
        image: "string",
        file: "string",
        relation: "DatabaseId",
        select: "string",
        media: "string | string[]",
      };

      return fields.map((field: any) => {
        const rawName = field.db_fieldName || field.name || field.label;
        const safeName = sanitizeIdentifier(rawName || "field");

        // Normalize widget name to lowercase — ensures Repeater/repeater/REPEATER all match
        const widgetName = (field.widget?.Name || field.type || "").toLowerCase();

        if (widgetName === "repeater" || widgetName === "group") {
          const nestedFields = field.fields || [];
          const nestedProcessed = processFields(nestedFields, depth + 1);
          const nestedType = `{ ${nestedProcessed.map((f) => `${f.name}: ${f.type}`).join("; ")} }`;
          return {
            name: safeName,
            type: widgetName === "repeater" ? `${nestedType}[]` : nestedType,
          };
        }

        if (widgetName === "select" && Array.isArray(field.options)) {
          // Use JSON.stringify to safely escape any single quotes in option values
          const optionTypes = field.options
            .map((o: any) => JSON.stringify(String(o.value ?? o)))
            .join(" | ");
          return { name: safeName, type: optionTypes };
        }

        const tsType =
          typeMapping[field.type?.toLowerCase()] || typeMapping[widgetName] || "string";

        return { name: safeName, type: tsType };
      });
    }

    for (const collection of collectionsData) {
      if (!(collection?.fields && Array.isArray(collection.fields))) {
        logger.warn(`Collection ${collection?.name || "unknown"} has no valid fields array`);
        continue;
      }

      const processedFields = processFields(collection.fields);

      const rawCollectionKey = collection.name || collection._id;
      const collectionKey = sanitizeIdentifier(String(rawCollectionKey));

      contentTypes[collectionKey] = {
        fields: processedFields.map((f) => f.name),
        type: `CollectionEntry & { ${processedFields.map((f) => `${f.name}: ${f.type}`).join("; ")} }`,
      };
    }

    // Ensure generated file exists with proper template
    try {
      await fs.access(GENERATED_PATH);
    } catch {
      await fs.writeFile(GENERATED_PATH, FILE_TEMPLATE);
    }

    // Read existing file
    let fileContent = await fs.readFile(GENERATED_PATH, "utf-8");
    const newBlock = generateAutogenBlock(contentTypes);

    // Replace AUTOGEN block via regex
    const regex = new RegExp(
      `${AUTOGEN_START.replace(/\*/g, "\\*")}[\\s\\S]*?${AUTOGEN_END.replace(/\*/g, "\\*")}`,
    );

    if (regex.test(fileContent)) {
      fileContent = fileContent.replace(regex, `${AUTOGEN_START}${newBlock}${AUTOGEN_END}`);
    } else {
      // Markers missing — regenerate full template with imports intact
      logger.warn(`AUTOGEN markers not found in ${GENERATED_PATH}, regenerating full template`);
      fileContent = FILE_TEMPLATE.replace(
        `${AUTOGEN_START}\n${AUTOGEN_END}`,
        `${AUTOGEN_START}${newBlock}${AUTOGEN_END}`,
      );
    }

    await fs.writeFile(GENERATED_PATH, fileContent);

    logger.info(
      `Generated types for ${Object.keys(contentTypes).length} collections in ${GENERATED_PATH}`,
    );
    return contentTypes;
  } catch (error) {
    logger.error("Error generating collection types:", error);

    // In watch mode (HMR), write an error comment into the AUTOGEN block so
    // the staleness is visible at the point of use rather than silently stale.
    try {
      let fileContent = await fs.readFile(GENERATED_PATH, "utf-8").catch(() => FILE_TEMPLATE);
      const errorBlock = `\n// ❌ ERROR: types could not be regenerated — ${(error as Error).message}\n`;
      const regex = new RegExp(
        `${AUTOGEN_START.replace(/\*/g, "\\*")}[\\s\\S]*?${AUTOGEN_END.replace(/\*/g, "\\*")}`,
      );
      if (regex.test(fileContent)) {
        fileContent = fileContent.replace(regex, `${AUTOGEN_START}${errorBlock}${AUTOGEN_END}`);
      }
      await fs.writeFile(GENERATED_PATH, fileContent).catch(() => {});
    } catch {
      // Non-fatal — types file may not exist yet
    }

    return {};
  }
}
