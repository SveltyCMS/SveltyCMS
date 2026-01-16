/**
 * @file src/utils/compilation/compile.ts
 * @description Compiles TypeScript files from the collections folder into JavaScript files using vite with custom AST transformations
 *
 * Features:
 * - Recursive directory scanning for nested collections
 * - Avoids recompilation of unchanged files via hash comparison
 * - Content hashing for change detection
 * - Concurrent file operations for improved performance
 * - Support for nested category structure
 * - Error handling and logging
 * - Cleanup of orphaned collection files
 * - Name conflict detection to prevent duplicate collection names
 * - HASH and UUID Management for collections and widgets
 */

import fs from 'fs/promises';
import path from 'path';
import * as ts from 'typescript';
import { v4 as uuidv4 } from 'uuid';

// Note: Cannot import logger.server here as this file is imported by vite.config.ts
// which runs before SvelteKit is initialized. Use console for build-time logging.

interface CompileOptions {
	systemCollections?: string;
	userCollections?: string;
	compiledCollections?: string;
}

interface ExistingFileData {
	jsPath: string;
	uuid: string | null;
	hash: string | null;
}

export async function compile(options: CompileOptions = {}): Promise<void> {
	// Define collection paths directly and use process.cwd()
	const {
		userCollections = path.posix.join(process.cwd(), 'config/collections'),
		compiledCollections = path.posix.join(process.cwd(), 'compiledCollections')
	} = options;

	try {
		// Ensure both input and output directories exist
		await fs.mkdir(userCollections, { recursive: true });
		await fs.mkdir(compiledCollections, { recursive: true });

		// 1. Pre-scan existing compiled files
		const { existingFilesByPath, existingFilesByHash } = await scanCompiledFiles(compiledCollections);

		// 2. Get source TypeScript and JavaScript files
		const sourceFiles = await getTypescriptAndJavascriptFiles(userCollections);
		// Create a set of source file relative paths for quick lookup during clone detection
		const sourceFileSet = new Set(sourceFiles);
		// 3. Create output directories for source files
		await createOutputDirectories(sourceFiles, compiledCollections);

		// 4. Compile source files concurrently and track processed paths
		const processedJsPaths = new Set<string>();
		const compilePromises = sourceFiles.map(async (file) => {
			const jsFilePath = await compileFile(file, userCollections, compiledCollections, existingFilesByPath, existingFilesByHash, sourceFileSet);
			if (jsFilePath) {
				processedJsPaths.add(jsFilePath);
			}
		});
		await Promise.all(compilePromises);

		// 5. Cleanup orphaned files
		await cleanupOrphanedFiles(compiledCollections, existingFilesByPath, processedJsPaths);
	} catch (error) {
		if (error instanceof Error && error.message.includes('Collection name conflict')) {
			console.error('\x1b[31mError:\x1b[0m', error.message);
			// Propagate the specific error
			throw error;
		}
		// Rethrow other errors
		throw error;
	}
}

// Helper to scan existing compiled files and build lookup maps
async function scanCompiledFiles(compiledCollections: string): Promise<{
	existingFilesByPath: Map<string, ExistingFileData>;
	existingFilesByHash: Map<string, ExistingFileData>;
}> {
	const existingFilesByPath = new Map<string, ExistingFileData>();
	const existingFilesByHash = new Map<string, ExistingFileData>();

	async function traverseDirectory(currentFolder: string) {
		try {
			const entries = await fs.readdir(currentFolder, { withFileTypes: true });
			for (const entry of entries) {
				const fullPath = path.posix.join(currentFolder, entry.name);
				if (entry.isDirectory()) {
					await traverseDirectory(fullPath);
				} else if (entry.isFile() && entry.name.endsWith('.js')) {
					const relativePath = path.posix.relative(compiledCollections, fullPath);
					try {
						const content = await fs.readFile(fullPath, 'utf8');
						const hash = extractHashFromJs(content);
						const uuid = extractUUIDFromJs(content);
						const fileData: ExistingFileData = { jsPath: relativePath, uuid, hash };

						existingFilesByPath.set(relativePath, fileData);
						// Only add to hash map if hash is valid
						if (hash) {
							// Handle potential hash collisions (rare, but possible)
							// If collision, prioritize the one already in the map or log a warning.
							// For simplicity here, we overwrite, assuming MD5 collisions are unlikely for typical collection files.
							existingFilesByHash.set(hash, fileData);
						}
					} catch (readError) {
						console.warn(`Warning: Could not read or parse compiled file ${relativePath}:`, readError);
					}
				}
			}
		} catch (err) {
			if (err instanceof Error && 'code' in err && err.code !== 'ENOENT') {
				console.error(`Error scanning directory ${currentFolder}:`, err);
			}
		}
	}

	await traverseDirectory(compiledCollections);
	return { existingFilesByPath, existingFilesByHash };
}

async function getTypescriptAndJavascriptFiles(folder: string, subdir: string = ''): Promise<string[]> {
	const files: string[] = [];

	try {
		const entries = await fs.readdir(path.posix.join(folder, subdir), { withFileTypes: true });
		const dirCollectionNames = new Set<string>();

		for (const entry of entries) {
			const relativePath = path.posix.join(subdir, entry.name);

			if (entry.isDirectory()) {
				// Recursively get files from subdirectories
				const subFiles = await getTypescriptAndJavascriptFiles(folder, relativePath);
				files.push(...subFiles);
			} else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
				const collectionName = entry.name.replace(/\.(ts|js)$/, '');
				if (dirCollectionNames.has(collectionName)) {
					// Construct full path for error message
					const conflictPath = path.posix.join(folder, subdir, entry.name);
					throw new Error(`Collection name conflict: "${collectionName}" is used multiple times in directory "${path.posix.dirname(conflictPath)}".`);
				}
				dirCollectionNames.add(collectionName);
				files.push(relativePath);
			}
		}
	} catch (err) {
		if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
			console.warn(`Source directory not found: ${path.posix.join(folder, subdir)}`);
			return [];
		}
		// Rethrow other errors
		throw err;
	}

	return files;
}

// Updated cleanup function
export async function cleanupOrphanedFiles(
	compiledCollections: string,
	existingFilesByPath: Map<string, ExistingFileData>,
	processedJsPaths: Set<string>
): Promise<void> {
	const unlinkPromises: Promise<void>[] = [];

	// Iterate through the files found during the initial scan
	for (const relativePath of existingFilesByPath.keys()) {
		// Only need the path (key)
		// If a file existed before but wasn't processed in this run (not compiled, not skipped), it's orphaned.
		if (!processedJsPaths.has(relativePath)) {
			const fullPath = path.posix.join(compiledCollections, relativePath);
			// Keep essential log for removal action
			console.log(`\x1b[31mRemoving orphaned collection file:\x1b[0m \x1b[34m${relativePath}\x1b[0m`);
			// Add the unlink promise to the array
			unlinkPromises.push(fs.unlink(fullPath).catch((err) => console.error(`Error removing orphaned file ${fullPath}:`, err)));
		}
	}

	// Wait for all unlink operations to complete
	await Promise.all(unlinkPromises);

	// Clean up empty directories using a recursive function with a post-order traversal
	async function removeEmptyDirs(folder: string): Promise<boolean> {
		let entries;
		try {
			entries = await fs.readdir(folder, { withFileTypes: true });
		} catch (err) {
			if (err instanceof Error && 'code' in err && err.code === 'ENOENT') return true;
			console.error(`Error reading directory ${folder} for cleanup:`, err);
			return false;
		}

		let isEmpty = true;
		const dirPromises: Promise<boolean>[] = [];

		for (const entry of entries) {
			const fullPath = path.posix.join(folder, entry.name);
			if (entry.isDirectory()) {
				// Recursively check subdirectory and add promise
				dirPromises.push(removeEmptyDirs(fullPath));
			} else {
				// If there's a file, the directory is not empty
				isEmpty = false;
			}
		}

		if ((await Promise.all(dirPromises)).some((res) => !res)) {
			isEmpty = false;
		}

		if (isEmpty) {
			try {
				await fs.rmdir(folder);
				return true;
			} catch (rmErr) {
				console.error(`Error removing directory ${folder}:`, rmErr);
				return false;
			}
		}
		return false;
	}

	// Start cleanup from the root compiled directory
	await removeEmptyDirs(compiledCollections);
}

// Optimized for creating nested output directories
async function createOutputDirectories(files: string[], destFolder: string): Promise<void> {
	const directories = new Set(files.map((file) => path.posix.dirname(file)).filter((dir) => dir !== '.'));
	const mkdirPromises = Array.from(directories).map((dir) => fs.mkdir(path.posix.join(destFolder, dir), { recursive: true }));
	await Promise.all(mkdirPromises);
}

// Updated compileFile function
async function compileFile(
	file: string,
	srcFolder: string,
	destFolder: string,
	existingFilesByPath: Map<string, ExistingFileData>,
	existingFilesByHash: Map<string, ExistingFileData>,
	sourceFileSet: Set<string>
): Promise<string | null> {
	const sourceFilePath = path.posix.join(srcFolder, file);
	const targetJsPathRelative = file.replace(/\.(ts|js)$/, '.js');
	const targetJsPathAbsolute = path.posix.join(destFolder, targetJsPathRelative);
	const shortPath = path.posix.relative(process.cwd(), targetJsPathAbsolute);

	try {
		// 1. Read the source file content
		const sourceContent = await fs.readFile(sourceFilePath, 'utf8');
		const sourceContentHash = getContentHash(sourceContent);
		const existingDataAtPath = existingFilesByPath.get(targetJsPathRelative);

		// Case 1: Target file exists and hash matches -> Reuse UUID, skip compile
		if (existingDataAtPath && existingDataAtPath.hash === sourceContentHash) {
			return targetJsPathRelative;
		}

		let uuid: string | null = null;
		let uuidReason = '';
		let isClone = false;
		const existingDataByHash = existingFilesByHash.get(sourceContentHash);

		if (!existingDataAtPath && existingDataByHash?.uuid) {
			const potentialOriginalSourceTs = existingDataByHash.jsPath.replace(/\.js$/, '.ts');
			const potentialOriginalSourceJs = existingDataByHash.jsPath;
			const tsSourceExists = sourceFileSet.has(potentialOriginalSourceTs);
			const jsSourceExists = sourceFileSet.has(potentialOriginalSourceJs);

			if ((tsSourceExists && potentialOriginalSourceTs !== file) || (jsSourceExists && potentialOriginalSourceJs !== file)) {
				// Original source still exists -> This is a CLONE
				isClone = true;
			} else {
				// Original source likely gone -> This is a MOVE/RENAME
				uuid = existingDataByHash.uuid;
				uuidReason = 'Reused from content hash (move/rename)';
			}
		}

		// Case 3: Target file exists but hash differs (and not a clone detected above) -> Reuse existing UUID at path if valid
		if (!uuid && !isClone && existingDataAtPath && existingDataAtPath.uuid) {
			uuid = existingDataAtPath.uuid;
			uuidReason = 'Reused from existing file path';
		}

		// Case 4: No existing UUID found (or it's a clone) -> Generate new UUID
		if (!uuid || isClone) {
			uuid = uuidv4().replace(/-/g, '');
			uuidReason = isClone ? 'Generated new (clone detected)' : 'Generated new';
		}

		const isTypeScript = file.endsWith('.ts');
		const transpileResult = isTypeScript
			? ts.transpileModule(sourceContent, {
					compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, esModuleInterop: true, allowJs: true }
				})
			: { outputText: sourceContent };

		let finalCode = transformCodeWithAST(transpileResult.outputText, uuid);
		finalCode = processHashAndUUID(finalCode, sourceContentHash, targetJsPathRelative);

		await writeCompiledFile(targetJsPathAbsolute, finalCode);
		console.log(`Compiled \x1b[32m${shortPath}\x1b[0m (\x1b[36m${uuidReason}\x1b[0m: \x1b[33m${uuid}\x1b[0m)`);

		return targetJsPathRelative;
	} catch (error) {
		console.error(`Error compiling file ${file}:`, error);
		return null;
	}
}

// --- AST Transformation Functions ---
const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });

function transformCodeWithAST(code: string, uuid: string): string {
	const sourceFile = ts.createSourceFile('tempFile.js', code, ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS);
	const transformationResult = ts.transform(sourceFile, [
		schemaUuidTransformer(uuid), // Inject UUID into schema
		widgetTransformer, // Apply custom transformations
		addJsExtensionTransformer, // Add .js extensions
		commonjsToEsModuleTransformer // Replace __filename and __dirname
	]);
	return printer.printFile(transformationResult.transformed[0]);
}

// Transformer factory for widget-related changes
const widgetTransformer: ts.TransformerFactory<ts.SourceFile> = (context) => (sourceFile) => {
	const visitor = (node: ts.Node): ts.VisitResult<ts.Node> => {
		// 1. Remove widget imports
		if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
			const moduleSpecifier = node.moduleSpecifier.text;
			let removeImport = false;

			// Old pattern: import widgets from '@widgets'
			if (node.importClause?.name?.text === 'widgets' && /widgets/.test(moduleSpecifier)) {
				removeImport = true;
			}

			// New patterns (aliased):
			if (node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
				const hasWidgetsAlias = node.importClause.namedBindings.elements.some((element) => element.name.text === 'widgets');

				if (hasWidgetsAlias) {
					// Check if it's one of the known widget sources
					if (
						moduleSpecifier.includes('@stores/widgetStore.svelte') ||
						moduleSpecifier.includes('@src/widgets/proxy') || // <-- THIS IS THE FIX
						moduleSpecifier.includes('widgets/proxy') || // <-- Added for robustness
						/widgets/.test(moduleSpecifier)
					) {
						removeImport = true;
					}
				}
			}

			if (removeImport) {
				return []; // Return an empty array to remove the import node
			}
		}

		// 2. Replace standalone `widgets` identifier with `globalThis.widgets`
		if (ts.isIdentifier(node) && node.text === 'widgets') {
			// Avoid replacing if it's already part of `globalThis.widgets` or a property name
			if (
				!ts.isPropertyAccessExpression(node.parent) ||
				(ts.isPropertyAccessExpression(node.parent) && node.parent.name !== node) ||
				(ts.isPropertyAccessExpression(node.parent) &&
					node.parent.expression.kind !== ts.SyntaxKind.ThisKeyword &&
					(!ts.isIdentifier(node.parent.expression) || node.parent.expression.text !== 'globalThis'))
			) {
				return ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('globalThis'), ts.factory.createIdentifier('widgets'));
			}
		}

		// 3. Inject UUID into widget calls (unchanged from your code)
		if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
			const isWidgetCall =
				ts.isPropertyAccessExpression(node.expression.expression) &&
				ts.isIdentifier(node.expression.expression.expression) &&
				node.expression.expression.expression.text === 'globalThis' &&
				ts.isIdentifier(node.expression.expression.name) &&
				node.expression.expression.name.text === 'widgets';
			if (isWidgetCall && node.arguments.length > 0 && ts.isObjectLiteralExpression(node.arguments[0])) {
				const objectLiteral = node.arguments[0];
				const hasUuid = objectLiteral.properties.some(
					(prop) => ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.text === 'uuid'
				);
				if (!hasUuid) {
					const uuidProperty = ts.factory.createPropertyAssignment('uuid', ts.factory.createStringLiteral(uuidv4()));
					const updatedProperties = [uuidProperty, ...objectLiteral.properties];
					const updatedObjectLiteral = ts.factory.updateObjectLiteralExpression(objectLiteral, updatedProperties);
					return ts.factory.updateCallExpression(node, node.expression, node.typeArguments, [updatedObjectLiteral, ...node.arguments.slice(1)]);
				}
			}
		}

		return ts.visitEachChild(node, visitor, context);
	};
	return ts.visitNode(sourceFile, visitor) as ts.SourceFile;
};

// Transformer factory specifically for adding .js extensions to relative imports/exports
const addJsExtensionTransformer: ts.TransformerFactory<ts.SourceFile> = (context) => (sourceFile) => {
	const visitor = (node: ts.Node): ts.VisitResult<ts.Node> => {
		if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
			const specifier = node.moduleSpecifier.text;
			if (specifier.startsWith('.') && !specifier.endsWith('.js') && !specifier.endsWith('.json')) {
				// Avoid adding .js to .json
				const newSpecifier = ts.factory.createStringLiteral(specifier + '.js');
				if (ts.isImportDeclaration(node)) {
					return ts.factory.updateImportDeclaration(node, node.modifiers, node.importClause, newSpecifier, node.assertClause);
				} else {
					return ts.factory.updateExportDeclaration(node, node.modifiers, node.isTypeOnly, node.exportClause, newSpecifier, node.assertClause);
				}
			}
		}
		return ts.visitEachChild(node, visitor, context);
	};
	return ts.visitNode(sourceFile, visitor) as ts.SourceFile;
};

// Transformer factory for converting CommonJS globals to ES module equivalents
const commonjsToEsModuleTransformer: ts.TransformerFactory<ts.SourceFile> = (context) => (sourceFile) => {
	let needsFileURLToPath = false;
	const visitor = (node: ts.Node): ts.VisitResult<ts.Node> => {
		// Replace __filename with ES module equivalent
		if (ts.isIdentifier(node) && node.text === '__filename') {
			needsFileURLToPath = true;
			// Create: fileURLToPath(import.meta.url)
			return ts.factory.createCallExpression(ts.factory.createIdentifier('fileURLToPath'), undefined, [
				ts.factory.createPropertyAccessExpression(
					ts.factory.createMetaProperty(ts.SyntaxKind.ImportKeyword, ts.factory.createIdentifier('meta')),
					'url'
				)
			]);
		}

		// Replace __dirname with ES module equivalent
		if (ts.isIdentifier(node) && node.text === '__dirname') {
			needsFileURLToPath = true;
			return ts.factory.createCallExpression(ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('path'), 'dirname'), undefined, [
				ts.factory.createCallExpression(ts.factory.createIdentifier('fileURLToPath'), undefined, [
					ts.factory.createPropertyAccessExpression(
						ts.factory.createMetaProperty(ts.SyntaxKind.ImportKeyword, ts.factory.createIdentifier('meta')),
						'url'
					)
				])
			]);
		}
		return ts.visitEachChild(node, visitor, context);
	};

	let transformedFile = ts.visitNode(sourceFile, visitor) as ts.SourceFile;
	if (needsFileURLToPath) {
		const urlImport = ts.factory.createImportDeclaration(
			undefined,
			ts.factory.createImportClause(
				false,
				undefined,
				ts.factory.createNamedImports([ts.factory.createImportSpecifier(false, undefined, ts.factory.createIdentifier('fileURLToPath'))])
			),
			ts.factory.createStringLiteral('url')
		);
		const pathImport = ts.factory.createImportDeclaration(
			undefined,
			ts.factory.createImportClause(false, ts.factory.createIdentifier('path'), undefined),
			ts.factory.createStringLiteral('path')
		);
		transformedFile = ts.factory.updateSourceFile(transformedFile, [urlImport, pathImport, ...transformedFile.statements]);
	}
	return transformedFile;
};

const schemaUuidTransformer =
	(uuid: string): ts.TransformerFactory<ts.SourceFile> =>
	(context) =>
	(sourceFile) => {
		const visitor = (node: ts.Node): ts.VisitResult<ts.Node> => {
			if (ts.isObjectLiteralExpression(node)) {
				const hasSchemaProperties = node.properties.some(
					(prop) =>
						ts.isPropertyAssignment(prop) &&
						ts.isIdentifier(prop.name) &&
						['fields', 'icon', 'status', 'revision', 'livePreview'].includes(prop.name.text)
				);
				if (hasSchemaProperties) {
					const hasIdProperty = node.properties.some(
						(prop) => ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.text === '_id'
					);
					if (!hasIdProperty) {
						const idProperty = ts.factory.createPropertyAssignment('_id', ts.factory.createStringLiteral(uuid));
						return ts.factory.updateObjectLiteralExpression(node, [idProperty, ...node.properties]);
					}
				}
			}
			return ts.visitEachChild(node, visitor, context);
		};
		return ts.visitNode(sourceFile, visitor) as ts.SourceFile;
	};

function processHashAndUUID(code: string, hash: string, targetJsPathRelative: string): string {
	let processedCode = code;
	processedCode = processedCode.replace(/(\s*\*\s*@file\s+)(.*)/, `$1compiledCollections/${targetJsPathRelative}`);
	processedCode = processedCode.replace(/^\/\/\s*HASH:\s*[a-f0-9]+\s*$/gm, '').replace(/^\/\/\s*UUID:\s*[a-f0-9-]+\s*$/gm, '');
	processedCode = processedCode.trimStart();
	const warningComment = `// WARNING: This file is automatically generated. Any changes made here will be lost.\n// Please edit the original source file in the 'config/collections' directory instead.`;
	const hashComment = `// HASH: ${hash}`;
	return `${warningComment}\n${hashComment}\n\n${processedCode}`;
}

async function writeCompiledFile(filePath: string, code: string): Promise<void> {
	await fs.mkdir(path.posix.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, code);
}

function getContentHash(content: string): string {
	let hash = 0;
	for (let i = 0; i < content.length; i++) {
		const char = content.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash &= hash;
	}
	// Convert to hex and ensure it's always positive
	return Math.abs(hash).toString(16);
}

// Helper function to extract Hash from JS file content
function extractHashFromJs(content: string): string | null {
	//regex to handle potential whitespace variations and hex format
	const match = content.match(/^\/\/\s*HASH:\s*([a-f0-9]+)\s*$/m);
	return match ? match[1] : null;
}

// Helper function to extract UUID from JS file content
function extractUUIDFromJs(content: string): string | null {
	// regex
	const match = content.match(/^\/\/\s*UUID:\s*([a-f0-9-]+)\s*$/m);
	return match ? match[1] : null;
}
