/**
 * @file src/routes/api/preview/+server.ts
 * @description Live preview handshake endpoint.
 *
 * GET /api/preview?secret=xyz&slug=/about
 * 1. Validates secret against PREVIEW_SECRET setting
 * 2. Sets 'cms_draft_mode' cookie (httpOnly, sameSite=none, secure, 1h maxAge)
 * 3. 307 redirect to the slug (or returns JSON if no slug)
 */

import { json, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPrivateSettingSync } from '@src/services/settingsService';
import { logger } from '@utils/logger.server';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const secret = url.searchParams.get('secret');
	const slug = url.searchParams.get('slug');

	// Validate secret against stored PREVIEW_SECRET
	const storedSecret = getPrivateSettingSync('PREVIEW_SECRET');

	if (storedSecret && (!secret || secret !== storedSecret)) {
		logger.warn('Preview handshake failed: invalid or missing secret');
		return json({ error: 'Invalid preview secret' }, { status: 401 });
	}

	// Set draft mode cookie
	cookies.set('cms_draft_mode', '1', {
		path: '/',
		httpOnly: true,
		secure: url.protocol === 'https:',
		sameSite: 'none',
		maxAge: 60 * 60 // 1 hour
	});

	// If slug provided, redirect to the page with the cookie set
	if (slug) {
		throw redirect(307, slug);
	}

	// Otherwise return JSON confirmation (for iframe/AJAX handshake use)
	return json({
		success: true,
		message: 'Draft mode enabled',
		cookie_set: 'cms_draft_mode'
	});
};
