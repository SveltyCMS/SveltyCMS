import fs from 'fs';

import ts from 'typescript';

// This function generates TypeScript types for collections in a SvelteKit CMS project.
export async function generateCollectionTypes() {
	const files = fs.readdirSync('src/collections').filter((x) => {
		return !['index.ts', 'types.ts', 'config.ts'].includes(x);
	});

	// Read the src/collections directory and filter out files named index.ts, types.ts, and config.ts
	// For each remaining file, remove the .ts extension and wrap the filename in single quotes
	// Join these filenames together with a pipe (|), forming a TypeScript union type
	const collections =
		'export type CollectionNames = ' +
		files
			.map((x) => `'${x.replace('.ts', '')}'`)
			.join('|')
			.replaceAll(/\n/g, '') +
		';';

	// console.log(collectionSchemas);

	// Read the existing types from the types.ts file
	let types = fs.readFileSync('src/collections/types.ts', 'utf-8');

	// Replace the existing CollectionLabels type with an empty string
	types = types.replace(/export\s+type\s+CollectionNames\s?=\s?.*?;/gms, '');

	// Append the new CollectionLabels type to the types
	types += collections;

	// Write the updated types back to the types.ts file
	fs.writeFileSync('src/collections/types.ts', types);
}

export async function generateCollectionFieldTypes() {
	const files = fs.readdirSync('src/collections').filter((x) => {
		return !['index.ts', 'types.ts', 'config.ts'].includes(x);
	});
	const collections = {};
	for (const file of files) {
		let content = fs.readFileSync('./src/collections/' + file, 'utf8');
		const widgets = new Set();
		for (const match of content.matchAll(/widgets.(.*?)\(/g)) {
			widgets.add(match[1]);
		}
		content = content.replace(/widgets\./g, '');
		content =
			`${Array.from(widgets)
				.map((widget) => `let  ${widget} = (args: any) =>args;`)
				.join('\n')}` + content;
		content = ts.transpile(content, {
			target: ts.ScriptTarget.ESNext,
			module: ts.ModuleKind.ESNext
		});
		const data = (await import('data:text/javascript,' + content)).default;
		const collection: string[] = [];

		for (const field of data.fields) {
			const fieldName = field.db_fieldName || field.label;
			collection.push(fieldName);
		}
		collections[file.replace('.ts', '')] = collection.join('|');
	}
	let types = fs.readFileSync('src/collections/types.ts', 'utf-8');
	types = types.replace(/\n*export\s+type\s+CollectionContent\s?=\s?.*?};/gms, '');
	types += '\n' + 'export type CollectionContent = ' + JSON.stringify(collections).replaceAll('|', `"|"`) + ';';
	fs.writeFileSync('src/collections/types.ts', types);
}
