/**
 * @file src/routes/(app)/config/collection/[...collectionName]/+page.server.ts
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
 * - Role-based access control (admin, editor, editor2)
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
import prettierConfig from '@root/.prettierrc.json';
import { updateCollections } from '@collections';
import { compile } from '@api/compile/compile';
import { redirect, type Actions, error } from '@sveltejs/kit';
import type { WidgetType } from '@components/widgets';

// Auth
import { auth, getCollectionModels } from '@src/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

// System Logger
import logger from '@src/utils/logger';

type fields = ReturnType<WidgetType[keyof WidgetType]>;

// Define load function as async function that takes an event parameter
export async function load({ cookies }) {
	if (!auth) {
		logger.error('Authentication system is not initialized');
		throw error(500, 'Internal Server Error');
	}

	// Get session cookie value
	const session_id = cookies.get(SESSION_COOKIE_NAME);

	if (!session_id) {
		logger.error('No session ID found, redirecting to login.');
		throw redirect(302, '/login');
	}

	try {
		// Validate user using auth and session value
		const user = await auth.validateSession({ session_id });

		// If user status is 200, return user object
		if (!user) {
			logger.error('User not authenticated, redirecting to login.');
			throw redirect(302, '/login');
		}

		if (user.role !== 'admin' && user.role !== 'editor' && user.role !== 'editor2') {
			logger.error('User does not have sufficient permissions.');
			throw error(403, "You don't have access to this page");
		}

		// Ensure the user._id is converted to a string
		const { _id, ...rest } = user;
		const userSerializable = { id: _id.toString(), ...rest };

		return { user: userSerializable };
	} catch (e) {
		logger.error('Error validating session:', e);
		throw redirect(302, '/login');
	}
}

// Actions for creating or updating collections
export const actions: Actions = {
	// Save Collection
	saveCollection: async ({ request }) => {
		const formData = await request.formData();
		const fieldsData = formData.get('fields') as string;
		const originalName = JSON.parse(formData.get('originalName') as string);
		const collectionName = JSON.parse(formData.get('collectionName') as string);
		const collectionIcon = JSON.parse(formData.get('icon') as string);
		const collectionSlug = JSON.parse(formData.get('slug') as string);
		const collectionDescription = JSON.parse(formData.get('description') as string);
		const collectionStatus = JSON.parse(formData.get('status') as string);

		// Permissions
		const permissionsData = JSON.parse(formData.get('permissions') as string);
		const cleanedPermissions = removeFalseValues(permissionsData);

		// Widgets Fields
		const fields = JSON.parse(fieldsData) as Array<fields>;
		const imports = await goThrough(fields, fieldsData);

		// Generate fields as formatted string
		let content = `${imports}
            import widgets from '@components/widgets';
            import type { Schema } from './types';
            const schema: Schema = {
				// Collection Name coming from filename so not needed

				// Optional & Icon, status, slug
				// See for possible Icons https://icon-sets.iconify.design/
                icon: '${collectionIcon}',
                status: '${collectionStatus}',
                description: '${collectionDescription}',
                slug: '${collectionSlug}',
                // Collection Permissions by user Roles
				permissions: ${JSON.stringify(cleanedPermissions, null, 2)},
                // Defined Fields that are used in your Collection
				// Widget fields can be inspected for individual options
				fields: ${JSON.stringify(fields)}
            };
            export default schema;`;

		content = content.replace(/\\n|\\t/g, '').replace(/\\/g, '');
		content = content.replace(/["']🗑️|🗑️["']/g, '').replace(/🗑️/g, '');
		content = await prettier.format(content, { ...(prettierConfig as any), parser: 'typescript' });

		try {
			if (originalName && originalName !== collectionName) {
				fs.renameSync(`${import.meta.env.collectionsFolderTS}/${originalName}.ts`, `${import.meta.env.collectionsFolderTS}/${collectionName}.ts`);
			}
			fs.writeFileSync(`${import.meta.env.collectionsFolderTS}/${collectionName}.ts`, content);
			await compile();
			await updateCollections(true);
			await getCollectionModels();
			return { status: 200 };
		} catch (e) {
			return { status: 500, error: e };
		}
	},

	saveConfig: async ({ request }) => {
		const formData = await request.formData();
		const categories = formData.get('categories') as string;
		let config = `
        export function createCategories(collections) {
            return ${categories}
        }
        `;
		config = config.replace(/["']🗑️|🗑️["']/g, '').replace(/🗑️/g, '');
		config = await prettier.format(config, { ...(prettierConfig as any), parser: 'typescript' });
		fs.writeFileSync(`${import.meta.env.collectionsFolderTS}/config.ts`, config);
		await compile();
		await updateCollections(true);
		await getCollectionModels();
	},

	deleteCollections: async ({ request }) => {
		const formData = await request.formData();
		const collectionName = JSON.parse(formData.get('collectionName') as string);
		fs.unlinkSync(`${import.meta.env.collectionsFolderTS}/${collectionName}.ts`);
		await compile();
		await updateCollections(true);
		await getCollectionModels();
		return { status: 200 };
	}
};

// Recursively goes through a collection's fields
async function goThrough(object: any, fields): Promise<string> {
	const widgets = (await import('@components/widgets')).default;
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

					field[key] = `🗑️widgets.${field[key].widget.Name}(${JSON.stringify(field[key].widget.GuiFields, (k, value) =>
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
