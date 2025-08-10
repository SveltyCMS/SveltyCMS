import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { SystemPreferencesModel } from '@src/databases/mongodb/models/systemPreferences';
import { unlinkSync, existsSync } from 'fs';
import { resolve } from 'path';

export const POST: RequestHandler = async () => {
	try {
		// Reset the SETUP_COMPLETED flag in database
		await SystemPreferencesModel.updateOne({ key: 'SETUP_COMPLETED' }, { $set: { value: false } }, { upsert: true });

		// Remove the private.ts file to trigger file-based setup check
		const privateConfigPath = resolve(process.cwd(), 'config/private.ts');
		if (existsSync(privateConfigPath)) {
			unlinkSync(privateConfigPath);
		}

		const publicConfigPath = resolve(process.cwd(), 'config/public.ts');
		if (existsSync(publicConfigPath)) {
			unlinkSync(publicConfigPath);
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
