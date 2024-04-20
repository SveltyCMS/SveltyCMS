import fs from 'fs';

// This function generates TypeScript types for collections in a SvelteKit CMS project.
export function generateCollectionTypes(path: string) {
	// Log the path to the console
	console.log(path);

	// If the path is not part of the src/collections directory, return and do nothing
	if (!/src[/\\]collections/.test(path)) {
		return;
	}

	// Read the src/collections directory and filter out files named index.ts, types.ts, and config.ts
	// For each remaining file, remove the .ts extension and wrap the filename in single quotes
	// Join these filenames together with a pipe (|), forming a TypeScript union type
	const collections =
		'export type CollectionLabels = ' +
		fs
			.readdirSync('src/collections')
			.filter((x) => {
				return !['index.ts', 'types.ts', 'config.ts'].includes(x);
			})
			.map((x) => `'${x.replace('.ts', '')}'`)
			.join('|')
			.replaceAll(/\n/g, '') +
		';';

	// Read the existing types from the types.ts file
	let types = fs.readFileSync('src/collections/types.ts', 'utf-8');

	// Replace the existing CollectionLabels type with an empty string
	types = types.replace(/export\s+type\s+CollectionLabels\s?=\s?.*?;/, '');

	// Append the new CollectionLabels type to the types
	types += collections;

	// Write the updated types back to the types.ts file
	fs.writeFileSync('src/collections/types.ts', types);
}
