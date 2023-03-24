import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { auth } from '$lib/server/lucia';

interface User {
	id: string;
	username?: string;
	email?: string;
	password?: string;
}

type RequestBody = User;

export const POST: RequestHandler = async ({ request }) => {
	const j = (await request.json()) as RequestBody;
	const { id, ...userObj } = j;
	const password: string | undefined = j.password;

	await auth.updateUserAttributes(id, userObj);
	if (password) {
		await auth.updateKeyPassword('email', userObj.email, password);
	}
	return json(
		{ message: 'User Edited' },
		{
			status: 200
		}
	);
};
