import fs from 'fs';

// This function compiles TypeScript files from the collections folder into JavaScript files
export async function compile({
	// The default values for the folders are taken from the environment variables
	collectionsFolderJS = import.meta.env.collectionsFolderJS,
	collectionsFolderTS = import.meta.env.collectionsFolderTS
} = {}) {
	// This global variable is used to store the current file name
	globalThis.__filename = '';

	// If the collections folder for JavaScript does not exist, create it
	if (!fs.existsSync(collectionsFolderJS)) {
		fs.mkdirSync(collectionsFolderJS);
	}
	// Import the TypeScript compiler module
	const ts = (await import('typescript')).default;
	// Get the list of TypeScript files from the collections folder, excluding Auth.ts and index.ts
	const files = fs
		.readdirSync(collectionsFolderTS)
		.filter((file) => !['Auth.ts', 'index.ts'].includes(file));

	// Loop through each file
	for (const file of files) {
		// Read the file content as a string
		const content = fs.readFileSync(`${collectionsFolderTS}/${file}`, { encoding: 'utf-8' });

		// Transpile the TypeScript code into JavaScript code using the ESNext target
		let code = ts.transpileModule(content, {
			compilerOptions: {
				target: ts.ScriptTarget.ESNext
			}
		}).outputText;

		// Replace the import statements for widgets with an empty string
		code = code
			.replace(/import widgets from .*\n/g, '')
			// Replace the widgets variable with the globalThis.widgets variable
			.replace(/widgets/g, 'globalThis.widgets')
			// Add the .js extension to the relative import paths
			.replace(/(\bfrom\s+["']\..*)(["'])/g, '$1.js$2');

		// Write the JavaScript code to the collections folder for JavaScript with the same file name
		fs.writeFileSync(`${collectionsFolderJS}/${file.trim().replace(/\.ts$/g, '.js')}`, code);
	}
}
