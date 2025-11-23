import { processTokensInResponse } from '@src/utils/tokenHelper';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
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
		return json({ error: 'Failed to resolve tokens' }, { status: 400 });
	}
};
