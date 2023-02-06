import { get } from 'svelte/store';
import { entryData, getFieldsData, language } from '$src/stores/store';
import axios from 'axios';

import type { Schema } from '$src/collections/types';
import { config } from './utils';

export async function shape_fields(fields: Array<any>) {
	// get fields from collection
	let _fields = [];
	if (!fields) return [];
	for (let field of fields) {
		_fields.push({ widget: await field.widget(), field });
	}
	return _fields;
}

export async function saveFormData(collection: Schema) {
	let formData = new FormData();

	for (let getData of get(getFieldsData)) {
		let data = await getData();

		for (let key in data) {
			if (data[key] instanceof FileList) {
				for (let _key in data[key]) {
					// for multiple files
					formData.append(key, data[key][_key]);
				}
			} else if (typeof data[key] === 'object') {
				formData.append(key, JSON.stringify(data[key]));
			} else {
				formData.append(key, data[key]);
			}
		}
	}
	return await saveData(collection, formData);
}

export async function saveSimpleData(
	collection: Schema,
	data: any,
	doc_id?: string,
	insert?: boolean
) {
	let formData = new FormData();
	for (let key in data) {
		console.log(data[key]);
		if (data[key] instanceof FileList) {
			for (let _key in data[key]) {
				// for multiple files
				console.log(data[key]);
				formData.append(key, data[key][_key]);
			}
		} else if (typeof data[key] === 'object') {
			formData.append(key, JSON.stringify(data[key]));
		} else {
			formData.append(key, data[key]);
		}
	}
	return await saveData(collection, formData, doc_id, insert);
}

export async function saveData(
	collection: Schema,
	formData: FormData,
	doc_id?: string,
	insert?: boolean
) {
	console.log(collection);

	let oldData_id = doc_id || (get(entryData) as any)?._id;
	//if formData object is empty then:
	formData.append('status', collection.status);
	if (!formData.entries().next().value) {
		return { data: 404 };
	} else if (oldData_id && !insert) {
		formData.append('_id', oldData_id);

		// return await axios.patch(`${env.HOST}:${env.PORT}/api/${collection.name}`, formData, config);
		return await axios.patch(`/api/${collection.name}`, formData, config);
	} else {
		// return await axios.post(`${env.HOST}:${env.PORT}/api/${collection.name}`, formData, config);
		return await axios.post(`/api/${collection.name}`, formData, config);
	}
}

export function any(input: any) {
	return input as any;
}
export function never(input: any) {
	return input as never;
}
