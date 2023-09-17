import type { RequestHandler } from './$types';
import { auth } from '../../db';

// Define a POST request handler function
export const POST: RequestHandler = async ({ request }) => {
	const data = await request.json();
	const userID = data.id;
	const newPassword = data.password;
	const user = await auth.getUser(userID);
	const key = await auth.getKey('email', user.email).catch(() => null);

	// if (key)
	//     auth.updateKeyPassword('email', key.providerUserId, newPassword);

	return new Response(JSON.stringify('success'), { status: 200 });
};
