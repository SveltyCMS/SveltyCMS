import { json, type RequestHandler } from '@sveltejs/kit';
import { auth } from '@src/databases/db';
import { superValidate } from 'sveltekit-superforms/server';
import { addUserTokenSchema } from '@utils/formSchemas';
import { zod } from 'sveltekit-superforms/adapters';
import { error } from '@sveltejs/kit';

// System Logs
import logger from '@src/utils/logger';

export const GET: RequestHandler = async () => {
	try {
		if (!auth) {
			throw new Error('Auth is not initialized');
		}

		const users = await auth.getAllUsers();
		logger.info('Fetched users successfully');
		return json(users);
	} catch (err) {
		logger.error('Error fetching users:', err instanceof Error ? err : new Error(String(err)));
		throw error(500, 'Internal Server Error');
	}
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		if (!auth) {
			throw new Error('Auth is not initialized');
		}

		const addUserForm = await superValidate(request, zod(addUserTokenSchema));
		const { email, role, expiresIn } = addUserForm.data;

		logger.info('Received request to create user', { email, role });

		const expirationTime = {
			'2 hrs': 7200,
			'12 hrs': 43200,
			'2 days': 172800,
			'1 week': 604800
		}[expiresIn];

		if (!expirationTime) {
			logger.warn('Invalid value for token validity', { expiresIn });
			return new Response(JSON.stringify({ form: addUserForm, message: 'Invalid value for token validity' }), { status: 400 });
		}

		if (await auth.checkUser({ email })) {
			logger.warn('User already exists', { email });
			return new Response(JSON.stringify({ message: 'User already exists' }), { status: 400 });
		}

		const newUser = await auth.createUser({ email, role, lastAuthMethod: 'password', isRegistered: false });
		const token = await auth.createToken(newUser._id, expirationTime * 1000);

		logger.info('User created successfully', { userId: newUser._id });

		// Send the token via email (this should be implemented)
		await fetch('/api/sendMail', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				email,
				subject: 'User Token',
				message: 'User Token',
				templateName: 'userToken',
				props: { email, token, role, expiresIn: expirationTime }
			})
		});

		return json(newUser);
	} catch (err) {
		logger.error('Error creating user:', err instanceof Error ? err : new Error(String(err)));
		throw error(500, 'Internal Server Error');
	}
};
