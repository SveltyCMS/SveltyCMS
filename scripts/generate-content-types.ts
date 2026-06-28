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

// Define types locally to avoid circular dependencies
interface ProcessedField {
  name: string;
  type: string;
}

/**
 * Sanitizes a string for use as a TypeScript identifier.
 */
function sanitizeIdentifier(name: string): string {
  // If it's already a valid identifier, return it
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name)) return name;
  // Otherwise, wrap in quotes
  return `'${name}'`;
}

export async function generateContentTypes(
  server: ViteDevServer,
): Promise<Record<string, { fields: string[]; type: string }>> {
  try {
    // Load engine directly instead of full contentSystem to avoid full runtime boot (DB, Redis)
    const { scanCompiledCollections } = await server.ssrLoadModule(
      path.join(process.cwd(), "src/content/engine.server.ts"),
    );

    // Scan compiled collections directly from filesystem
    const collectionsData = await scanCompiledCollections();

    const contentTypes: Record<string, { fields: string[]; type: string }> = {};

    if (!(collectionsData && Array.isArray(collectionsData))) {
      throw new Error(`Invalid collections data: expected array, got ${typeof collectionsData}`);
    }

    /**
     * Recursively processes fields to generate high-fidelity TypeScript types.
     */
    function processFields(fields: any[], depth = 0): ProcessedField[] {
      if (depth > 5) return [{ name: "error", type: "any /* Recursion Limit */" }];

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
        let tsType = "any";

        // Logic refined for widgets and nested groups
        const widgetName = field.widget?.Name || field.type;

        if (widgetName === "Repeater" || widgetName === "group") {
          const nestedFields = field.fields || [];
          const nestedProcessed = processFields(nestedFields, depth + 1);
          const nestedType = `{ ${nestedProcessed.map((f) => `${f.name}: ${f.type}`).join("; ")} }`;
          tsType = widgetName === "Repeater" ? `${nestedType}[]` : nestedType;
        } else if (widgetName === "Select" && Array.isArray(field.options)) {
          tsType = field.options.map((o: any) => `'${o.value || o}'`).join(" | ");
        } else {
          tsType =
            typeMapping[field.type?.toLowerCase()] ||
            typeMapping[widgetName?.toLowerCase()] ||
            "string";
        }

        return { name: safeName, type: tsType };
      });
    }

    for (const collection of collectionsData) {
      if (!(collection?.fields && Array.isArray(collection.fields))) {
        logger.warn(`Collection ${collection?.name || "unknown"} has no valid fields array`);
        continue;
      }

      const processedFields = processFields(collection.fields);

      // Use collection name or _id as key
      const rawCollectionKey = collection.name || collection._id;
      const collectionKey = sanitizeIdentifier(String(rawCollectionKey));

      contentTypes[collectionKey] = {
        fields: processedFields.map((f) => f.name),
        // ✨ INTERSECTION: Join metadata with user fields
        type: `CollectionEntry & { ${processedFields.map((f) => `${f.name}: ${f.type}`).join("; ")} }`,
      };
    }

    const generatedPath = "src/content/types.generated.ts";

    // Ensure generated directory/file exists
    try {
      await fs.access(generatedPath);
    } catch {
      const template = `/**
 * @file src/content/types.generated.ts
 * @description Automatically generated collection and entry types for SveltyCMS.
 * This file is managed by the Vite build plugin and should NOT be edited manually.
 */

import type { DatabaseId, ISODateString, CollectionEntry } from "./types";

/* AUTOGEN_START: ContentTypes */
/* AUTOGEN_END: ContentTypes */`;
      await fs.writeFile(generatedPath, template);
    }

    // Read existing generated types file
    let types = await fs.readFile(generatedPath, "utf-8");

    // Generate new ContentTypes union and CollectionMap
    const collectionNames = Object.keys(contentTypes)
      .sort()
      .map((name) => (name.startsWith("'") ? name : `'${name}'`))
      .join(" | ");

    const collectionMapEntries = Object.entries(contentTypes)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, config]) => `  ${name}: ${config.type}`)
      .join(",\n");

    const newTypeDefinitionContent = `\nexport type ContentTypes = ${collectionNames ? collectionNames + " | " : ""}(string & {});\n\nexport interface CollectionMap {\n  [key: string]: CollectionEntry & Record<string, any>;\n${collectionMapEntries || ""}\n}\n`;

    const markerStart = "/* AUTOGEN_START: ContentTypes */";
    const markerEnd = "/* AUTOGEN_END: ContentTypes */";

    // Use Regex for robust replacement instead of indexOf (handles missing/duplicated markers safer)
    const regex = new RegExp(
      `(${markerStart.replace(/\*/g, "\\*")})[\\s\\S]*?(${markerEnd.replace(/\*/g, "\\*")})`,
    );

    if (regex.test(types)) {
      types = types.replace(regex, `$1${newTypeDefinitionContent}$2`);
    } else {
      logger.warn(`AUTOGEN markers not found in ${generatedPath}, recreating file context`);
      types = `${markerStart}${newTypeDefinitionContent}${markerEnd}`;
    }

    // Write updated generated types
    await fs.writeFile(generatedPath, types);

    logger.info(
      `Generated types for ${Object.keys(contentTypes).length} collections in ${generatedPath}`,
    );
    return contentTypes;
  } catch (error) {
    logger.error("Error generating collection types:", error);
    // Fix: Fallback to empty types instead of crashing Vite if possible
    return {};
  }
}
