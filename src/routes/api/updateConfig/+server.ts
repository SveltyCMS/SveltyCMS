import fs from 'fs/promises';
import path from 'path';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	console.log('updateConfigFile called');
	// Get the data from the request body
	let data = await request.json();
	console.log('data', data);

	// If data is undefined, return an error response
	if (!data) {
		return new Response('No data provided in request body', { status: 400 });
	}

	// Define the path to the config.ts file
	const configFilePath = path.join(process.cwd(), 'src', 'collections', 'config.ts');
	console.log('configFilePath', configFilePath);

	data = data.map((category: any) => {
		const newData = {
			...category,
			collections: category.items.map((item: any) => {
				return `|||collections.${item.name}|||`;
			})
		};
		delete newData.id;
		delete newData.items;
		return newData;
	});

	// Define the new content of the config.ts file
	let newConfigFileContent = `// Configure how Collections are sorted & displayed in Categories section
    export function createCategories(collections: any) {return ${JSON.stringify(data, null, 2)};}
	`;

	newConfigFileContent = newConfigFileContent.replace(/"\|\|\|/g, '').replace(/\|\|\|"/g, '');

	newConfigFileContent = newConfigFileContent.replace(/"\|\|\|/g, '').replace(/\|\|\|"/g, '');

	try {
		// Write the new content to the config.ts file asynchronously
		await fs.writeFile(configFilePath, newConfigFileContent);

		// Return a success response
		return new Response('Config file updated successfully by API', { status: 200 });
	} catch (error: any) {
		console.error(error);

		return new Response(`Error updating config file: ${error.message}`, { status: 500 });
	}
};
