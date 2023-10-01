import fs from 'fs/promises';
import path from 'path';

export async function POST(request: any) {
	console.log('updateConfigFile called');
	// Get the data from the request body
	const data = request.body;
	console.log('data', data);

	// If data is undefined, return an error response
	if (!data) {
		return {
			status: 400,
			body: 'No data provided in request body'
		};
	}

	// Define the path to the config.ts file
	const configFilePath = path.join(process.cwd(), 'src', 'collections', 'config.ts');
	console.log('configFilePath', configFilePath);

	// Define the new content of the config.ts file
	const newConfigFileContent = `
        // Configure how Collections are sorted & displayed in Categories section
        export function createCategories(collections: any) {
            return ${JSON.stringify(data)};
        }
    `;

	try {
		// Write the new content to the config.ts file asynchronously
		await fs.writeFile(configFilePath, newConfigFileContent);

		// Return a success response
		return {
			status: 200,
			body: 'Config file updated successfully by API'
		};
	} catch (error: any) {
		console.error(error);
		return {
			status: 500,
			body: `Error updating config file: ${error.message}`
		};
	}
}
