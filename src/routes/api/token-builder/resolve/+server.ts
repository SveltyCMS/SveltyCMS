/**
 * @file src/routes/api/tokenBuilder/resolve/+server.ts
 * @description Resolve tokens in a given string.
 */

import { processTokensInResponse } from '@src/services/token/helper';
import { json } from '@sveltejs/kit';

// Unified Error Handling
import { apiHandler } from '@utils/api-handler';
import { AppError } from '@utils/error-handling';

export const POST = apiHandler(async ({ request, locals }) => {
	try {
		const { text } = await request.json();
		const locale = (locals as any).locale || 'en';

		// Resolve tokens
		// We can merge the provided context with the system context if needed
		// For now, we mainly rely on the server-side context (user, system)
		// but we could allow passing specific entry data if needed for preview.

		const resolved = await processTokensInResponse(text, locals.user ?? undefined, locale);

		return json({ resolved });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		throw new AppError('Failed to resolve tokens', 400, 'TOKEN_RESOLUTION_FAILED', { originalError: message });
	}
});
