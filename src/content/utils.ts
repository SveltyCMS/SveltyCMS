/**
 * @file src/content/utils.ts
 * @description Helper functions for Content
 *
 * Structure:
 *   - constructNestedStructure: Converts a flat list of content nodes into a nested structure
 *   - constructContentPaths: Converts a nested structure into a flat list of content nodes
 *   - generateCategoryNodesFromPaths: Extracts category nodes from a flat list of content nodes
 *
 * Module Processing:
 *   - processModule: Extracts schema from module content
 *
 * Widget Utilities:
 *   - ensureWidgetsInitialized: Initializes widgets
 *   - resolveWidgetPlaceholder: Resolves a widget placeholder
 *   - resolveWidget (imported via widgetProxy): Resolves a widget
 */

import type { ContentNode, NestedContentNode } from '../databases/dbInterface';
import { logger } from '../utils/logger.svelte';
import type { MinimalContentNode, Schema } from './types';
import widgetProxy, { ensureWidgetsInitialized, resolveWidgetPlaceholder } from '@src/widgets';

export function constructNestedStructure(contentStructure: ContentNode[]): NestedContentNode[] {
	const nodeMap = new Map<string, NestedContentNode>();
	const byParent: Record<string, NestedContentNode[]> = [];
	const ROOT_KEY = '__root__';

	// Step 1: Convert to NestedContentNode and group by parentId
	for (const node of contentStructure) {
		const nested: NestedContentNode = {
			...node,
			path: '', // to be filled in later
			children: []
		};

		nodeMap.set(node._id, nested);

		const parentKey = node.parentId ?? ROOT_KEY;
		if (!byParent[parentKey]) byParent[parentKey] = [];
		byParent[parentKey].push(nested);
	}

	const result: NestedContentNode[] = [];

	const rootNodes = byParent[ROOT_KEY] ?? [];

	// Step 2: DFS using stack
	const stack: { node: NestedContentNode; parentPath: string }[] = [];

	for (const root of rootNodes) {
		root.path = `/${root.name}`;
		result.push(root);
		stack.push({ node: root, parentPath: '' });
	}

	while (stack.length > 0) {
		const { node } = stack.pop()!;
		const children = byParent[node._id] ?? [];

		for (let i = children.length - 1; i >= 0; i--) {
			const child = children[i];
			child.path = `${node.path}/${child.name}`;
			node.children.push(child);
			stack.push({ node: child, parentPath: node.path });
		}
	}

	return result;
}

export function generateCategoryNodesFromPaths(files: Schema[]): Map<string, MinimalContentNode> {
	const folders = new Map<string, MinimalContentNode>();

	for (const file of files) {
		const parts = file.path!.split('/').filter(Boolean); // break path into parts
		let path = '';
		for (let i = 0; i < parts.length - 1; i++) {
			const name = parts[i];
			path = `${path}/${name}`;

			if (!folders.has(path)) {
				folders.set(path, {
					name,
					path: path,
					nodeType: 'category'
				});
			}
		}
	}

	return folders;
}

// Depth first traversal to generate paths for each node
//
export function constructContentPaths(contentStructure: ContentNode[]): Record<string, ContentNode> {
	const byParent: Record<string, ContentNode[]> = {};
	const result: Record<string, ContentNode> = {};

	// Group by parentId
	for (const node of contentStructure) {
		const parentKey = node.parentId ?? '__root__';
		if (!byParent[parentKey]) byParent[parentKey] = [];
		byParent[parentKey].push(node);
	}

	const stack: { node: ContentNode; parentPath?: string; path: string }[] = [];

	// Start with root nodes (parentId == undefined)
	const rootNodes = byParent['__root__'] ?? [];
	for (const root of rootNodes) {
		stack.push({ node: root, path: `/${root.name}` });
	}

	while (stack.length > 0) {
		const { node, path } = stack.pop()!;
		const updatedNode = { ...node };

		result[path] = updatedNode;

		const children = byParent[node._id ?? ''] ?? [];
		for (let i = children.length - 1; i >= 0; i--) {
			const child = children[i];
			stack.push({
				node: child,
				path: `${path}/${child.name}`
			});
		}
	}

	return result;
}

//import { ensureWidgetsInitialized } from "@src/widgets";

async function processModule(content: string): Promise<{ schema?: Schema } | null> {
	try {
		// Ensure widgets are initialized before processing module
		await ensureWidgetsInitialized();

		// Extract UUID from file content
		const uuidMatch = content.match(/\/\/\s*UUID:\s*([a-f0-9-]{32})/i);
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
