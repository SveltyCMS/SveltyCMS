/**
 * @file src/routes/(app)/config/collection/[...contentTypes]/+page.server.ts
 * @description Server-side logic for collection management in the CMS.
 *
 * This module handles:
 * - Authentication and authorization for collection management
 * - CRUD operations for collections (Create, Read, Update, Delete)
 * - Processing and saving collection schemas
 * - Managing collection configurations
 * - Compiling and updating collections
 *
 * Key features:
 * - Role-based access control
 * - Dynamic field processing for widgets
 * - Permission management for collections
 * - File system operations for collection storage
 * - Integration with collection compilation and update processes
 *
 * The module uses SvelteKit's load and actions functions to handle
 * server-side operations and data preparation for the client.
 */

import fs from 'fs';
import prettier from 'prettier';
import * as ts from 'typescript';
import { redirect, type Actions, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Collections
import { contentManager } from '@src/content/ContentManager';
import { compile } from '@src/utils/compilation/compile';

// Widgets
import widgets from '@widgets';

// Auth
import { hasPermissionByAction } from '@src/auth/permissions';
import { permissionConfigs } from '@src/auth/permissions';
import { roles } from '@root/config/roles';
import { permissions } from '@src/auth/permissions';

// System Logger
import { logger } from '@utils/logger.svelte';

// Load Prettier config
async function getPrettierConfig() {
	try {
		const config = await prettier.resolveConfig(process.cwd());
		return { ...config, parser: 'typescript' };
	} catch (err) {
		logger.warn('Failed to load Prettier config, using defaults:', err);
		return { parser: 'typescript' };
	}
}

type fields = ReturnType<WidgetType[keyof WidgetType]>;

// Define load function as async function that takes an event parameter
export const load: PageServerLoad = async ({ locals, params }) => {
	try {
		const { user } = locals;

		if (!user) {
			logger.warn('User not authenticated, redirecting to login');
			throw redirect(302, '/login');
		}

		logger.debug(`User authenticated successfully for user: \x1b[34m${user._id}\x1b[0m`);

		// Check user permission for collection management
		const collectionManagementConfig = permissionConfigs.collectionManagement;
		const permissionCheck = await hasPermissionByAction(user, collectionManagementConfig);
		if (!permissionCheck.hasPermission) {
			const message = `User \x1b[34m${user._id}\x1b[0m does not have permission to access collection management`;
			logger.warn(message);
			throw error(403, 'Insufficient permissions');
		}

		const action = params.action;
		const { _id, ...rest } = user;

		if (action === 'new') {
			return {
				user: { ...rest, id: _id.toString() },
				roles, // Add roles data
				permissions, // Add permissions data
				permissionConfigs // Add permission configs
			};
		}

		await contentManager.initialize();
		const collection = params.contentPath;

		const currentCollection = await contentManager.getCollection(`/${collection}`);

		return {
			user: { ...rest, id: _id.toString() },
			roles, // Add roles data
			permissions, // Add permissions data
			permissionConfigs, // Add permission configs
			collection: {
				module: currentCollection?.module,
				name: currentCollection?.name,
				_id: currentCollection?._id,
				path: currentCollection?.path,
				icon: currentCollection?.icon,
				label: currentCollection?.label,
				description: currentCollection?.description
			}
		};
	} catch (err) {
		if (err instanceof Error && 'status' in err) {
			// This is likely a redirect or an error we've already handled
			throw err;
		}
		const message = `Error in load function: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw error(500, message);
	}
};

export const actions: Actions = {
	// Save Collection
	saveCollection: async ({ request }) => {
		try {
			const formData = await request.formData();
			const fieldsData = formData.get('fields') as string;
			const originalName = formData.get('originalName') as string;
			const contentName = formData.get('name') as string;
			const collectionIcon = formData.get('icon') as string;
			const collectionSlug = formData.get('slug') as string;
			const collectionDescription = formData.get('description');
			const collectionStatus = formData.get('status') as string;

			// Widgets Fields
			const fields = JSON.parse(fieldsData) as Array<fields>;
			const imports = await goThrough(fields, fieldsData);

			// Generate collection file using AST transformation
			const content = await generateCollectionFileWithAST({
				contentName,
				collectionIcon,
				collectionStatus,
				collectionDescription,
				collectionSlug,
				fields,
				imports
			});

			const collectionPath = import.meta.env.userCollectionsPath;

			if (originalName && originalName !== contentName) {
				fs.renameSync(`${collectionPath}/${originalName}.ts`, `${process.env.COLLECTIONS_FOLDER_TS}/${contentName}.ts`);
			}
			fs.writeFileSync(`${collectionPath}/${contentName}.ts`, content);
			await compile();
			//await contentManager.generateContentTypes();
			//await contentManager.generateCollectionFieldTypes();
			await contentManager.updateCollections(true);
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
			const categories = JSON.parse(formData.get('categories') as string);

			// Convert categories to path-based structure
			const pathCategories = categories.map((cat) => ({
				...cat,
				path: cat.name.toLowerCase().replace(/\s+/g, '-'),
				collections:
					cat.collections?.map((col) => ({
						...col,
						path: `${cat.path}/${col.name.toLowerCase().replace(/\s+/g, '-')}`
					})) || []
			}));

			// Update collections with new category paths
			await contentManager.updateCollections(true);
			await getCollectionModels();

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
			const contentTypes = JSON.parse(formData.get('contentTypes') as string);
			fs.unlinkSync(`${process.env.COLLECTIONS_FOLDER_TS}/${contentTypes}.ts`);
			await compile();
			await contentManager.updateCollections(true);
			return { status: 200 };
		} catch (err) {
			const message = `Error in deleteCollections action: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			return { status: 500, error: message };
		}
	}
};

// Recursively goes through a collection's fields
async function goThrough(object: Record<string, unknown>, fields: string): Promise<string> {
	const imports = new Set<string>();
	/// processfields
	async function processField(field: unknown, fields?: string) {
		if (!(field instanceof Object)) return;

		for (const key in field) {
			await processField(field[key], fields);

			if (!field[key]?.widget) continue;

			const widget = widgets[field[key].widget.Name];
			if (!widget || !widget.GuiSchema) continue;

			for (const importKey in widget.GuiSchema) {
				const widgetImport = widget.GuiSchema[importKey].imports;
				if (!widgetImport) continue;

				for (const _import of widgetImport) {
					const replacement = (field[key][importKey] || '').replace(/🗑️/g, '').trim();
					imports.add(_import.replace(`{${importKey}}`, replacement));
				}
			}

			field[key] = `🗑️widgets.${field[key].widget.key}(${JSON.stringify(field[key].widget.GuiFields, (k, value) =>
				typeof value === 'string' ? String(value.replace(/\s*🗑️\s*/g, '🗑️').trim()) : value
			)})🗑️`;
			const parsedFields = JSON.parse(fields || '{}');

			if (parsedFields[key]?.permissions) {
				const subWidget = field[key].split('}');
				const permissions = removeFalseValues(parsedFields[key].permissions);
				const permissionStr = `,"permissions":${JSON.stringify(permissions)}}`;
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

	// Asynchronously processes a field recursively
}

// Check if permissions are present and append them

// Remove false values from an object
function removeFalseValues(obj: unknown): unknown {
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

// AST-based collection file generation
interface CollectionData {
	contentName: string;
	collectionIcon: string;
	collectionStatus: string;
	collectionDescription: string | FormDataEntryValue | null;
	collectionSlug: string;
	fields: Array<fields>;
	imports: string;
}

async function generateCollectionFileWithAST(data: CollectionData): Promise<string> {
	try {
		// Create the base template with imports
		const sourceCode = `/**
 * @file config/collections/${data.contentName}.ts
 * @description Collection file for ${data.contentName}
 */

${data.imports}
import { widgets } from '@widgets/widgetManager.svelte';
import type { Schema } from '@src/content/types';

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

		// Parse the source code into an AST
		const sourceFile = ts.createSourceFile(
			`${data.contentName}.ts`,
			sourceCode,
			ts.ScriptTarget.ESNext,
			true // setParentNodes
		);

		// Transform the AST to inject the collection data
		const transformationResult = ts.transform(sourceFile, [createCollectionTransformer(data)]);
		const transformedSourceFile = transformationResult.transformed[0];

		// Print the transformed AST back to code
		const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
		let result = printer.printFile(transformedSourceFile);

		// Clean up the 🗑️ markers and format with prettier
		result = result.replace(/["']🗑️|🗑️["']/g, '').replace(/🗑️/g, '');

		const prettierConfig = await getPrettierConfig();
		result = await prettier.format(result, prettierConfig);

		return result;
	} catch (error) {
		logger.error('Error generating collection file with AST:', error);
		throw new Error(`Failed to generate collection file: ${error instanceof Error ? error.message : String(error)}`);
	}
}

// Transformer factory to inject collection data into the AST
function createCollectionTransformer(data: CollectionData): ts.TransformerFactory<ts.SourceFile> {
	return (context) => {
		return (sourceFile) => {
			const visitor = (node: ts.Node): ts.VisitResult<ts.Node> => {
				// Find the schema object literal and replace its properties
				if (
					ts.isVariableStatement(node) &&
					node.declarationList.declarations.some((decl) => ts.isIdentifier(decl.name) && decl.name.text === 'schema')
				) {
					// Create the schema object with actual data
					const schemaObject = createSchemaObjectLiteral(data);

					// Create new variable declaration
					const newDeclaration = ts.factory.createVariableDeclaration(
						ts.factory.createIdentifier('schema'),
						ts.factory.createTypeReferenceNode('Schema'),
						schemaObject
					);

					// Create new variable statement with export modifier
					return ts.factory.createVariableStatement(
						[ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
						ts.factory.createVariableDeclarationList([newDeclaration], ts.NodeFlags.Const)
					);
				}

				return ts.visitEachChild(node, visitor, context);
			};

			return ts.visitNode(sourceFile, visitor) as ts.SourceFile;
		};
	};
}

// Create TypeScript AST nodes for the schema object
function createSchemaObjectLiteral(data: CollectionData): ts.ObjectLiteralExpression {
	const properties: ts.ObjectLiteralElementLike[] = [];

	// Add icon property
	properties.push(ts.factory.createPropertyAssignment(ts.factory.createIdentifier('icon'), ts.factory.createStringLiteral(data.collectionIcon)));

	// Add status property
	properties.push(ts.factory.createPropertyAssignment(ts.factory.createIdentifier('status'), ts.factory.createStringLiteral(data.collectionStatus)));

	// Add description property
	properties.push(
		ts.factory.createPropertyAssignment(
			ts.factory.createIdentifier('description'),
			ts.factory.createStringLiteral(String(data.collectionDescription || ''))
		)
	);

	// Add slug property
	properties.push(ts.factory.createPropertyAssignment(ts.factory.createIdentifier('slug'), ts.factory.createStringLiteral(data.collectionSlug)));

	// Add fields property - this is more complex as it contains processed widget calls
	const fieldsString = JSON.stringify(data.fields);
	// Parse the fields as a JavaScript expression (this handles the widget calls)
	const fieldsExpression = ts.factory.createIdentifier(`🗑️${fieldsString}🗑️`);

	properties.push(ts.factory.createPropertyAssignment(ts.factory.createIdentifier('fields'), fieldsExpression));

	return ts.factory.createObjectLiteralExpression(properties, true);
}
