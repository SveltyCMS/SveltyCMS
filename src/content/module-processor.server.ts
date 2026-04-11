/**
 * @file src/content/module-processor.server.ts
 * @description
 * High-performance module processor for content collection definitions.
 * Marked as .server.ts to ensure it never leaks to the client bundle.
 */
import { widgetRegistryService } from "@src/services/widget-registry-service";
import { logger } from "@utils/logger.server";
import type { Schema } from "./types";

/**
 * Safely parses a compiled collection JS module string.
 * Uses a Function constructor sandbox to extract the schema object.
 */
export async function processModule(content: string): Promise<{ schema?: Schema } | null> {
  try {
    // Support both 'export const schema =', 'export default <name>' (variable reference), and 'export default {' (inline object)
    const schemaMatch = content.match(/export\s+const\s+schema\s*=\s*/);
    const defaultMatch = content.match(/export\s+default\s+/);

    const match = schemaMatch || defaultMatch;
    if (!match) {
      logger.warn("No schema or default export found in module");
      return null;
    }

    const startIdx = match.index! + match[0].length;
    let schemaContent = "";

    // Check if what follows the export is a variable name (like 'Authors') or an object literal
    const potentialVarName = content.substring(startIdx, startIdx + 50).trim();
    if (/^[a-zA-Z_$][a-zA-Z0-9_$]*;?$/.test(potentialVarName.replace(/;$/, ""))) {
      // It's a variable reference (e.g., 'export default Authors;')
      // Extract the variable name
      const varName = potentialVarName.replace(/;$/, "").trim();
      logger.debug(`Found default export reference: ${varName}`);

      // Find the variable definition in the content
      // Handle TypeScript: const Authors: Schema = {...} or JavaScript: const Authors = {...}
      const varDefMatch = content.match(
        new RegExp(`(?:const|let|var|function)\\s+${varName}(?::[^,=]*)?\\s*[=:]\\s*`),
      );
      if (varDefMatch) {
        const varStartIdx = varDefMatch.index! + varDefMatch[0].length;
        let braceCount = 0;
        let vEndIdx = varStartIdx;
        let foundStart = false;

        for (let i = varStartIdx; i < content.length; i++) {
          const c = content[i];
          if (!foundStart) {
            if (c === "{") {
              foundStart = true;
              braceCount = 1;
              vEndIdx = i + 1;
            }
            continue;
          }
          if (c === "{") braceCount++;
          else if (c === "}") {
            braceCount--;
            if (braceCount === 0) {
              vEndIdx = i + 1;
              break;
            }
          }
        }
        schemaContent = content.substring(varStartIdx, vEndIdx);
        logger.debug(
          `Extracted schema object for ${varName}: ${schemaContent.substring(0, 80)}...`,
        );
      } else {
        logger.warn(`Could not find definition for variable: ${varName}`);
        return null;
      }
    } else {
      // It's an inline object (e.g., 'export default {')
      // Find the schema object by brace matching
      const firstBrace = content.indexOf("{", startIdx);
      let endIdx: number;
      if (firstBrace === -1) {
        const semi = content.indexOf(";", startIdx);
        endIdx = semi === -1 ? content.length : semi;
      } else {
        endIdx = content.length;
        let depth = 0;
        let inString: string | null = null;
        for (let i = firstBrace; i < content.length; i++) {
          const c = content[i];
          if (inString) {
            if (c === inString && content[i - 1] !== "\\") inString = null;
            continue;
          }
          if (c === '"' || c === "'" || c === "`") {
            inString = c;
            continue;
          }
          if (c === "{") depth++;
          else if (c === "}") {
            depth--;
            if (depth === 0) {
              endIdx = i + 1;
              break;
            }
          }
        }
      }

      schemaContent = content.substring(startIdx, endIdx).trim();
    }

    if (!schemaContent || schemaContent === "") {
      logger.warn("Could not extract schema content");
      return null;
    }

    const widgetsMap = await widgetRegistryService.getAllWidgets();
    const widgetsObject = Object.fromEntries(widgetsMap.entries());

    // Create a case-insensitive proxy for widgets to handle things like widgets.Seo vs widgets.SEO
    const widgetsProxy = new Proxy(widgetsObject, {
      get(target, prop) {
        if (typeof prop !== "string") return undefined;

        // Try exact match first
        if (prop in target) return target[prop];

        // Case-insensitive lookup
        const lowerProp = prop.toLowerCase();
        const entry = Object.entries(target).find(([key]) => key.toLowerCase() === lowerProp);

        if (entry) {
          logger.debug(
            `Mapped missing widget "${prop}" to "${entry[0]}" via case-insensitive proxy`,
          );
          return entry[1];
        }

        return undefined;
      },
    });

    // Ensure globalThis.widgets is available for the module evaluation
    const globalObj = globalThis as any;
    const originalWidgets = globalObj.widgets;
    globalObj.widgets = widgetsProxy;

    let result: any = null;
    try {
      logger.debug(`Executing module function...`);
      const moduleContent = `return (function() { const widgets = globalThis.widgets; return ${schemaContent}; })();`;
      const moduleFunc = new Function(moduleContent);
      result = moduleFunc();
      logger.debug(
        `Module evaluation complete. Result type: ${typeof result}, keys: ${result ? Object.keys(result).join(", ") : "none"}`,
      );

      if (result && typeof result === "object" && "fields" in result) {
        // Ensure _id is present (either from code or generated)
        if (!result._id && result.name) {
          result._id = result.name.toLowerCase();
        }
        return { schema: result as Schema };
      }
    } finally {
      // Restore globalThis state
      globalObj.widgets = originalWidgets;
    }

    logger.warn(`Module processed but no valid fields or _id found. Result type: ${typeof result}`);
    return null;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error("Failed to process module:", { error: errorMessage });
    return null;
  }
}
