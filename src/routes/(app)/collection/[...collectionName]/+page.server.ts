// import { redirect } from '@sveltejs/kit';
// import { auth } from '@api/db';
// import { validate } from '@utils/utils';
// import { DEFAULT_SESSION_COOKIE_NAME } from 'lucia';

// // Load function that handles authentication, user validation, and data fetching
// export async function load(event) {
// 	// Get session cookie value as string
// 	const session = event.cookies.get(DEFAULT_SESSION_COOKIE_NAME) as string;
// 	// Validate user using auth and session value
// 	const user = await validate(auth, session);

// 	// If user status is 200, return user object
// 	if (user.status === 200) {
// 		// Check if it's a POST request with FormData
// 		if (event.request.method === 'POST') {
// 			const formData = await event.request.formData();
// 			console.log(formData);
// 			// Handle form data processing here
// 			const collectionName = formData.get('collectionName') as string;
// 			console.log('Collection Name:', collectionName);

// 			// Create new collection in database
// 			//const newCollection = await createCollection(collectionName);

// 			// Return an appropriate response or redirect
// 			// Example: return { status: 200, body: { message: 'Collection created successfully' } };
// 		}

// 		// Check if editing an existing collection
// 		const collectionNameParam = event.params.collectionName;
// 		const isEditMode = collectionNameParam !== 'new';

// 		console.log(collectionNameParam);
// 		return {
// 			user: user.user,
// 			isEditMode,
// 			formCollectionName: collectionNameParam
// 		};
// 	} else {
// 		redirect(302, `/login`);
// 	}
// }

// // Function to create a new collection in the database
// //async function createCollection(collectionName) {
// // Implement logic to create a new collection in the database
// // Return the newly created collection object
// //}

import { redirect, type Actions } from '@sveltejs/kit';
import { auth, getCollectionModels } from '@api/db';
import { mode, collections } from '@stores/store';
import { validate } from '@utils/utils';
import { DEFAULT_SESSION_COOKIE_NAME } from 'lucia';
import { updateCollections } from '@collections';
import { compile } from '@api/compile/compile';
import fs from 'fs';
import prettier from 'prettier';
import prettierConfig from '@root/.prettierrc.json';
import type { WidgetType } from '@components/widgets';
import * as ts from 'ts-morph';
import { roles } from '@src/collections/types';
import { Project, SourceFile } from 'ts-morph';


type fields = ReturnType<WidgetType[keyof WidgetType]>;

// Load function that handles authentication, user validation, and data fetching
export async function load(event) {
	// Get session cookie value as string
	const session = event.cookies.get(DEFAULT_SESSION_COOKIE_NAME) as string;
	// Validate user using auth and session value
	const user = await validate(auth, session);

	// If user status is 200, return user object
	if (user.status === 200) {
		// Get collection name from URL parameters
		const collectionNameParam = event.params.collectionName;
		console.log('collectionNameParam:', collectionNameParam);

		let collectionData: any;

		collections.subscribe((collections) => {
			// Check if the collection exists in the store
			const collectionExists = collections.some((collection) => collection.name === collectionNameParam);

			// Set $mode to "view" for new collections and "edit" for existing collections
			mode.set(collectionExists ? 'edit' : 'create');

			// Check if the collectionData is defined
			if (collectionExists) {
				collectionData = JSON.stringify(collections.find((collection) => collection.name === collectionNameParam));
				console.log(collectionData);
			}
		});
		// Subscribe to the mode store and log the current mode to the console
		mode.subscribe((mode) => {
			console.log('Current mode:', mode);
		});
		const isEditMode = collectionNameParam !== 'new';

		return {
			// props: {
			user: user.user,
			isEditMode,
			formCollectionName: collectionNameParam,
			collectionData: collectionData
			// }
		};
	} else {
		return redirect(302, '/login');
	}
}

export const actions: Actions = {
	saveCollections : async ({ request }) => {
		console.log("New");
		const formData = await request.formData();
		console.log(formData);
	
		const originalName = JSON.parse(formData.get('originalName') as string);
		const collectionName = JSON.parse(formData.get('collectionName') as string);
		const collectionIcon = JSON.parse(formData.get('icon') as string);
		const collectionStatus = JSON.parse(formData.get('status') as string);
		const collectionSlug = JSON.parse(formData.get('slug') as string);
		const collectionsPermission = JSON.parse(formData.get('permission') as string);
		console.log('permissions',collectionsPermission)
		const fieldsData = JSON.parse(formData.get('fields') as string);
		const fields = fieldsData as Array<fields>;
		const project = new ts.Project();
		let sourceFile: ts.SourceFile | undefined; // Declare sourceFile with undefined
		const filePath = `${import.meta.env.collectionsFolderTS}${collectionName}.ts`;
		sourceFile = project.addSourceFileAtPath(filePath);
		const variableDeclaration = sourceFile.getVariableDeclaration('schema');

		// Find the schema object literal expression
		if (variableDeclaration) {
			const schemaObjectLiteral = variableDeclaration
			  .getInitializerIfKind(ts.SyntaxKind.ObjectLiteralExpression);
		  
			if (schemaObjectLiteral) {
				const iconProperty = schemaObjectLiteral.getProperty('icon');
				if (iconProperty) {
					iconProperty.replaceWithText(`icon: '${collectionIcon}'`);
				}
			
				const statusProperty = schemaObjectLiteral.getProperty('status');
				console.log("+iconProperty",`'${collectionStatus}'`)
				if (statusProperty) {
					statusProperty.replaceWithText(`status: '${collectionStatus}'`);
				}
			
				const slugProperty = schemaObjectLiteral.getProperty('slug');
				console.log("+iconProperty",`'${collectionSlug}'`)
				if (slugProperty) {
					slugProperty.replaceWithText(`slug: '${collectionSlug}'`);
				}

				const permissionsContent = Object.entries(collectionsPermission)
				.map(([role, permissions]) => {
					// Check if permissions is an object
					if (typeof permissions === 'object' && permissions !== null) {
						const permissionEntries = Object.entries(permissions)
							.map(([action, value]) => `\t\t\t${action}: ${value},`)
							.join('\n');
						console.log("+++++++++",`\t\t[roles.${roles[role]}]: {\n${permissionEntries}\n\t\t},`)
						return `\t\t[roles.${roles[role]}]: {\n${permissionEntries}\n\t\t},`;
					} else {
						// Handle the case when permissions is not an object (e.g., it could be an array)
						console.error(`Invalid permissions format for role '${role}'. Expected an object.`);
						return ''; // or handle it accordingly
					}
				})
				.join('\n');
				const permissionProperty = schemaObjectLiteral.getProperty('permissions')
				if(permissionProperty){
					permissionProperty.replaceWithText(`permissions: { ${permissionsContent} }`);
				}

				const fieldsProperty = schemaObjectLiteral.getProperty('fields')
				if(fieldsProperty){
					fieldsProperty.replaceWithText(`fields: ${JSON.stringify(fieldsData)}`);
					}
			}
		  }
		  sourceFile.saveSync();
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
	}
};

// Recursively goes through an collection fields.
async function goThrough(object: any): Promise<string> {
	const widgets = (await import('@components/widgets')).default;
	const imports = new Set<string>();

	//Asynchronously processes a field recursively.
	async function processField(field: any) {
		if (field instanceof Object) {
			for (const key in field) {
				await processField(field[key]);

				if (field[key]?.widget) {
					const widget = widgets[field[key].widget.key];
					for (const importKey in widget.GuiSchema) {
						const widgetImport = widget.GuiSchema[importKey].imports;
						if (widgetImport) {
							for (const _import of widgetImport) {
								const replacement = (field[key][importKey] || '').replace(/🗑️/g, '').trim();
								imports.add(_import.replace(`{${importKey}}`, replacement));
							}
						}
					}

					field[key] = `🗑️widgets.${field[key].widget.key}(${JSON.stringify(field[key].widget.GuiFields, (k, value) =>
						k === 'type' || k === 'key' ? undefined : typeof value === 'string' ? value.replace(/\s*🗑️\s*/g, '🗑️').trim() : value
					)})🗑️`;
				}
			}
		}
	}

	await processField(object);

	return Array.from(imports).join('\n');
}
