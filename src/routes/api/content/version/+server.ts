/**
 * @file src\routes\api\content\version\+server.ts
 * @description API endpoint for fetching content version.
 *
 * Security: Protected by hooks, admin-only.
 */

import { contentManager } from '@src/content/content-manager';
import { json } from '@sveltejs/kit';

// Unified Error Handling
import { apiHandler } from '@utils/api-handler';

export const GET = apiHandler(async () => {
	const version = contentManager.getContentVersion();
	return json({ version });
});
