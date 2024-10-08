import fs from 'fs';
export function getCollectionFiles() {
	const files = fs.readdirSync(import.meta.env.collectionsFolderJS);
	return files.filter((file) => !['config.js', 'types.js'].includes(file));
}
