import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { unlinkSync, existsSync } from 'fs';
import { resolve } from 'path';

export const POST: RequestHandler = async () => {
	try {
		// Remove environment files to trigger setup check
		const envPath = resolve(process.cwd(), '.env');
		if (existsSync(envPath)) {
			unlinkSync(envPath);
		}

		const envLocalPath = resolve(process.cwd(), '.env.local');
		if (existsSync(envLocalPath)) {
			unlinkSync(envLocalPath);
		}

		return json({
			success: true,
			message: 'Setup has been reset successfully. Please restart the dev server to complete setup again.'
		});
	} catch (error) {
		return json(
			{
				success: false,
				message: 'Failed to reset setup',
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
