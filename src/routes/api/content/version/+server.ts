/**
 * @file src\routes\api\content\version\+server.ts
 * @description API endpoint for fetching content version.
 *
 * Security: Protected by hooks, admin-only.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { contentManager } from '@src/content/ContentManager';

export const GET: RequestHandler = async () => {
	const version = contentManager.getContentVersion();
	return json({ version });
};
