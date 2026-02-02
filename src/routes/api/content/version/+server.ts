/**
 * @file src\routes\api\content\version\+server.ts
 * @description API endpoint for fetching content version.
 *
 * Security: Protected by hooks, admin-only.
 */

import { json } from '@sveltejs/kit';
import { contentManager } from '@src/content/ContentManager';

// Unified Error Handling
import { apiHandler } from '@utils/apiHandler';

export const GET = apiHandler(async () => {
	const version = contentManager.getContentVersion();
	return json({ version });
});
