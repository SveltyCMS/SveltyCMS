/**
 * @file src/plugins/webmcp/tools/content.ts
 * @description Exposes Content Management tools to WebMCP
 */

import { collections } from '@src/stores/collection-store.svelte';

export function registerContentTools() {
	const modelContext = window.navigator.modelContext;

	if (!modelContext) {
		return;
	}

	// Tool: get_collections
	modelContext.registerTool({
		name: 'get_collections',
		description: 'Get a list of all available content collections and their schemas.',
		parameters: {
			type: 'object',
			properties: {},
			required: []
		},
		handler: async () => {
			const collectionList = Object.values(collections.all).map((c: any) => ({
				name: c.name,
				icon: c.icon,
				fields: c.fields
			}));
			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify(collectionList, null, 2)
					}
				]
			};
		}
	});

	// Tool: search_content
	modelContext.registerTool({
		name: 'search_content',
		description: 'Search for content entries in a specific collection.',
		parameters: {
			type: 'object',
			properties: {
				collectionName: {
					type: 'string',
					description: 'The name of the collection to search'
				},
				query: { type: 'string', description: 'Search query' }
			},
			required: ['collectionName']
		},
		handler: async ({ collectionName, query }: { collectionName: string; query: string }) => {
			// In a real app, this would call the internal API
			// using fetch to /api/graphql or /api/rest
			try {
				const response = await fetch(`/api/collections/${collectionName}?search=${encodeURIComponent(query || '')}`);
				const data = await response.json();
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify(data, null, 2)
						}
					]
				};
			} catch (e: any) {
				return {
					isError: true,
					content: [{ type: 'text', text: `Failed to fetch content: ${e.message}` }]
				};
			}
		}
	});
}
