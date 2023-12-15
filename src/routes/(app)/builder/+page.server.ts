import { redirect, type Actions } from '@sveltejs/kit';
import { auth, getCollectionModels } from '@api/db';
import { validate } from '@utils/utils';
import { DEFAULT_SESSION_COOKIE_NAME } from 'lucia';
import type { WidgetType } from '@components/widgets';
import fs from 'fs';
import prettier from 'prettier';
import prettierConfig from '@root/.prettierrc.json';
import { updateCollections } from '@collections';
import { compile } from '@api/compile/compile';

type fields = ReturnType<WidgetType[keyof WidgetType]>;

// Define load function as async function that takes an event parameter
export async function load(event) {
	// Get session cookie value as string
	const session = event.cookies.get(DEFAULT_SESSION_COOKIE_NAME) as string;
	// Validate user using auth and session value
	const user = await validate(auth, session);
	// If user status is 200, return user object
	if (user.status == 200) {
		return {
			user: user.user
		};
	} else {
		redirect(302, `/login`);
	}
}

export const actions: Actions = {
	saveCollection: async ({ request }) => {
		const formData = await request.formData();
		console.log(formData);
		const fieldsData = formData.get('fields') as string;
		const originalName = JSON.parse(formData.get('originalName') as string);
		const collectionName = JSON.parse(formData.get('collectionName') as string);
		const collectionIcon = JSON.parse(formData.get('collectionIcon') as string);
		const collectionStatus = JSON.parse(formData.get('collectionStatus') as string);
		const collectionSlug = JSON.parse(formData.get('collectionSlug') as string);

		const fields = JSON.parse(fieldsData) as Array<fields>;
		const imports = await goThrough(fields);

		// Generate fields as formated string
		//console.log(fields);

		// const fieldsString = fields.map((field) => `\t\twidgets.${field.widget.key}(${JSON.stringify(field, null, 2)})`).join(',\n');

		let content = `
	${imports}
	import widgets from '@components/widgets';
	import { roles } from './types';
	import type { Schema } from './types';
	const schema: Schema = {
		// Collection Name coming from filename so not needed

		// Optional & Icon, status, slug
		// See for possible Icons https://icon-sets.iconify.design/
		icon: '${collectionIcon}',
	    status: '${collectionStatus}',
	    slug: '${collectionSlug}',

		// Collection Permissions by user Roles
		permissions: {
			[roles.user]: {
				read: true
			},
			[roles.admin]: {
				write: true
			}
		},

		// Defined Fields that are used in your Collection
		// Widget fields can be inspected for individual options
		fields: [
			${fields}
		]
	};
	export default schema;
	
	`;
		content = content.replace(/\\n|\\t/g, '').replace(/\\/g, '');

		content = content.replace(/["']🗑️|🗑️["']/g, '').replace(/🗑️/g, '');
		console.log('content:', content);
		content = await prettier.format(content, { ...(prettierConfig as any), parser: 'typescript' });
		if (originalName && originalName != collectionName) {
			fs.renameSync(`${import.meta.env.collectionsFolderTS}/${originalName}.ts`, `${import.meta.env.collectionsFolderTS}/${collectionName}.ts`);
		}
		fs.writeFileSync(`${import.meta.env.collectionsFolderTS}/${collectionName}.ts`, content);
		await compile();
		await updateCollections(true);
		await getCollectionModels();
		return null;
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
