/**
 * @file src/routes/(app)/[language]/+page.server.ts
 * @description Redirect handler for language-only URLs.
 * Redirects /en (or any language) to the first available collection.
 * Usescontent-managerfor robust, canonical path resolution.
 */

import { contentManager } from '@src/content/content-manager';
import { redirect } from '@sveltejs/kit';
import { logger } from '@utils/logger.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const { language } = params;
	const { tenantId } = locals;

	try {
		// Ensurecontent-manageris initialized (required for accurate collection list)
		await contentManager.initialize(tenantId);

		// Get robust redirect URL for first collection
		// This returns /${language}/${collectionId}, which then canonically redirects
		// to the pretty path in [...collection]/+page.server.ts
		const redirectUrl = await contentManager.getFirstCollectionRedirectUrl(language, tenantId);

		if (redirectUrl) {
			logger.info(`[Language Redirect] Redirecting to first collection: ${redirectUrl}`);
			throw redirect(302, redirectUrl);
		}

		// Fallback to dashboard if no collections found
		logger.warn('[Language Redirect] No collections found for redirection, using dashboard fallback');
		throw redirect(302, '/dashboard');
	} catch (error) {
		// Respect SvelteKit's redirect behavior
		if (error && typeof error === 'object' && 'status' in error && (error as { status: number }).status === 302) {
			throw error;
		}

		logger.error('Error in language redirect', { error, language, tenantId });
		throw redirect(302, '/dashboard');
	}
};
