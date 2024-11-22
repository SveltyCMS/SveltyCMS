/**
 * @file src/routes/(app)/config/collection/[...collectionTypes]/+page.server.ts
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
import { updateCollections } from '@src/collections';
import { compile } from '@root/src/routes/api/compile/compile';
import { redirect, type Actions, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { WidgetType } from '@components/widgets';
import widgets from '@components/widgets'; // Import widgets directly

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

// Auth
import { getCollectionModels } from '@src/databases/db';
import { checkUserPermission } from '@src/auth/permissionCheck';
import { permissionConfigs } from '@src/auth/permissionManager';
import { roles } from '@root/config/roles';
import { permissions } from '@src/auth/permissions';

// System Logger
import { logger } from '@utils/logger';
import { generateCollectionFieldTypes, generateCollectionTypes } from '@utils/collectionTypes';

type fields = ReturnType<WidgetType[keyof WidgetType]>;

// Define load function as async function that takes an event parameter
export const load: PageServerLoad = async ({ locals }) => {
	try {
		const { user } = locals;

		if (!user) {
			logger.warn('User not authenticated, redirecting to login');
			throw redirect(302, '/login');
		}

		logger.debug(`User authenticated successfully for user: ${user._id}`);

		// Check user permission for collection management
		const collectionManagementConfig = permissionConfigs.collectionManagement;
		const permissionCheck = await checkUserPermission(user, collectionManagementConfig);

		if (!permissionCheck.hasPermission) {
			const message = `User ${user._id} does not have permission to access collection management`;
			logger.warn(message);
			throw error(403, 'Insufficient permissions');
		}

		const { _id, ...rest } = user;
		return {
			user: { ...rest, id: _id.toString() },
			roles, // Add roles data
			permissions, // Add permissions data
			permissionConfigs // Add permission configs
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
			const originalName = JSON.parse(formData.get('originalName') as string);
			const collectionTypes = JSON.parse(formData.get('collectionTypes') as string);
			const collectionIcon = JSON.parse(formData.get('icon') as string);
			const collectionSlug = JSON.parse(formData.get('slug') as string);
			const collectionDescription = JSON.parse(formData.get('description') as string);
			const collectionStatus = JSON.parse(formData.get('status') as string);

			// Widgets Fields
			const fields = JSON.parse(fieldsData) as Array<fields>;
			const imports = await goThrough(fields, fieldsData);

			// Generate fields as formatted string
			let content = `
		/**
		 * @file src/collections/${collectionTypes}.ts
		 * @description Collection file for ${collectionTypes}
		 */

		${imports}
		import type { Schema } from '@src/collections/types';
		export const schema: Schema = {
			// Collection Name coming from filename so not needed

			// Optional & Icon, status, slug
			// See for possible Icons https://icon-sets.iconify.design/
			icon: '${collectionIcon}',
			status: '${collectionStatus}',
			description: '${collectionDescription}',
			slug: '${collectionSlug}',

			// Defined Fields that are used in your Collection
			// Widget fields can be inspected for individual options
			fields: ${JSON.stringify(fields)}
		};`;

			// Clean up the content string

			content = content.replace(/\\n|\\t/g, '').replace(/\\/g, '');
			content = content.replace(/["']🗑️|🗑️["']/g, '').replace(/🗑️/g, '');
			const prettierConfig = await getPrettierConfig();
			content = await prettier.format(content, prettierConfig);

			if (originalName && originalName !== collectionTypes) {
				fs.renameSync(`${import.meta.env.collectionsFolderTS}/${originalName}.ts`, `${import.meta.env.collectionsFolderTS}/${collectionTypes}.ts`);
			}
			fs.writeFileSync(`${import.meta.env.collectionsFolderTS}/${collectionTypes}.ts`, content);
			await compile();
			await generateCollectionTypes();
			await generateCollectionFieldTypes();
			await updateCollections(true);
			await getCollectionModels();
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
			const categories = formData.get('categories') as string;
			let config = `
            export function createCategories(collections) {
                return ${categories}
            }
            `;
			config = config.replace(/["']🗑️|🗑️["']/g, '').replace(/🗑️/g, '');
			const prettierConfig = await getPrettierConfig();
			config = await prettier.format(config, prettierConfig);
			fs.writeFileSync(`${import.meta.env.collectionsFolderTS}/config.ts`, config);
			await compile();
			await updateCollections(true);
			await getCollectionModels();
			return { status: 200 };
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
			const collectionTypes = JSON.parse(formData.get('collectionTypes') as string);
			fs.unlinkSync(`${import.meta.env.collectionsFolderTS}/${collectionTypes}.ts`);
			await compile();
			await updateCollections(true);
			await getCollectionModels();
			return { status: 200 };
		} catch (err) {
			const message = `Error in deleteCollections action: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			return { status: 500, error: message };
		}
	}
};

// Recursively goes through a collection's fields
async function goThrough(object: any, fields): Promise<string> {
	try {
		const imports = new Set<string>();

		// Asynchronously processes a field recursively
		async function processField(field: any, fields?: any) {
			if (field instanceof Object) {
				for (const key in field) {
					await processField(field[key], fields);

					if (field[key]?.widget) {
						const widget = widgets[field[key].widget.Name];

						if (widget && widget.GuiSchema) {
							for (const importKey in widget.GuiSchema) {
								const widgetImport = widget.GuiSchema[importKey].imports;
								if (widgetImport) {
									for (const _import of widgetImport) {
										const replacement = (field[key][importKey] || '').replace(/🗑️/g, '').trim();
										imports.add(_import.replace(`{${importKey}}`, replacement));
									}
								}
							}
						}

						field[key] = `🗑️widgets.${field[key].widget.key}(${JSON.stringify(field[key].widget.GuiFields, (k, value) =>
							typeof value === 'string' ? String(value.replace(/\s*🗑️\s*/g, '🗑️').trim()) : value
						)})🗑️`;

						// Check if permission is in fields[key]
						if ('permissions' in JSON.parse(fields)[key]) {
							const parsedFields = JSON.parse(fields);
							const subWidget = field[key].split('}');
							const permissions = removeFalseValues(parsedFields[key].permissions);
							const permissionStr = `,"permissions":${JSON.stringify(permissions)}}`;
							const newWidget = subWidget[0] + permissionStr + subWidget[1];
							field[key] = newWidget;
						}
					}
				}
			}
		}

		await processField(object, fields);

		return Array.from(imports).join('\n');
	} catch (err) {
		const message = `Error in goThrough function: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw error(500, message);
	}
}

// Remove false values from an object
function removeFalseValues(obj: any): any {
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
