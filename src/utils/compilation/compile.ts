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
import { v4 as uuidv4 } from 'uuid'; // Random UUID generation

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
		// Ensure the output directory exists
		await fs.mkdir(compiledCollections, { recursive: true });

		// 1. Pre-scan existing compiled files
		const { existingFilesByPath, existingFilesByHash } = await scanCompiledFiles(compiledCollections);

		// 2. Get source TypeScript and JavaScript files
		const sourceFiles = await getTypescriptAndJavascriptFiles(userCollections);
		// Create a set of source file relative paths for quick lookup during clone detection
		const sourceFileSet = new Set(sourceFiles);

		// 3. Create output directories for source files
		await createOutputDirectories(sourceFiles, userCollections, compiledCollections);

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

// Helper function to scan existing compiled files and build lookup maps
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
			// Ignore errors like ENOENT if the directory doesn't exist yet
			if (err.code !== 'ENOENT') {
				console.error(`Error scanning directory ${currentFolder}:`, err);
			}
		}
	}

	await traverseDirectory(compiledCollections);
	return { existingFilesByPath, existingFilesByHash };
}

async function getTypescriptAndJavascriptFiles(folder: string, subdir: string = ''): Promise<string[]> {
	const files: string[] = [];
	// const collectionNames = new Set<string>(); // Track names within the current directory level - Unused

	try {
		const entries = await fs.readdir(path.posix.join(folder, subdir), { withFileTypes: true });
		const dirCollectionNames = new Set<string>(); // Track names specifically for this directory

		for (const entry of entries) {
			const relativePath = path.posix.join(subdir, entry.name);

			if (entry.isDirectory()) {
				// Recursively get files from subdirectories
				const subFiles = await getTypescriptAndJavascriptFiles(folder, relativePath);
				files.push(...subFiles);
			} else if (entry.isFile()) {
				// Check if the entry is a file before further processing
				if (entry.name.endsWith('.ts') || entry.name.endsWith('.js')) {
					// Check for name conflicts within the same directory
					const collectionName = entry.name.replace(/\.(ts|js)$/, '');
					if (dirCollectionNames.has(collectionName)) {
						// Construct full path for error message
						const conflictPath = path.posix.join(folder, subdir, entry.name);
						throw new Error(
							`Collection name conflict: "${collectionName}" is used multiple times in directory "${path.posix.dirname(conflictPath)}".`
						);
					}
					dirCollectionNames.add(collectionName);
					files.push(relativePath);
				}
			}
		}
	} catch (err) {
		// Handle case where folder doesn't exist (e.g., initial run)
		if (err.code === 'ENOENT') {
			console.warn(`Source directory not found: ${path.posix.join(folder, subdir)}`);
			return []; // Return empty array if directory doesn't exist
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
	// console.log('[Cleanup] Scanning for orphaned files...');

	const unlinkPromises: Promise<void>[] = [];

	// Iterate through the files found during the initial scan
	for (const relativePath of existingFilesByPath.keys()) {
		// Only need the path (key)
		// If a file existed before but wasn't processed in this run (not compiled, not skipped), it's orphaned.
		if (!processedJsPaths.has(relativePath)) {
			// console.log(`[Cleanup] Marking as orphaned: ${relativePath}`); // Removed verbose log
			const fullPath = path.posix.join(compiledCollections, relativePath);
			// Keep essential log for removal action
			console.log(`\x1b[31mRemoving orphaned collection file:\x1b[0m \x1b[34m${relativePath}\x1b[0m`);
			// Add the unlink promise to the array
			unlinkPromises.push(
				fs.unlink(fullPath).catch((err) => {
					// Log ALL errors during unlink for debugging, including ENOENT
					console.error(`Error removing orphaned file ${fullPath}:`, err); // Keep error log, removed prefix
					// Decide if we still want to ignore ENOENT or treat it differently now
					// if (err.code !== 'ENOENT') { // Keep commented out or remove entirely
					// 	console.error(`Error removing orphaned file ${fullPath}:`, err);
					// }
				})
			);
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
			// If directory doesn't exist or other error, consider it "empty" for removal purposes
			if (err.code === 'ENOENT') return true;
			console.error(`Error reading directory ${folder} for cleanup:`, err);
			return false; // Cannot determine if empty, so don't remove parent
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

		// Wait for subdirectory checks to complete
		const results = await Promise.all(dirPromises);
		// If any subdirectory was not empty (returned false), this directory is not empty
		if (results.some((res) => !res)) {
			isEmpty = false;
		}

		if (isEmpty) {
			try {
				await fs.rmdir(folder);
				// console.log(`Removed empty directory: ${folder}`); // Optional: Log removed directories
				return true; // Directory was empty and removed
			} catch (rmErr) {
				console.error(`Error removing directory ${folder}:`, rmErr);
				return false; // Error occurred, treat as not empty
			}
		}
		return false; // Directory was not empty
	}

	// Start cleanup from the root compiled directory
	await removeEmptyDirs(compiledCollections);
}

// Optimized for creating nested output directories
async function createOutputDirectories(files: string[], srcFolder: string, destFolder: string): Promise<void> {
	// Get all unique directory paths from the files
	const directories = new Set(files.map((file) => path.posix.dirname(file)).filter((dir) => dir !== '.'));

	// Create each directory in the output folder concurrently
	const mkdirPromises = Array.from(directories).map((dir) => {
		const outputDir = path.posix.join(destFolder, dir);
		// Ensure recursive creation
		return fs.mkdir(outputDir, { recursive: true });
	});

	// Wait for all directory creation promises to resolve
	await Promise.all(mkdirPromises);
}

// Updated compileFile function
async function compileFile(
	file: string, // Relative path of the source file from userCollections
	srcFolder: string,
	destFolder: string,
	existingFilesByPath: Map<string, ExistingFileData>,
	existingFilesByHash: Map<string, ExistingFileData>,
	sourceFileSet: Set<string> // Add sourceFileSet parameter
): Promise<string | null> {
	// Returns the relative JS path if processed, null otherwise
	const isTypeScript = file.endsWith('.ts');
	const sourceFilePath = path.posix.join(srcFolder, file); // Absolute path to source
	const targetJsPathRelative = file.replace(/\.(ts|js)$/, '.js'); // Relative path for map keys and logging
	const targetJsPathAbsolute = path.posix.join(destFolder, targetJsPathRelative);
	const shortPath = path.posix.relative(process.cwd(), targetJsPathAbsolute); // For logging

	try {
		// 1. Read the source file content
		const sourceContent = await fs.readFile(sourceFilePath, 'utf8');
		const sourceContentHash = getContentHash(sourceContent);

		// 2. Determine the UUID
		let uuid: string | null = null;
		const existingDataAtPath = existingFilesByPath.get(targetJsPathRelative); // Use const

		// Case 1: Target file exists and hash matches -> Reuse UUID, skip compile
		if (existingDataAtPath && existingDataAtPath.hash === sourceContentHash) {
			// console.log(`Skipping compilation for \x1b[34m${shortPath}\x1b[0m, content hash matches.`); // Removed verbose log
			return targetJsPathRelative; // Return path as it's processed (skipped)
		}

		// --- Logic for Move/Rename vs. Clone ---
		let isClone = false;
		const existingDataByHash = existingFilesByHash.get(sourceContentHash);

		// Check if hash exists elsewhere AND target path doesn't exist (or hash differs at target)
		if (!existingDataAtPath && existingDataByHash && existingDataByHash.uuid) {
			// Potential move/rename OR clone. Check if original source still exists.
			// Infer original source path (try .ts first, then .js)
			const potentialOriginalSourceTs = existingDataByHash.jsPath.replace(/\.js$/, '.ts');
			const potentialOriginalSourceJs = existingDataByHash.jsPath.replace(/\.js$/, '.js');

			// --- Clone Detection Logic ---
			const tsSourceExists = sourceFileSet.has(potentialOriginalSourceTs); // Check existence once
			const jsSourceExists = sourceFileSet.has(potentialOriginalSourceJs); // Check existence once

			// Check if the inferred original source path is in the current set of source files
			// AND make sure it's not the *current* file being processed (handles edge case of renaming A.ts -> A.js)
			if ((tsSourceExists && potentialOriginalSourceTs !== file) || (jsSourceExists && potentialOriginalSourceJs !== file)) {
				// Original source still exists -> This is a CLONE
				isClone = true;
				console.log(`Detected CLONE for \x1b[34m${shortPath}\x1b[0m. Generating new UUID.`);
				// Do not reuse UUID from hash map in this case.
			} else {
				// Original source likely gone -> This is a MOVE/RENAME
				uuid = existingDataByHash.uuid;
				console.log(`Reusing UUID for \x1b[34m${shortPath}\x1b[0m based on content hash (move/rename).`);
			}
		}

		// Case 3: Target file exists but hash differs (and not a clone detected above) -> Reuse existing UUID at path if valid
		if (!uuid && !isClone && existingDataAtPath && existingDataAtPath.uuid) {
			uuid = existingDataAtPath.uuid;
			console.log(`Reusing existing UUID for \x1b[34m${shortPath}\x1b[0m as content changed at target path.`);
		}

		// Case 4: No existing UUID found (or it's a clone) -> Generate new UUID
		if (!uuid || isClone) {
			// Ensure we don't overwrite a reused UUID if it wasn't a clone
			if (!isClone || !uuid) {
				// Generate only if truly needed or if clone forced it
				uuid = uuidv4().replace(/-/g, '');
				if (!isClone) {
					// Avoid double logging for clones
					console.log(`Generating new UUID for \x1b[32m${shortPath}\x1b[0m.`);
				}
			}
		}

		// 3. Transpile or prepare final code
		let finalCode: string;
		if (isTypeScript) {
			// Transpile TypeScript code
			const result = ts.transpileModule(sourceContent, {
				compilerOptions: {
					target: ts.ScriptTarget.ESNext, // Target modern JavaScript
					module: ts.ModuleKind.ESNext, // Use ES modules
					esModuleInterop: true, // Enable interoperability
					allowJs: true // Allow JavaScript files as input
				}
			});
			finalCode = result.outputText;
		} else {
			// Handle JavaScript source files (ensure they are ES Modules or convert)
			const isESModule = sourceContent.includes('export') || sourceContent.includes('import');
			if (!isESModule) {
				// Basic CommonJS to ES Module conversion attempt
				if (sourceContent.includes('module.exports')) {
					finalCode = sourceContent.replace(/module\.exports\s*=\s*/, 'export default ');
				} else {
					// Wrap non-module JS in a default export (use with caution)
					console.warn(`Warning: Wrapping non-module JS file ${file} in default export.`);
					finalCode = `export default (function() {\n${sourceContent}\n})();`;
				}
			} else {
				finalCode = sourceContent; // Already an ES Module
			}
		} // End of if/else block for transpilation/preparation

		// Steps 4, 5, 6, 7 should happen *after* getting the initial finalCode

		// 4. Apply AST transformations (replaces modifyTranspiledCode and addUUIDsToWidgetFields)
		finalCode = transformCodeWithAST(finalCode, uuid);

		// 5. Inject Hash and determined UUID
		// Ensure uuid is not null here. If it is, something went wrong in determination logic.
		if (!uuid) {
			throw new Error(`Failed to determine UUID for file ${file}`);
		}
		// Pass targetJsPathRelative for updating @file tag
		finalCode = processHashAndUUID(finalCode, sourceContentHash, uuid, targetJsPathRelative);

		// 6. Write the compiled file (Renumbered from 7)
		await writeCompiledFile(targetJsPathAbsolute, finalCode);

		// 7. Log success and return path (Renumbered from end of else block)
		console.log(`Compiled and wrote \x1b[32m${shortPath}\x1b[0m (UUID: \x1b[33m${uuid}\x1b[0m)`);
		return targetJsPathRelative; // Return relative path as it was processed;
	} catch (error) {
		// Add semicolon just in case
		console.error(`Error compiling file ${file}:`, error);
		// Decide if we should throw or just log and continue with other files
		// throw error; // Option 1: Stop the whole process on single file error
		return null; // Option 2: Log error and return null, allowing others to proceed
	}
}

// --- AST Transformation Functions ---
const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });

function transformCodeWithAST(code: string, uuid: string): string {
	const sourceFile = ts.createSourceFile(
		'tempFile.js', // Temporary file name for parsing
		code,
		ts.ScriptTarget.ESNext,
		true, // setParentNodes
		ts.ScriptKind.JS // Parse as JavaScript, as it might be transpiled already
	);

	const transformationResult = ts.transform(sourceFile, [
		(context) => schemaUuidTransformer(context, uuid), // Inject UUID into schema
		widgetTransformer, // Apply custom transformations
		addJsExtensionTransformer, // Add .js extensions
		commonjsToEsModuleTransformer // Replace __filename and __dirname
	]);

	const transformedSourceFile = transformationResult.transformed[0];
	return printer.printFile(transformedSourceFile);
}

// Transformer factory for widget-related changes
const widgetTransformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
	return (sourceFile) => {
		const visitor = (node: ts.Node): ts.VisitResult<ts.Node> => {
			// 1. Remove `import widgets from ...`
			if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
				// Basic check if import might be for 'widgets', adjust regex/logic if needed
				if (node.importClause?.name?.text === 'widgets' || /widgets/.test(node.moduleSpecifier.text)) {
					// console.log('Removing widget import:', node.moduleSpecifier.text);
					return undefined; // Remove the node
				}
			}

			// 2. Replace standalone `widgets` identifier with `globalThis.widgets`
			if (ts.isIdentifier(node) && node.text === 'widgets') {
				// Avoid replacing if it's already part of `globalThis.widgets` or a property name
				if (
					!ts.isPropertyAccessExpression(node.parent) || // Not part of obj.widgets
					(ts.isPropertyAccessExpression(node.parent) && node.parent.name !== node) || // Not the property name itself
					(ts.isPropertyAccessExpression(node.parent) &&
						node.parent.expression.kind !== ts.SyntaxKind.ThisKeyword && // Check it's not this.widgets
						(!ts.isIdentifier(node.parent.expression) || node.parent.expression.text !== 'globalThis')) // Check it's not globalThis.widgets
				) {
					// console.log('Replacing widgets identifier');
					return ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('globalThis'), ts.factory.createIdentifier('widgets'));
				}
			}

			// 3. Add UUID to widget calls like `globalThis.widgets.XYZ({...})`
			if (ts.isCallExpression(node)) {
				let isWidgetCall = false;
				if (ts.isPropertyAccessExpression(node.expression)) {
					// Check for globalThis.widgets.FunctionName
					if (
						ts.isPropertyAccessExpression(node.expression.expression) &&
						ts.isIdentifier(node.expression.expression.expression) &&
						node.expression.expression.expression.text === 'globalThis' &&
						ts.isIdentifier(node.expression.expression.name) &&
						node.expression.expression.name.text === 'widgets'
					) {
						isWidgetCall = true;
					}
				}

				if (isWidgetCall && node.arguments.length > 0 && ts.isObjectLiteralExpression(node.arguments[0])) {
					const objectLiteral = node.arguments[0];
					const hasUuid = objectLiteral.properties.some(
						(prop) => ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.text === 'uuid'
					);

					if (!hasUuid) {
						// console.log('Adding UUID to widget call:', node.expression.getText());
						const uuidProperty = ts.factory.createPropertyAssignment(ts.factory.createIdentifier('uuid'), ts.factory.createStringLiteral(uuidv4()));
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
};

// Transformer factory specifically for adding .js extensions to relative imports/exports
const addJsExtensionTransformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
	return (sourceFile) => {
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
};

// Transformer factory for converting CommonJS globals to ES module equivalents
const commonjsToEsModuleTransformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
	return (sourceFile) => {
		let needsFileURLToPath = false;

		const visitor = (node: ts.Node): ts.VisitResult<ts.Node> => {
			// Replace __filename with ES module equivalent
			if (ts.isIdentifier(node) && node.text === '__filename') {
				needsFileURLToPath = true;
				// Create: fileURLToPath(import.meta.url)
				return ts.factory.createCallExpression(ts.factory.createIdentifier('fileURLToPath'), undefined, [
					ts.factory.createPropertyAccessExpression(
						ts.factory.createMetaProperty(ts.SyntaxKind.ImportKeyword, ts.factory.createIdentifier('meta')),
						ts.factory.createIdentifier('url')
					)
				]);
			}

			// Replace __dirname with ES module equivalent
			if (ts.isIdentifier(node) && node.text === '__dirname') {
				needsFileURLToPath = true;
				// Create: path.dirname(fileURLToPath(import.meta.url))
				return ts.factory.createCallExpression(
					ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('path'), ts.factory.createIdentifier('dirname')),
					undefined,
					[
						ts.factory.createCallExpression(ts.factory.createIdentifier('fileURLToPath'), undefined, [
							ts.factory.createPropertyAccessExpression(
								ts.factory.createMetaProperty(ts.SyntaxKind.ImportKeyword, ts.factory.createIdentifier('meta')),
								ts.factory.createIdentifier('url')
							)
						])
					]
				);
			}

			return ts.visitEachChild(node, visitor, context);
		};

		const transformedFile = ts.visitNode(sourceFile, visitor) as ts.SourceFile;

		// Add required imports if __filename or __dirname were used
		if (needsFileURLToPath) {
			const importDeclaration = ts.factory.createImportDeclaration(
				undefined,
				ts.factory.createImportClause(
					false,
					undefined,
					ts.factory.createNamedImports([ts.factory.createImportSpecifier(false, undefined, ts.factory.createIdentifier('fileURLToPath'))])
				),
				ts.factory.createStringLiteral('url'),
				undefined
			);

			const pathImportDeclaration = ts.factory.createImportDeclaration(
				undefined,
				ts.factory.createImportClause(false, ts.factory.createIdentifier('path'), undefined),
				ts.factory.createStringLiteral('path'),
				undefined
			);

			// Add imports at the beginning of the file
			const statements = [importDeclaration, pathImportDeclaration, ...transformedFile.statements];
			return ts.factory.updateSourceFile(transformedFile, statements);
		}

		return transformedFile;
	};
};

// Transformer factory for injecting UUID into schema object
const schemaUuidTransformer: (context: ts.TransformationContext, uuid: string) => ts.TransformerFactory<ts.SourceFile> = (context, uuid) => {
	return (sourceFile) => {
		const visitor = (node: ts.Node): ts.VisitResult<ts.Node> => {
			// Look for object literals that might be schema objects
			if (ts.isObjectLiteralExpression(node)) {
				// Check if this object has properties that suggest it's a schema (like 'icon', 'fields', 'status', etc.)
				const hasSchemaProperties = node.properties.some(
					(prop) =>
						ts.isPropertyAssignment(prop) &&
						ts.isIdentifier(prop.name) &&
						['fields', 'icon', 'status', 'revision', 'livePreview'].includes(prop.name.text)
				);

				if (hasSchemaProperties) {
					// Check if _id property already exists
					const hasIdProperty = node.properties.some(
						(prop) => ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.text === '_id'
					);

					if (!hasIdProperty) {
						// Inject _id property with the UUID
						const idProperty = ts.factory.createPropertyAssignment(ts.factory.createIdentifier('_id'), ts.factory.createStringLiteral(uuid));

						// Add _id as the first property
						const newProperties = [idProperty, ...node.properties];
						return ts.factory.updateObjectLiteralExpression(node, newProperties);
					}
				}
			}

			return ts.visitEachChild(node, visitor, context);
		};

		return ts.visitNode(sourceFile, visitor) as ts.SourceFile;
	};
};

function processHashAndUUID(code: string, hash: string, uuid: string, targetJsPathRelative: string): string {
	let processedCode = code;

	// 1. Update @file tag in JSDoc if present
	const fileTagRegex = /(\s*\*\s*@file\s+)(.*)/;
	processedCode = processedCode.replace(fileTagRegex, `$1compiledCollections/${targetJsPathRelative}`);

	// 2. Remove any existing Hash and UUID comments efficiently
	processedCode = processedCode.replace(/^\/\/\s*HASH:\s*[a-f0-9]+\s*$/gm, '').replace(/^\/\/\s*UUID:\s*[a-f0-9-]+\s*$/gm, '');

	// 3. Trim leading whitespace/newlines that might result from removal
	processedCode = processedCode.trimStart();

	// 4. Define comments
	const warningComment = `// WARNING: This file is automatically generated. Any changes made here will be lost.
// Please edit the original source file in the 'config/collections' directory instead.`;
	const hashComment = `// HASH: ${hash}`;
	const uuidComment = `// UUID: ${uuid}`;

	// 5. Prepend comments in the correct order
	processedCode = `${warningComment}\n${hashComment}\n${uuidComment}\n\n${processedCode}`;

	return processedCode;
}

async function writeCompiledFile(filePath: string, code: string): Promise<void> {
	// Ensure the directory exists before writing
	await fs.mkdir(path.posix.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, code);
}

// Simple hash function using string content for change detection
function getContentHash(content: string): string {
	// Create a simple hash based on content length and some character codes
	// This is sufficient for detecting file changes in most cases
	let hash = 0;
	for (let i = 0; i < content.length; i++) {
		const char = content.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash & hash; // Convert to 32bit integer
	}
	// Convert to hex and ensure it's always positive
	return Math.abs(hash).toString(16);
}

// Helper function to extract Hash from JS file content
function extractHashFromJs(content: string): string | null {
	// More robust regex to handle potential whitespace variations and hex format
	const match = content.match(/^\/\/\s*HASH:\s*([a-f0-9]+)\s*$/m);
	return match ? match[1] : null;
}

// Helper function to extract UUID from JS file content
function extractUUIDFromJs(content: string): string | null {
	// More robust regex
	const match = content.match(/^\/\/\s*UUID:\s*([a-f0-9-]+)\s*$/m);
	return match ? match[1] : null;
}
