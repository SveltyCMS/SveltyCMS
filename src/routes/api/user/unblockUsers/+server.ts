import type { RequestHandler } from './$types';
import { auth } from '@api/db';

export const POST: RequestHandler = async ({ request }) => {
	const data = await request.json();

	data.forEach(async (user: any) => {
		await auth.updateUserAttributes(user.id, { blocked: false });
	});

	return new Response(JSON.stringify({ success: true }), { status: 200 });
};
