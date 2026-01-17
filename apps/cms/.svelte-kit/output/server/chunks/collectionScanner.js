import { logger } from './logger.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { processModule } from './utils4.js';
async function recursivelyGetFiles(dir) {
	const entries = await fs.readdir(dir, { withFileTypes: true });
	const files = await Promise.all(
		entries.map(async (entry) => {
			const fullPath = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				return recursivelyGetFiles(fullPath);
			} else if (entry.isFile() && entry.name.endsWith('.js')) {
				return [fullPath];
			}
			return [];
		})
	);
	return files.flat();
}
function extractCollectionPath(fullPath, baseDir) {
	const relative = path.relative(baseDir, fullPath);
	const withoutExt = relative.replace(/\.js$/, '');
	const normalized = withoutExt.split(path.sep).join('/');
	return normalized.startsWith('/') ? normalized : `/${normalized}`;
}
async function scanCompiledCollections() {
	const envDir = process.env.COLLECTIONS_DIR || process.env.COLLECTIONS_FOLDER || 'compiledCollections';
	const compiledDirectoryPath = path.resolve(process.cwd(), envDir);
	try {
		await fs.access(compiledDirectoryPath);
	} catch {
		logger.trace(`Compiled collections directory not found at: ${compiledDirectoryPath}. Assuming fresh start.`);
		return [];
	}
	const files = await recursivelyGetFiles(compiledDirectoryPath);
	const schemaPromises = files.map(async (filePath) => {
		try {
			const content = await fs.readFile(filePath, 'utf-8');
			const moduleData = await processModule(content);
			if (!moduleData?.schema) return null;
			const schema = moduleData.schema;
			const collectionPath = extractCollectionPath(filePath, compiledDirectoryPath);
			const fileName = path.basename(filePath, '.js');
			return {
				...schema,
				_id: schema._id,
				// The _id from the file is the source of truth
				path: collectionPath,
				// Directory structure determines path
				name: schema.name || fileName,
				tenantId: schema.tenantId ?? void 0
			};
		} catch (error) {
			logger.warn(`Could not process collection file: ${filePath}`, error);
			return null;
		}
	});
	const results = await Promise.all(schemaPromises);
	const schemas = results.filter((s) => s !== null);
	logger.trace(`Scanned ${schemas.length} collection schemas from filesystem.`);
	return schemas;
}
export { scanCompiledCollections };
//# sourceMappingURL=collectionScanner.js.map
