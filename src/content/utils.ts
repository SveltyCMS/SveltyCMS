
import type { ContentNode, NestedContentNode } from "../databases/dbInterface";
import { logger } from "../utils/logger.svelte";
import type { Schema } from "./types";
import widgetProxy, { ensureWidgetsInitialized, resolveWidgetPlaceholder } from '@src/widgets';



export function constructNestedStructure(contentStructure: Record<string, ContentNode>): NestedContentNode[] {

  try {

    // Create a Map for quick lookups
    const nodeMap = new Map<string, NestedContentNode>();

    // Add all nodes to the Map
    Object.values(contentStructure).forEach(node => {
      nodeMap.set(node.path, { ...node, children: [] }); // Initialize children as an empty array
    });

    // Build the nested structure
    const nestedStructure: NestedContentNode[] = [];

    for (const node of nodeMap.values()) {
      if (!node.parentPath) {
        // This is a root node, add it to the nested structure
        nestedStructure.push(node);
      } else {
        // Find the parent node and add this node to its children
        const parentNode = nodeMap.get(node.parentPath as string);
        if (parentNode) {
          parentNode.children!.push(node);
        }
      }
    }

    return nestedStructure;
  } catch (error) {
    logger.error('Error generating nested JSON:', error);
    throw error;
  }
}




//import { ensureWidgetsInitialized } from "@src/widgets";

async function processModule(content: string): Promise<{ schema?: Schema } | null> {
  try {

    // Ensure widgets are initialized before processing module
    await ensureWidgetsInitialized();


    // Extract UUID from file content
    const uuidMatch = content.match(/\/\/\s*UUID:\s*([a-f0-9-]{36})/i);
    const uuid = uuidMatch ? uuidMatch[1] : null;

    // Remove any import/export statements and extract the schema object
    const cleanedContent = content
      .replace(/import\s+.*?;/g, '') // remove import statements
      .replace(/export\s+default\s+/, '') // remove export default
      .replace(/export\s+const\s+/, 'const ') // handle export const
      .trim();

    // Replace the global widgets before evaluating the schema
    const modifiedContent = cleanedContent.replace(/globalThis\.widgets\.(\w+)\((.*?)\)/g, (match, widgetName, widgetConfig) => {
      return `await resolveWidgetPlaceholder({ __widgetName: '${widgetName}', __widgetConfig: ${widgetConfig || '{}'} })`;
    });

    // Create a safe evaluation context
    const moduleContent = `
				const module = {};
				const exports = {};
	      const resolveWidgetPlaceholder = ${resolveWidgetPlaceholder.toString()};
				(async function(module, exports) {
					${modifiedContent}
					return module.exports || exports;
				})(module, exports);
			`;

    // Create and execute the function with widgets as context
    const moduleFunc = new Function('widgets', moduleContent);
    const result = await moduleFunc(widgetProxy);

    // If result is an object with fields, it's likely our schema
    if (result && typeof result === 'object') {
      return { schema: { ...result, _id: uuid } };
    }

    // If we got here, try to find a schema object in the content
    const schemaMatch = cleanedContent.match(/(?:const|let|var)\s+(\w+)\s*=\s*({[\s\S]*?});/);
    if (schemaMatch && schemaMatch[2]) {
      try {
        // Evaluate just the schema object
        const schemaFunc = new Function(`return ${schemaMatch[2]}`);
        const schema = schemaFunc();
        return { schema: { ...schema, _id: uuid } };
      } catch (error) {
        logger.warn('Failed to evaluate schema object:', error);
      }
    }

    // Try to match export const/let/var schema
    const schemaExportMatch = cleanedContent.match(/(?:export\s+(?:const|let|var)\s+)?(\w+)\s*=\s*({[\s\S]*?});/);
    if (schemaExportMatch && schemaExportMatch[2]) {
      try {
        const schemaFunc = new Function(`return ${schemaExportMatch[2]}`);
        const schema = schemaFunc();
        return { schema: { ...schema, _id: uuid } };
      } catch (error) {
        logger.warn('Failed to evaluate schema object:', error);
      }
    }

    // Try to match export default schema
    const schemaDefaultExportMatch = cleanedContent.match(/export\s+default\s+({[\s\S]*?});/);
    if (schemaDefaultExportMatch && schemaDefaultExportMatch[1]) {
      try {
        const schemaFunc = new Function(`return ${schemaDefaultExportMatch[1]}`);
        const schema = schemaFunc();
        return { schema: { ...schema, _id: uuid } };
      } catch (error) {
        logger.warn('Failed to evaluate schema object:', error);
      }
    }

    return null;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error('Failed to process module:', { error: errorMessage });
    return null;
  }
}


export { processModule };
