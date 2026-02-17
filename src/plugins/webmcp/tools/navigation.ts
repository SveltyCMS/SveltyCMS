/**
 * @file src/plugins/webmcp/tools/navigation.ts
 * @description Exposes Navigation tools to WebMCP
 */

import { goto } from '$app/navigation';
import { page } from '$app/state';

export function registerNavigationTools() {
	// @ts-expect-error - allow dynamic access to window.modelContext
	const modelContext = window.navigator.modelContext;

	if (!modelContext) {
		return;
	}

	// Tool: navigate_to
	modelContext.registerTool({
		name: 'navigate_to',
		description: 'Navigate to a specific path in the Admin Dashboard.',
		parameters: {
			type: 'object',
			properties: {
				path: { type: 'string', description: 'The URL path to navigate to (must start with /)' }
			},
			required: ['path']
		},
		handler: async ({ path }: { path: string }) => {
			try {
				await goto(path);
				return {
					content: [{ type: 'text', text: `Navigated to ${path}` }]
				};
			} catch (e: any) {
				return {
					isError: true,
					content: [{ type: 'text', text: `Failed to navigate: ${e.message}` }]
				};
			}
		}
	});

	// Tool: get_current_route
	modelContext.registerTool({
		name: 'get_current_route',
		description: 'Get the current URL path and parameters.',
		parameters: {
			type: 'object',
			properties: {},
			required: []
		},
		handler: async () => {
			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify(
							{
								path: page.url.pathname,
								params: page.params,
								query: Object.fromEntries(page.url.searchParams)
							},
							null,
							2
						)
					}
				]
			};
		}
	});
}
