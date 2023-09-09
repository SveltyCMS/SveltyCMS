import fs from 'fs';

// This function returns a list of all the collection files in the current directory.
export function getCollectionFiles() {
	// Get the list of all files in the current directory.
	const files = fs.readdirSync(import.meta.env.collectionsFolderJS);

	// Filter the list to only include files that are not config.js or types.js.
	return files.filter((file) => !['config.js', 'types.js'].includes(file));
}
