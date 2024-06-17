import type { RequestHandler } from '@sveltejs/kit';
import { updateCollections } from '@collections';
import { compile } from './compile';

export const GET: RequestHandler = async () => {
	try {
		console.log('Starting compilation...');
		await compile();
		console.log('Compilation complete.');

		console.log('Updating collections...');
		await updateCollections(true);
		console.log('Collections updated.');

		return new Response(null, { status: 200 });
	} catch (error) {
		console.error('Error during GET /compile:', error);
		return new Response(null, { status: 500 });
	}
};
