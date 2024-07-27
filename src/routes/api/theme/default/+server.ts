import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { dbInterface } from '@api/databases/dbInterface';
import { getDBAdapter } from '@api/databases/db';

export const GET: RequestHandler = async () => {
	let dbAdapter: dbInterface;

	try {
		// Get the database adapter
		dbAdapter = await getDBAdapter();

		// Ensure the database connection is established
		await dbAdapter.connect();

		// Fetch the default theme
		const defaultTheme = await dbAdapter.getDefaultTheme();

		if (!defaultTheme) {
			// If no default theme is found, return a 404 status
			return json({ error: 'No default theme found' }, { status: 404 });
		}

		// Return the default theme
		return json(defaultTheme);
	} catch (error) {
		console.error('Error fetching default theme:', error);
		return json({ error: 'Failed to fetch default theme' }, { status: 500 });
	} finally {
		// Optionally, disconnect from the database if necessary
		// if (dbAdapter) await dbAdapter.disconnect();
	}
};
