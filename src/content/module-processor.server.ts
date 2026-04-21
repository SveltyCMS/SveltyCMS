/**
 * @file src/content/module-processor.server.ts
 * @description
 * High-performance module processor for content collection definitions.
 * Marked as .server.ts to ensure it never leaks to the client bundle.
 */
import { widgetRegistryService } from "@src/services/widget-registry-service";
import { logger } from "@utils/logger.server";
import crypto from "node:crypto";
import type { Schema } from "./types";
import path from "node:path";

/**
 * Creates a case-insensitive proxy for the widget registry.
 * This ensures that schemas calling widgets.Input vs widgets.input both work.
 */
async function getWidgetsProxy() {
  const widgetsMap = await widgetRegistryService.getAllWidgets();
  const widgetsObject = Object.fromEntries(widgetsMap.entries());

  return new Proxy(widgetsObject, {
    get(target, prop) {
      if (typeof prop !== "string") return undefined;

      // Try exact match first
      if (prop in target) return target[prop];

      // Case-insensitive lookup
      const lowerProp = prop.toLowerCase();
      const entry = Object.entries(target).find(([key]) => key.toLowerCase() === lowerProp);

      if (entry) {
        return entry[1];
      }

      return undefined;
    },
  });
}

/**
 * High-performance native module loader using dynamic imports.
 * Bypasses string parsing and eval for security and speed.
 */
export async function loadSchemaNative(filePath: string): Promise<{ schema?: Schema } | null> {
  const fullPath = path.resolve(filePath);
  try {
    // 🛡️ Security: Inject widgets into global scope for the dynamic import
    (globalThis as any).widgets = await getWidgetsProxy();

    // 🚀 Performance: Use native dynamic import
    // Note: 'file://' prefix is mandatory for absolute paths in Node/Bun on Windows.
    // Query param provides cache-busting for HMR.
    const fileUrl = `file://${fullPath.replace(/\\/g, "/")}`;
    const module = await import(`${fileUrl}?v=${Date.now()}`);

    const schema = module.default || module.schema;

    if (schema && typeof schema === "object" && "fields" in schema) {
      // Normalize _id if missing
      if (!schema._id) {
        schema._id = (schema.slug || schema.name || "unknown")
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "");
      }
      return { schema: schema as Schema };
    }

    return null;
  } catch (err) {
    logger.error(`[MODULE] Native load failed for ${path.basename(filePath)}:`, {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

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
    // Fix: Variable name regex too narrow — now supports names followed by comments or whitespace
    const potentialVarNameMatch = content
      .substring(startIdx, startIdx + 100)
      .match(/^\s*([a-zA-Z_$][a-zA-Z0-9_$]*)/);
    if (potentialVarNameMatch) {
      const varName = potentialVarNameMatch[1];
      const remainder = content
        .substring(startIdx + potentialVarNameMatch[0].length, startIdx + 100)
        .trim();

      // If it's just a variable name followed by ; or CRLF or nothing, it's a reference
      if (
        remainder === "" ||
        remainder.startsWith(";") ||
        remainder.startsWith("/") ||
        remainder.startsWith("\n")
      ) {
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
          let inString: string | null = null;
          let isEscaped = false;

          for (let i = varStartIdx; i < content.length; i++) {
            const c = content[i];

            if (inString) {
              if (isEscaped) {
                isEscaped = false;
              } else if (c === "\\") {
                isEscaped = true;
              } else if (c === inString) {
                // Fix: content[i-1] !== "\\" fails on \\ at string end
                inString = null;
              }
              continue;
            }

            if (c === '"' || c === "'" || c === "`") {
              // Fix: Template literals with ${} expressions corrupt brace-counting extraction
              inString = c;
              continue;
            }

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
        } else {
          logger.warn(`Could not find definition for variable: ${varName}`);
          return null;
        }
      }
    }

    if (!schemaContent) {
      // It's an inline object (e.g., 'export default {') or regex failed
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
        let isEscaped = false;

        for (let i = firstBrace; i < content.length; i++) {
          const c = content[i];

          if (inString) {
            if (isEscaped) {
              isEscaped = false;
            } else if (c === "\\") {
              isEscaped = true;
            } else if (c === inString) {
              inString = null;
            }
            continue;
          }

          if (c === '"' || c === "'" || c === "`") {
            if (
              i === 0 ||
              (content[i - 1] === "\\" && content[i - 2] === "\\") ||
              content[i - 1] !== "\\"
            ) {
              inString = c;
            }
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

    const widgetsProxy = await getWidgetsProxy();

    let result: any = null;
    try {
      // Fix: Excessive debug logging on hot path including string operations — removed detailed log
      // Pass widgetsProxy as an argument to avoid mutating globalThis (eliminates race conditions)
      const moduleContent = `return (function(widgets) { return ${schemaContent}; })(widgetsProxy);`;
      const moduleFunc = new Function("widgetsProxy", moduleContent);
      result = moduleFunc(widgetsProxy);

      if (result && typeof result === "object" && "fields" in result) {
        // Fix: result._id fallback ignores slug — downstream mishandles undefined _id
        if (!result._id) {
          result._id = (result.slug || result.name || "unknown")
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "");
        }
        return { schema: result as Schema };
      }
    } catch (evalErr) {
      logger.error("Error evaluating schema content:", { error: evalErr });
      return null;
    }

    return null;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error("Failed to process module:", { error: errorMessage });
    return null;
  }
}

/**
 * Generates a deterministic hash for a schema object to detect meaningful changes.
 */
export function generateSchemaHash(schema: Schema): string {
  try {
    // Sort keys to ensure deterministic hashing
    const sortedString = JSON.stringify(schema, Object.keys(schema).sort());
    return crypto.createHash("md5").update(sortedString).digest("hex");
  } catch (err) {
    logger.error("Failed to generate schema hash:", { error: err });
    // Fallback to a random string to ensure reconciliation if hashing fails
    return `error-${Date.now()}`;
  }
}
