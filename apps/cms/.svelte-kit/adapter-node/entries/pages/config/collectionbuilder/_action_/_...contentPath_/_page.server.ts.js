import fs$1 from 'fs';
import prettier from 'prettier';
import * as ts from 'typescript';
import { redirect, error } from '@sveltejs/kit';
import { contentManager } from '../../../../../../chunks/ContentManager.js';
import fs from 'fs/promises';
import path from 'path';
import { v4 } from 'uuid';
import { createHash } from 'crypto';
import { widgets } from '../../../../../../chunks/widgetStore.svelte.js';
import { h as hasPermissionWithRoles, p as permissionConfigs, b as permissions } from '../../../../../../chunks/permissions.js';
import { l as logger } from '../../../../../../chunks/logger.server.js';
const widgetTransformer = (context) => (sourceFile) => {
	const visitor = (node) => {
		if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
			const moduleSpecifier = node.moduleSpecifier.text;
			let removeImport = false;
			if (node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
				const hasWidgetsAlias = node.importClause.namedBindings.elements.some((element) => element.name.text === 'widgets');
				if (hasWidgetsAlias) {
					if (
						moduleSpecifier.includes('@shared/stores/widgetStore.svelte') ||
						moduleSpecifier.includes('@widgets/proxy') ||
						moduleSpecifier.includes('widgets/proxy')
					) {
						removeImport = true;
					}
				}
			}
			if (removeImport) {
				return [];
			}
		}
		if (ts.isIdentifier(node) && node.text === 'widgets') {
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
					const uuidProperty = ts.factory.createPropertyAssignment('uuid', ts.factory.createStringLiteral(v4()));
					const updatedProperties = [uuidProperty, ...objectLiteral.properties];
					const updatedObjectLiteral = ts.factory.updateObjectLiteralExpression(objectLiteral, updatedProperties);
					return ts.factory.updateCallExpression(node, node.expression, node.typeArguments, [updatedObjectLiteral, ...node.arguments.slice(1)]);
				}
			}
		}
		return ts.visitEachChild(node, visitor, context);
	};
	return ts.visitNode(sourceFile, visitor);
};
const addJsExtensionTransformer = (context) => (sourceFile) => {
	const visitor = (node) => {
		if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
			const specifier = node.moduleSpecifier.text;
			if (specifier.startsWith('.') && !specifier.endsWith('.js') && !specifier.endsWith('.json')) {
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
	return ts.visitNode(sourceFile, visitor);
};
const commonjsToEsModuleTransformer = (context) => (sourceFile) => {
	let needsFileURLToPath = false;
	const visitor = (node) => {
		if (ts.isIdentifier(node) && node.text === '__filename') {
			needsFileURLToPath = true;
			return ts.factory.createCallExpression(ts.factory.createIdentifier('fileURLToPath'), void 0, [
				ts.factory.createPropertyAccessExpression(
					ts.factory.createMetaProperty(ts.SyntaxKind.ImportKeyword, ts.factory.createIdentifier('meta')),
					'url'
				)
			]);
		}
		if (ts.isIdentifier(node) && node.text === '__dirname') {
			needsFileURLToPath = true;
			return ts.factory.createCallExpression(ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('path'), 'dirname'), void 0, [
				ts.factory.createCallExpression(ts.factory.createIdentifier('fileURLToPath'), void 0, [
					ts.factory.createPropertyAccessExpression(
						ts.factory.createMetaProperty(ts.SyntaxKind.ImportKeyword, ts.factory.createIdentifier('meta')),
						'url'
					)
				])
			]);
		}
		return ts.visitEachChild(node, visitor, context);
	};
	let transformedFile = ts.visitNode(sourceFile, visitor);
	if (needsFileURLToPath) {
		const urlImport = ts.factory.createImportDeclaration(
			void 0,
			ts.factory.createImportClause(
				false,
				void 0,
				ts.factory.createNamedImports([ts.factory.createImportSpecifier(false, void 0, ts.factory.createIdentifier('fileURLToPath'))])
			),
			ts.factory.createStringLiteral('url')
		);
		const pathImport = ts.factory.createImportDeclaration(
			void 0,
			ts.factory.createImportClause(false, ts.factory.createIdentifier('path'), void 0),
			ts.factory.createStringLiteral('path')
		);
		transformedFile = ts.factory.updateSourceFile(transformedFile, [urlImport, pathImport, ...transformedFile.statements]);
	}
	return transformedFile;
};
const schemaUuidTransformer = (uuid) => (context) => (sourceFile) => {
	const visitor = (node) => {
		if (ts.isObjectLiteralExpression(node)) {
			const hasSchemaProperties = node.properties.some(
				(prop) =>
					ts.isPropertyAssignment(prop) &&
					ts.isIdentifier(prop.name) &&
					['fields', 'icon', 'status', 'revision', 'livePreview'].includes(prop.name.text)
			);
			if (hasSchemaProperties) {
				const hasIdProperty = node.properties.some((prop) => ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.text === '_id');
				if (!hasIdProperty) {
					const idProperty = ts.factory.createPropertyAssignment('_id', ts.factory.createStringLiteral(uuid));
					return ts.factory.updateObjectLiteralExpression(node, [idProperty, ...node.properties]);
				}
			}
		}
		return ts.visitEachChild(node, visitor, context);
	};
	return ts.visitNode(sourceFile, visitor);
};
const defaultLogger = {
	info: (msg) => console.log(`\x1B[34m[Compile]\x1B[0m ${msg}`),
	success: (msg) => console.log(`\x1B[34m[Compile]\x1B[0m \x1B[32m${msg}\x1B[0m`),
	warn: (msg) => console.warn(`\x1B[34m[Compile]\x1B[0m \x1B[33m${msg}\x1B[0m`),
	error: (msg, err) => console.error(`\x1B[34m[Compile]\x1B[0m \x1B[31m${msg}\x1B[0m`, err)
};
function logSuccess(logger2, msg) {
	if (logger2.success) {
		logger2.success(msg);
	} else {
		logger2.info(msg);
	}
}
async function compile(options = {}) {
	const startTime = Date.now();
	const logger2 = options.logger || defaultLogger;
	const userCollections = options.userCollections || path.posix.join(process.cwd(), 'config/collections');
	const compiledCollections = options.compiledCollections || path.posix.join(process.cwd(), 'compiledCollections');
	const concurrencyLimit = options.concurrency || 5;
	const result = {
		processed: 0,
		skipped: 0,
		errors: [],
		duration: 0,
		orphanedFiles: [],
		schemaWarnings: []
	};
	try {
		await fs.mkdir(userCollections, { recursive: true });
		await fs.mkdir(compiledCollections, { recursive: true });
		const { existingFilesByPath, existingFilesByHash } = await scanCompiledFiles(compiledCollections, logger2);
		const sourceFiles = await getTypescriptAndJavascriptFiles(userCollections);
		const sourceFileSet = new Set(sourceFiles);
		await createOutputDirectories(sourceFiles, compiledCollections);
		const processedJsPaths = /* @__PURE__ */ new Set();
		const queue = [...sourceFiles];
		const workers = [];
		const worker = async () => {
			while (queue.length > 0) {
				const file = queue.shift();
				if (!file) break;
				if (options.targetFile) {
					const normalizedTarget = path.normalize(options.targetFile);
					const normalizedFile = path.normalize(path.join(userCollections, file));
					if (!normalizedFile.endsWith(normalizedTarget) && !normalizedTarget.endsWith(file)) {
						continue;
					}
				}
				try {
					const expectedJsPath = file.replace(/\.(ts|js)$/, '.js');
					const jsFilePath = await compileFile(
						file,
						userCollections,
						compiledCollections,
						existingFilesByPath,
						existingFilesByHash,
						sourceFileSet,
						logger2
					);
					if (jsFilePath) {
						if (jsFilePath === 'SKIPPED') {
							processedJsPaths.add(expectedJsPath);
							result.skipped++;
						} else {
							processedJsPaths.add(jsFilePath);
							result.processed++;
						}
					}
				} catch (err) {
					result.errors.push({
						file,
						error: err instanceof Error ? err : new Error(String(err))
					});
					logger2.error(`Failed to compile ${file}`, err);
				}
			}
		};
		for (let i = 0; i < Math.min(concurrencyLimit, sourceFiles.length); i++) {
			workers.push(worker());
		}
		await Promise.all(workers);
		if (!options.targetFile) {
			result.orphanedFiles = await cleanupOrphanedFiles(existingFilesByPath, processedJsPaths, compiledCollections, logger2);
		}
	} catch (error2) {
		logger2.error('Fatal compilation error', error2);
		if (error2 instanceof Error && error2.message.includes('Collection name conflict')) {
			throw error2;
		}
		throw error2;
	}
	result.duration = Date.now() - startTime;
	return result;
}
async function scanCompiledFiles(dir, logger2) {
	const byPath = /* @__PURE__ */ new Map();
	const byHash = /* @__PURE__ */ new Map();
	async function traverse(current) {
		try {
			const entries = await fs.readdir(current, { withFileTypes: true });
			for (const entry of entries) {
				const fullPath = path.posix.join(current, entry.name);
				if (entry.isDirectory()) {
					await traverse(fullPath);
				} else if (entry.isFile() && entry.name.endsWith('.js')) {
					const relativePath = path.posix.relative(dir, fullPath);
					try {
						const content = await fs.readFile(fullPath, 'utf8');
						const hash = extractHashFromJs(content);
						const uuid = extractUUIDFromJs(content);
						const data = { jsPath: relativePath, uuid, hash };
						byPath.set(relativePath, data);
						if (hash) byHash.set(hash, data);
					} catch (e) {
						logger2.warn(`Could not read compiled file ${relativePath}`);
					}
				}
			}
		} catch (e) {
			if (e.code !== 'ENOENT') {
				logger2.error(`Error scanning ${current}`, e);
			}
		}
	}
	await traverse(dir);
	return { existingFilesByPath: byPath, existingFilesByHash: byHash };
}
async function getTypescriptAndJavascriptFiles(folder, subdir = '') {
	const files = [];
	try {
		const entries = await fs.readdir(path.posix.join(folder, subdir), { withFileTypes: true });
		const collectionNames = /* @__PURE__ */ new Set();
		for (const entry of entries) {
			const relativePath = path.posix.join(subdir, entry.name);
			if (entry.isDirectory()) {
				files.push(...(await getTypescriptAndJavascriptFiles(folder, relativePath)));
			} else if (entry.isFile() && /\.(ts|js)$/.test(entry.name)) {
				const name = entry.name.replace(/\.(ts|js)$/, '');
				if (collectionNames.has(name)) {
					throw new Error(`Collection name conflict: "${name}" used multiple times in ${path.posix.join(folder, subdir)}`);
				}
				collectionNames.add(name);
				files.push(relativePath);
			}
		}
	} catch (e) {
		if (e.code === 'ENOENT') return [];
		throw e;
	}
	return files;
}
async function createOutputDirectories(files, baseDir) {
	const dirs = new Set(files.map((f) => path.posix.dirname(f)).filter((d) => d !== '.'));
	await Promise.all(Array.from(dirs).map((d) => fs.mkdir(path.posix.join(baseDir, d), { recursive: true })));
}
async function compileFile(file, srcDir, destDir, existingByPath, existingByHash, sourceSet, logger2) {
	const srcPath = path.posix.join(srcDir, file);
	const targetRel = file.replace(/\.(ts|js)$/, '.js');
	const targetAbs = path.posix.join(destDir, targetRel);
	const content = await fs.readFile(srcPath, 'utf8');
	const hash = createHash('sha256').update(content).digest('hex').slice(0, 16);
	const existing = existingByPath.get(targetRel);
	if (existing && existing.hash === hash) {
		return 'SKIPPED';
	}
	let uuid = null;
	let reason = '';
	const moved = existingByHash.get(hash);
	if (!existing && moved?.uuid) {
		const origTs = moved.jsPath.replace(/\.js$/, '.ts');
		if (!sourceSet.has(origTs)) {
			uuid = moved.uuid;
			reason = 'Reused (move/rename)';
		}
	}
	if (!uuid && existing?.uuid) {
		uuid = existing.uuid;
		reason = 'Reused (path match)';
	}
	if (!uuid) {
		uuid = v4().replace(/-/g, '');
		reason = 'Generated new';
	}
	const transpile = file.endsWith('.ts')
		? ts.transpileModule(content, { compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext } })
		: { outputText: content };
	let code = transformAST(transpile.outputText, uuid);
	code = wrapOutput(code, hash, targetRel);
	await fs.writeFile(targetAbs, code);
	logSuccess(logger2, `Compiled ${file} (${reason}: \x1B[33m${uuid}\x1B[0m)`);
	return targetRel;
}
const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
function transformAST(code, uuid) {
	const source = ts.createSourceFile('temp.js', code, ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS);
	const res = ts.transform(source, [schemaUuidTransformer(uuid), widgetTransformer, addJsExtensionTransformer, commonjsToEsModuleTransformer]);
	return printer.printFile(res.transformed[0]);
}
function wrapOutput(code, hash, pathRel) {
	let out = code.replace(/(\s*\*\s*@file\s+)(.*)/, `$1compiledCollections/${pathRel}`);
	out = out.replace(/^\/\/\s*(HASH|UUID):.*$/gm, '').trimStart();
	return (
		`// WARNING: Generated file. Do not edit.
// HASH: ${hash}

` + out
	);
}
function extractHashFromJs(content) {
	return content.match(/^\/\/\s*HASH:\s*([a-f0-9]{16})\s*$/m)?.[1] || null;
}
function extractUUIDFromJs(content) {
	return content.match(/^\/\/\s*UUID:\s*([a-f0-9-]+)\s*$/m)?.[1] || null;
}
async function cleanupOrphanedFiles(existing, kept, compiledCollections, logger2) {
	const orphanedFiles = Array.from(existing.keys()).filter((f) => !kept.has(f) && f !== 'SKIPPED');
	if (orphanedFiles.length > 0) {
		const divider = '─'.repeat(60);
		logger2.warn(`
┌${divider}┐`);
		logger2.warn(`│  ⚠️  Orphaned Compiled Collections Detected${' '.repeat(15)}│`);
		logger2.warn(`├${divider}┤`);
		logger2.warn(`│${' '.repeat(61)}│`);
		logger2.warn(`│  The following compiled files have no matching source:${' '.repeat(4)}│`);
		for (const file of orphanedFiles) {
			const padding = 57 - file.length;
			logger2.warn(`│    • ${file}${' '.repeat(Math.max(0, padding))}│`);
		}
		logger2.warn(`│${' '.repeat(61)}│`);
		logger2.warn(`│  This usually means:${' '.repeat(39)}│`);
		logger2.warn(`│    1. You renamed/moved a source collection file${' '.repeat(10)}│`);
		logger2.warn(`│    2. You deleted a collection that's no longer needed${' '.repeat(4)}│`);
		logger2.warn(`│${' '.repeat(61)}│`);
		logger2.warn(`│  To clean up manually, delete from:${' '.repeat(23)}│`);
		logger2.warn(`│    ${compiledCollections.slice(-50)}${' '.repeat(Math.max(0, 55 - compiledCollections.slice(-50).length))}│`);
		logger2.warn(`│${' '.repeat(61)}│`);
		logger2.warn(`└${divider}┘
`);
	}
	return orphanedFiles;
}
async function getPrettierConfig() {
	try {
		const config = await prettier.resolveConfig(process.cwd());
		return { ...config, parser: 'typescript' };
	} catch (err) {
		logger.warn('Failed to load Prettier config, using defaults:', err);
		return { parser: 'typescript' };
	}
}
const load = async ({ locals, params }) => {
	try {
		let deepCloneAndRemoveFunctions = function (obj) {
			if (obj === null || typeof obj !== 'object') {
				return obj;
			}
			if (obj instanceof Date) {
				return new Date(obj.getTime());
			}
			if (Array.isArray(obj)) {
				return obj.map((item) => deepCloneAndRemoveFunctions(item));
			}
			const newObj = {};
			for (const key in obj) {
				if (Object.prototype.hasOwnProperty.call(obj, key)) {
					const value = obj[key];
					if (typeof value === 'function') {
						continue;
					}
					newObj[key] = deepCloneAndRemoveFunctions(value);
				}
			}
			return newObj;
		};
		const { user, roles: tenantRoles, isAdmin } = locals;
		const { action } = params;
		if (!user) {
			logger.warn('User not authenticated, redirecting to login');
			throw redirect(302, '/login');
		}
		logger.trace(`User authenticated successfully for user: ${user._id}`);
		const hasManagePermission = hasPermissionWithRoles(user, 'config:collection:manage', tenantRoles);
		if (!isAdmin && !hasManagePermission) {
			const message = `User ${user._id} lacks 'config:collection:manage' permission and is not admin.`;
			logger.warn(message, { userId: user._id, isAdmin, hasManagePermission });
			throw error(403, 'Insufficient permissions');
		}
		const { _id, ...rest } = user;
		const serializedUser = {
			id: _id.toString(),
			...rest,
			isAdmin
			// Include admin status
		};
		if (action === 'new') {
			return {
				user: serializedUser,
				roles: tenantRoles || [],
				// Roles:' key
				permissions,
				// Permissions data
				permissionConfigs,
				// Permission configs
				collection: null
				// Pass null for 'new' action
			};
		}
		await contentManager.refresh();
		const collectionIdentifier = params.contentPath;
		let currentCollection = await contentManager.getCollection(collectionIdentifier);
		if (!currentCollection && !collectionIdentifier.startsWith('/')) {
			currentCollection = await contentManager.getCollection(`/${collectionIdentifier}`);
		}
		if (!currentCollection) {
			logger.warn(`Collection not found at path: ${collectionIdentifier}`, { identifier: collectionIdentifier });
			throw error(404, 'Collection not found');
		}
		const serializableCollection = currentCollection ? deepCloneAndRemoveFunctions(currentCollection) : null;
		return {
			user: serializedUser,
			roles: tenantRoles || [],
			// roles:' key
			permissions,
			// Permissions data
			permissionConfigs,
			//Permission configs
			collection: serializableCollection
		};
	} catch (err) {
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		const message = `Error in load function: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw error(500, message);
	}
};
const actions = {
	// Save Collection
	saveCollection: async ({ request }) => {
		try {
			const formData = await request.formData();
			const fieldsData = formData.get('fields');
			const originalName = formData.get('originalName');
			const contentName = formData.get('name');
			const collectionIcon = formData.get('icon');
			const collectionSlug = formData.get('slug');
			const collectionDescription = formData.get('description');
			const collectionStatus = formData.get('status');
			const fields = JSON.parse(fieldsData);
			const imports = await goThrough(fields, fieldsData);
			const content = await generateCollectionFileWithAST({
				contentName,
				collectionIcon,
				collectionStatus,
				collectionDescription,
				collectionSlug,
				fields,
				imports
			});
			const collectionPath = void 0;
			if (originalName && originalName !== contentName) {
				fs$1.renameSync(`${collectionPath}/${originalName}.ts`, `${process.env.COLLECTIONS_FOLDER_TS}/${contentName}.ts`);
			}
			fs$1.writeFileSync(`${collectionPath}/${contentName}.ts`, content);
			await compile({ logger });
			await contentManager.refresh();
			return { status: 200 };
		} catch (err) {
			const message = `Error in saveCollection action: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			return { status: 500, error: message };
		}
	},
	// Save config
	saveConfig: async ({ request }) => {
		try {
			const formData = await request.formData();
			const categories = JSON.parse(formData.get('categories'));
			const pathCategories = categories.map((cat) => ({
				...cat,
				path: cat.name.toLowerCase().replace(/\s+/g, '-'),
				collections:
					cat.collections?.map((col) => ({
						...col,
						path: `${cat.path || cat.name.toLowerCase().replace(/\s+/g, '-')}/${col.name.toLowerCase().replace(/\s+/g, '-')}`
					})) || []
			}));
			await contentManager.refresh();
			return {
				status: 200,
				categories: pathCategories
			};
		} catch (err) {
			const message = `Error in saveConfig action: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			return { status: 500, error: message };
		}
	},
	// Delete collection
	deleteCollections: async ({ request }) => {
		try {
			const formData = await request.formData();
			const contentTypes = JSON.parse(formData.get('contentTypes'));
			fs$1.unlinkSync(`${process.env.COLLECTIONS_FOLDER_TS}/${contentTypes}.ts`);
			await compile({ logger });
			await contentManager.refresh();
			return { status: 200 };
		} catch (err) {
			const message = `Error in deleteCollections action: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			return { status: 500, error: message };
		}
	}
};
async function goThrough(object, fields) {
	const imports = /* @__PURE__ */ new Set();
	async function processField(field, fields2) {
		if (!(field instanceof Object)) return;
		for (const key in field) {
			const fieldValue = field[key];
			if (typeof fieldValue === 'object' && fieldValue !== null) {
				await processField(fieldValue, fields2);
			}
			if (!fieldValue || typeof fieldValue !== 'object') continue;
			const fieldWithWidget = fieldValue;
			if (!fieldWithWidget.widget) continue;
			const widgetName = fieldWithWidget.widget.Name;
			const widget = widgets.widgetFunctions[widgetName];
			if (!widget || !widget.GuiSchema) continue;
			for (const importKey in widget.GuiSchema) {
				const widgetImport = widget.GuiSchema[importKey].imports;
				if (!widgetImport) continue;
				for (const _import of widgetImport) {
					const importValue = fieldWithWidget[importKey];
					const replacement = (typeof importValue === 'string' ? importValue : '').replace(/🗑️/g, '').trim();
					imports.add(_import.replace(`{${importKey}}`, replacement));
				}
			}
			const widgetCall = `🗑️widgets.${fieldWithWidget.widget.key}(${JSON.stringify(fieldWithWidget.widget.GuiFields, (_k, value) =>
				typeof value === 'string' ? String(value.replace(/\s*🗑️\s*/g, '🗑️').trim()) : value
			)})🗑️`;
			field[key] = widgetCall;
			const parsedFields = JSON.parse(fields2 || '{}');
			if (parsedFields[key]?.permissions) {
				const subWidget = widgetCall.split('}');
				const permissions2 = removeFalseValues(parsedFields[key].permissions);
				const permissionStr = `,"permissions":${JSON.stringify(permissions2)}}`;
				const newWidget = subWidget[0] + permissionStr + subWidget[1];
				field[key] = newWidget;
			}
		}
	}
	try {
		await processField(object, fields);
		return Array.from(imports).join('\n');
	} catch (err) {
		const message = `Error in goThrough function: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw error(500, message);
	}
}
function removeFalseValues(obj) {
	if (typeof obj !== 'object' || obj === null) {
		return obj;
	}
	if (Array.isArray(obj)) {
		return obj.map(removeFalseValues).filter(Boolean);
	}
	return Object.fromEntries(
		Object.entries(obj)
			.map(([key, value]) => [key, removeFalseValues(value)])
			.filter(([, value]) => value !== false)
	);
}
async function generateCollectionFileWithAST(data) {
	try {
		const sourceCode = `/**
 * @file config/collections/${data.contentName}.ts
 * @description Collection file for ${data.contentName}
 */

${data.imports}
import { widgets } from '@widgets/widgetManager.svelte';
import type { Schema } from '@cms-types';

export const schema: Schema = {
	// Collection Name coming from filename so not needed
	
	// Optional & Icon, status, slug
	// See for possible Icons https://icon-sets.iconify.design/
	icon: '',
	status: '',
	description: '',
	slug: '',
	
	// Defined Fields that are used in your Collection
	// Widget fields can be inspected for individual options
	fields: []
};`;
		const sourceFile = ts.createSourceFile(
			`${data.contentName}.ts`,
			sourceCode,
			ts.ScriptTarget.ESNext,
			true
			// setParentNodes
		);
		const transformationResult = ts.transform(sourceFile, [createCollectionTransformer(data)]);
		const transformedSourceFile = transformationResult.transformed[0];
		const printer2 = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
		let result = printer2.printFile(transformedSourceFile);
		result = result.replace(/["']🗑️|🗑️["']/g, '').replace(/🗑️/g, '');
		const prettierConfig = await getPrettierConfig();
		result = await prettier.format(result, prettierConfig);
		return result;
	} catch (error2) {
		logger.error('Error generating collection file with AST:', error2);
		throw new Error(`Failed to generate collection file: ${error2 instanceof Error ? error2.message : String(error2)}`);
	}
}
function createCollectionTransformer(data) {
	return (context) => {
		return (sourceFile) => {
			const visitor = (node) => {
				if (
					ts.isVariableStatement(node) &&
					node.declarationList.declarations.some((decl) => ts.isIdentifier(decl.name) && decl.name.text === 'schema')
				) {
					const schemaObject = createSchemaObjectLiteral(data);
					const newDeclaration = ts.factory.createVariableDeclaration(
						ts.factory.createIdentifier('schema'),
						void 0,
						// exclamation token
						void 0,
						// type  - let TypeScript infer
						schemaObject
						// initializer
					);
					return ts.factory.createVariableStatement(
						[ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
						ts.factory.createVariableDeclarationList([newDeclaration], ts.NodeFlags.Const)
					);
				}
				return ts.visitEachChild(node, visitor, context);
			};
			return ts.visitNode(sourceFile, visitor);
		};
	};
}
function createSchemaObjectLiteral(data) {
	const properties = [];
	properties.push(ts.factory.createPropertyAssignment(ts.factory.createIdentifier('icon'), ts.factory.createStringLiteral(data.collectionIcon)));
	properties.push(ts.factory.createPropertyAssignment(ts.factory.createIdentifier('status'), ts.factory.createStringLiteral(data.collectionStatus)));
	properties.push(
		ts.factory.createPropertyAssignment(
			ts.factory.createIdentifier('description'),
			ts.factory.createStringLiteral(String(data.collectionDescription || ''))
		)
	);
	properties.push(ts.factory.createPropertyAssignment(ts.factory.createIdentifier('slug'), ts.factory.createStringLiteral(data.collectionSlug)));
	const fieldsString = JSON.stringify(data.fields);
	const fieldsExpression = ts.factory.createIdentifier(`🗑️${fieldsString}🗑️`);
	properties.push(ts.factory.createPropertyAssignment(ts.factory.createIdentifier('fields'), fieldsExpression));
	return ts.factory.createObjectLiteralExpression(properties, true);
}
export { actions, load };
//# sourceMappingURL=_page.server.ts.js.map
