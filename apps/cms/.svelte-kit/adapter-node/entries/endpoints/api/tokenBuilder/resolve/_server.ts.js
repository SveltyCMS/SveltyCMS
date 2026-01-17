import { p as processTokensInResponse } from '../../../../../chunks/helper.js';
import { json } from '@sveltejs/kit';
const POST = async ({ request, locals }) => {
	try {
		const { text } = await request.json();
		const locale = locals.locale || 'en';
		const resolved = await processTokensInResponse(text, locals.user ?? void 0, locale);
		return json({ resolved });
	} catch (error) {
		return json({ error: 'Failed to resolve tokens' }, { status: 400 });
	}
};
export { POST };
//# sourceMappingURL=_server.ts.js.map
