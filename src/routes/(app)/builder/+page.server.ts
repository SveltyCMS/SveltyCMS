import { redirect, type Actions } from '@sveltejs/kit';
import { auth, getCollectionModels } from '../../api/db';
import { validate } from '@src/utils/utils';
import { SESSION_COOKIE_NAME } from 'lucia-auth';
import widgets from '@src/components/widgets';
import fs from 'fs';
import prettier from 'prettier';
import prettierConfig from '@root/.prettierrc.json';
import { updateCollections } from '@src/collections';
import { compile } from '../../api/compile/compile';

type Widget = typeof widgets;
type fields = ReturnType<Widget[keyof Widget]>;

// Define load function as async function that takes an event parameter
export async function load(event) {
	// Get session cookie value as string
	const session = event.cookies.get(SESSION_COOKIE_NAME) as string;
	// Validate user using auth and session value
	const user = await validate(auth, session);
	// If user status is 200, return user object
	if (user.status == 200) {
		return {
			user: user.user
		};
	} else {
		throw redirect(302, `/login`);
	}
}

export const actions: Actions = {
	saveCollection: async ({ request }) => {
		const formData = await request.formData();
		const fieldsData = formData.get('fields') as string;
		const originalName = JSON.parse(formData.get('originalName') as string);
		const collectionName = JSON.parse(formData.get('collectionName') as string);
		const fields = JSON.parse(fieldsData) as Array<fields>;
		const imports = goThrough(fields);

		let content = `
	${imports}
	import widgets from '../components/widgets';
	import type { Schema } from './types';
	let schema: Schema = {
		fields: [
			${fields}
		]
	};
	export default schema;
	
	`;
		content = content.replace(/\\n|\\t/g, '').replace(/\\/g, '');

		content = content.replace(/["']🗑️|🗑️["']/g, '').replace(/🗑️/g, '');
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

function goThrough(object: any, imports: Set<string> = new Set()) {
	if (object instanceof Object) {
		for (const key in object) {
			const field = object[key];
			goThrough(field, imports);
			if (field.widget) {
				const widget = widgets[field.widget.key];
				for (const key in widget.GuiSchema) {
					if (!widget.GuiSchema[key].imports) continue;
					for (const _import of widget.GuiSchema[key].imports) {
						const replacement = field[key].replaceAll('🗑️', '').trim();
						imports.add(_import.replaceAll(`{${key}}`, replacement));
					}
				}

				object[key] = `🗑️widgets.${object[key].widget.key}(
					${JSON.stringify(object[key], (key, value) => {
						if (key == 'widget') {
							return undefined;
						}
						if (typeof value == 'string') {
							// console.log(value);
							return value.replace(/\s*🗑️\s*/g, '🗑️').trim();
						}
						return value;
					})}
				)🗑️`;
			}
		}
	}
	return Array.from(imports).join('\n');
}
