/**
 * @file src/routes/(app)/config/collectionbuilder/[action]/[...contentPath]/+page.server.ts
 * @description Server-side logic for creating and editing individual collections.
 *
 * #Features:
 * - Handles 'new' and 'edit' actions based on URL parameters.
 * - Checks for authenticated user in locals (set by hooks.server.ts).
 * - Verifies user permissions: Must be admin or have 'config:collection:manage' permission.
 * - Fetches all permissions and roles to pass to the client (for UI selectors).
 * - For 'edit' mode, fetches the specific collection data from contentManager.
 * - For 'new' mode, returns a null collection object.
 * - Serializes collection data, removing functions before sending to the client.
 * - Provides 'saveCollection' and 'deleteCollections' actions for persistence.
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
import { widgetFunctions as widgets } from '@stores/widgetStore.svelte';

// Auth
// Use hasPermissionWithRoles and roles from locals, like the example pattern
import { hasPermissionWithRoles } from '@src/databases/auth/permissions';
import { permissionConfigs } from '@src/databases/auth/permissions';

import { permissions } from '@src/databases/auth/permissions';

// System Logger
import { logger } from '@utils/logger.server';

// Type definitions for widget field structure
interface WidgetConfig {
	Name: string;
	key: string;
	GuiFields: Record<string, unknown>;
}

interface FieldWithWidget {
	widget?: WidgetConfig;
	[key: string]: unknown;
}

interface WidgetGuiSchema {
	imports?: string[];
	[key: string]: unknown;
}

interface WidgetDefinition {
	GuiSchema?: Record<string, WidgetGuiSchema>;
	[key: string]: unknown;
}

type FieldsData = Record<string, FieldWithWidget>;

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

// Define load function as async function that takes an event parameter
export const load: PageServerLoad = async ({ locals, params }) => {
	try {
		// 1. Get user, roles, and admin status from locals (set by hook)
		const { user, roles: tenantRoles, isAdmin } = locals;
		const { action } = params;

		// 2. User authentication (already done by hook, this is a fallback)
		if (!user) {
			logger.warn('User not authenticated, redirecting to login');
			throw redirect(302, '/login');
		}

		logger.trace(`User authenticated successfully for user: \x1b[34m${user._id}\x1b[0m`);

		// 3. Authorization check
		// Use the 'config:collection:manage' permission string (adjust if needed)
		const hasManagePermission = hasPermissionWithRoles(user, 'config:collection:manage', tenantRoles);

		// Replicate original logic: User must be an Admin OR have the specific permission.
		if (!isAdmin && !hasManagePermission) {
			const message = `User \x1b[34m${user._id}\x1b[0m lacks 'config:collection:manage' permission and is not admin.`;
			logger.warn(message, { userId: user._id, isAdmin, hasManagePermission });
			throw error(403, 'Insufficient permissions');
		}

		// 4. Serialize user data (like the example)
		const { _id, ...rest } = user;
		const serializedUser = {
			id: _id.toString(),
			...rest,
			isAdmin // Include admin status
		};

		// 5. Handle 'new' action
		if (action === 'new') {
			return {
				user: serializedUser,
				roles: tenantRoles || [], // Roles:' key
				permissions, // Permissions data
				permissionConfigs, // Permission configs
				collection: null // Pass null for 'new' action
			};
		}

		// 6. Handle 'edit' action (default)
		await contentManager.refresh(); // Force a refresh to bypass any stale cache
		const collection = params.contentPath;
		const currentCollection = await contentManager.getCollection(`/${collection}`);

		if (!currentCollection) {
			logger.warn(`Collection not found at path: /${collection}`, { path: `/${collection}` });
			throw error(404, 'Collection not found');
		}

		// Helper function to deep clone and remove functions
		function deepCloneAndRemoveFunctions(obj: unknown): unknown {
			if (obj === null || typeof obj !== 'object') {
				return obj;
			}

			if (obj instanceof Date) {
				return new Date(obj.getTime());
			}

			if (Array.isArray(obj)) {
				return (obj as unknown[]).map((item) => deepCloneAndRemoveFunctions(item));
			}

			const newObj: Record<string, unknown> = {};
			for (const key in obj as Record<string, unknown>) {
				if (Object.prototype.hasOwnProperty.call(obj, key)) {
					const value = (obj as Record<string, unknown>)[key];
					if (typeof value === 'function') {
						continue; // Skip functions
					}
					newObj[key] = deepCloneAndRemoveFunctions(value);
				}
			}
			return newObj;
		}

		const serializableCollection = currentCollection ? deepCloneAndRemoveFunctions(currentCollection) : null;

		return {
			user: serializedUser,
			roles: tenantRoles || [], // roles:' key
			permissions, // Permissions data
			permissionConfigs, //Permission configs
			collection: serializableCollection
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
			const fields = JSON.parse(fieldsData) as FieldsData;
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
			const categories = JSON.parse(formData.get('categories') as string);

			// Convert categories to path-based structure
			interface Category {
				name: string;
				path?: string;
				collections?: Array<{
					name: string;
					path?: string;
				}>;
			}

			const pathCategories = (categories as Category[]).map((cat) => ({
				...cat,
				path: cat.name.toLowerCase().replace(/\s+/g, '-'),
				collections:
					cat.collections?.map((col) => ({
						...col,
						path: `${cat.path || cat.name.toLowerCase().replace(/\s+/g, '-')}/${col.name.toLowerCase().replace(/\s+/g, '-')}`
					})) || []
			}));

			// Update collections with new category paths
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
			const contentTypes = JSON.parse(formData.get('contentTypes') as string);
			fs.unlinkSync(`${process.env.COLLECTIONS_FOLDER_TS}/${contentTypes}.ts`);
			await compile();
			await contentManager.refresh();
			return { status: 200 };
		} catch (err) {
			const message = `Error in deleteCollections action: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			return { status: 500, error: message };
		}
	}
};

// Recursively goes through a collection's fields
async function goThrough(object: FieldsData, fields: string): Promise<string> {
	const imports = new Set<string>();

	async function processField(field: FieldWithWidget | FieldsData, fields?: string): Promise<void> {
		if (!(field instanceof Object)) return;

		for (const key in field) {
			const fieldValue = field[key];

			// Recursively process nested fields
			if (typeof fieldValue === 'object' && fieldValue !== null) {
				await processField(fieldValue as FieldWithWidget, fields);
			}

			// Check if this field has a widget configuration
			if (!fieldValue || typeof fieldValue !== 'object') continue;
			const fieldWithWidget = fieldValue as FieldWithWidget;
			if (!fieldWithWidget.widget) continue;

			// Get widget definition
			const widgetName = fieldWithWidget.widget.Name;
			const widgetStore = widgets as unknown as Record<string, WidgetDefinition>;
			const widget = widgetStore[widgetName];
			if (!widget || !widget.GuiSchema) continue;

			// Process widget imports
			for (const importKey in widget.GuiSchema) {
				const widgetImport = widget.GuiSchema[importKey].imports;
				if (!widgetImport) continue;

				for (const _import of widgetImport) {
					const importValue = fieldWithWidget[importKey];
					const replacement = (typeof importValue === 'string' ? importValue : '').replace(/🗑️/g, '').trim();
					imports.add(_import.replace(`{${importKey}}`, replacement));
				}
			}

			// Convert widget to string representation
			const widgetCall = `🗑️widgets.${fieldWithWidget.widget.key}(${JSON.stringify(fieldWithWidget.widget.GuiFields, (_k, value) =>
				typeof value === 'string' ? String(value.replace(/\s*🗑️\s*/g, '🗑️').trim()) : value
			)})🗑️`;

			field[key] = widgetCall as unknown as FieldWithWidget;

			// Add permissions if present
			const parsedFields = JSON.parse(fields || '{}') as FieldsData;
			if (parsedFields[key]?.permissions) {
				const subWidget = widgetCall.split('}');
				const permissions = removeFalseValues(parsedFields[key].permissions);
				const permissionStr = `,"permissions":${JSON.stringify(permissions)}}`;
				const newWidget = subWidget[0] + permissionStr + subWidget[1];
				field[key] = newWidget as unknown as FieldWithWidget;
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
	fields: FieldsData;
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

					// Create new variable declaration (TypeScript 5.9+ API)
					// createVariableDeclaration(name, exclamationToken, type, initializer)
					const newDeclaration = ts.factory.createVariableDeclaration(
						ts.factory.createIdentifier('schema'),
						undefined, // exclamation token
						undefined, // type  - let TypeScript infer
						schemaObject // initializer
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
