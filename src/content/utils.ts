/** @file src/content/utils.ts @description Content management helper functions features: [nested structure construction, content path mapping, category node generation, dynamic module parsing, recursive sorting] */
import { widgetRegistryService } from '@src/services/widget-registry-service';
import { logger } from '@utils/logger';
import type { ContentNode, MinimalContentNode, Schema } from './types';

// An extended version of ContentNode for UI purposes that includes children.
export interface ExtendedContentNode extends ContentNode {
	children?: ExtendedContentNode[];
	path?: string;
}

export function constructNestedStructure(contentStructure: ContentNode[]): ExtendedContentNode[] {
	const nodeMap = new Map<string, ExtendedContentNode>();
	const byParent: Record<string, ExtendedContentNode[]> = {};
	const ROOT_KEY = '__root__';

	// Step 1: Convert to ExtendedContentNode and group by parentId
	for (const node of contentStructure) {
		const nested: ExtendedContentNode = { ...node, path: '', children: [] };
		nodeMap.set(node._id, nested);
		const parentKey = node.parentId ?? ROOT_KEY;
		if (!byParent[parentKey]) {
			byParent[parentKey] = [];
		}
		byParent[parentKey].push(nested);
	}

	const result: ExtendedContentNode[] = [];
	const rootNodes = byParent[ROOT_KEY] ?? [];

	// Step 2: DFS using a stack to build the tree
	const stack: { node: ExtendedContentNode; parentPath: string }[] = [];
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
			node.children?.push(child);
			stack.push({ node: child, parentPath: node.path ?? '' });
		}
	}
	return result;
}

export function generateCategoryNodesFromPaths(files: Schema[]): Map<string, MinimalContentNode> {
	const folders = new Map<string, MinimalContentNode>();

	for (const file of files) {
		if (!file.path) {
			continue;
		}
		const parts = file.path.split('/').filter(Boolean);
		let path = '';
		for (let i = 0; i < parts.length - 1; i++) {
			const name = parts[i];
			path = `${path}/${name}`;
			if (!folders.has(path)) {
				folders.set(path, { name, path, nodeType: 'category' });
			}
		}
	}

	return folders;
}

export function constructContentPaths(contentStructure: ContentNode[]): Record<string, ContentNode> {
	const byParent: Record<string, ContentNode[]> = {};
	const result: Record<string, ContentNode> = {};

	for (const node of contentStructure) {
		const parentKey = node.parentId ?? '__root__';
		if (!byParent[parentKey]) {
			byParent[parentKey] = [];
		}
		byParent[parentKey].push(node);
	}

	const stack: { node: ContentNode; path: string }[] = [];
	const rootNodes = byParent.__root__ ?? [];
	for (const root of rootNodes) {
		stack.push({ node: root, path: `/${root.name}` });
	}

	while (stack.length > 0) {
		const { node, path } = stack.pop()!;
		result[path] = { ...node };

		const children = byParent[node._id] ?? [];
		for (let i = children.length - 1; i >= 0; i--) {
			const child = children[i];
			stack.push({ node: child, path: `${path}/${child.name}` });
		}
	}

	return result;
}

export async function processModule(content: string): Promise<{ schema?: Schema } | null> {
	try {
		// Support both 'export const schema =' and 'export default'
		const schemaMatch = content.match(/export\s+const\s+schema\s*=\s*/);
		const defaultMatch = content.match(/export\s+default\s+/);

		const match = schemaMatch || defaultMatch;
		if (!match) {
			logger.warn('No schema or default export found in module');
			return null;
		}

		const startIdx = match.index! + match[0].length;
		// Determine end of the expression (up to semicolon or end of content)
		// This is a simplified approach that works well with our generated files
		let endIdx = content.indexOf(';', startIdx);
		if (endIdx === -1) {
			endIdx = content.length;
		}

		let schemaContent = content.substring(startIdx, endIdx).trim();
		if (!schemaContent || schemaContent === '') {
			logger.warn('Could not extract schema content');
			return null;
		}

		// If the extracted content is a variable name (like 'Clients'), we need to find its definition.
		// In our compiled files, it's usually 'const Clients = { ... }; export default Clients;'
		if (/^[a-zA-Z0-9_]+$/.test(schemaContent)) {
			const varName = schemaContent;
			const varMatch = content.match(new RegExp(`(?:const|let|var)\\s+${varName}\\s*=\s*`));
			if (varMatch) {
				const varStartIdx = varMatch.index! + varMatch[0].length;
				let braceCount = 0;
				let vEndIdx = varStartIdx;
				for (let i = varStartIdx; i < content.length; i++) {
					if (content[i] === '{') braceCount++;
					if (content[i] === '}') {
						braceCount--;
						if (braceCount === 0) {
							vEndIdx = i + 1;
							break;
						}
					}
				}
				schemaContent = content.substring(varStartIdx, vEndIdx);
			}
		}

		const widgetsMap = widgetRegistryService.getAllWidgets();
		const widgetsObject = Object.fromEntries(widgetsMap.entries());

		// CASE-INSENSITIVE PROXY: Ensure widgets.Seo, widgets.SEO, and widgets.seo all work
		const caseInsensitiveWidgets = new Proxy(widgetsObject, {
			get: (target, prop) => {
				// Handle symbols (like those used by Svelte or test runners)
				if (typeof prop !== 'string') {
					// Use unknown as intermediate cast to satisfy TS strict checks for symbol-to-string conversion
					return (target as any)[prop as unknown as string];
				}
				// Try exact match first (performance)
				if (prop in target) {
					return target[prop];
				}
				// Try case-insensitive match
				const lowerProp = prop.toLowerCase();
				const key = Object.keys(target).find((k) => k.toLowerCase() === lowerProp);
				return key ? target[key] : undefined;
			}
		});

		const moduleContent = `
			return (function() {
				const widgets = globalThis.widgets;
				const schema = ${schemaContent};
				return schema;
			})();
		`;

		// Race condition safety: Only set/delete globalThis.widgets if it's not already populated
		// We use the case-insensitive proxy here
		const globalObj = globalThis as unknown as { widgets?: Record<string, unknown> };
		const alreadyPopulated = typeof globalThis !== 'undefined' && globalObj.widgets;

		if (!alreadyPopulated && typeof globalThis !== 'undefined') {
			globalObj.widgets = caseInsensitiveWidgets as unknown as Record<string, unknown>;
		}

		const moduleFunc = new Function(moduleContent);
		const result = moduleFunc();

		if (!alreadyPopulated && typeof globalThis !== 'undefined') {
			globalObj.widgets = undefined;
		}

		if (result && typeof result === 'object' && 'fields' in result && '_id' in result) {
			logger.trace(`Processed collection: ${result._id}`);
			return { schema: result as Schema };
		}

		logger.warn(`Module processed but no fields or _id found. Result type: ${typeof result}`);
		return null;
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		logger.error('Failed to process module:', {
			error: errorMessage,
			stack: err instanceof Error ? err.stack : undefined
		});
		return null;
	}
}

/**
 * Sort content nodes by order (primary) and name (secondary, alphabetically).
 * This ensures consistent ordering across all UI components.
 *
 * @param a - First node to compare
 * @param b - Second node to compare
 * @returns Negative if a < b, positive if a > b, zero if equal
 *
 * @example
 * ```typescript
 * const sorted = nodes.sort(sortContentNodes);
 * ```
 */
export function sortContentNodes<T extends { order?: number; name: string }>(a: T, b: T): number {
	const orderDiff = (a.order ?? 0) - (b.order ?? 0);
	if (orderDiff !== 0) {
		return orderDiff;
	}
	return a.name.localeCompare(b.name);
}
