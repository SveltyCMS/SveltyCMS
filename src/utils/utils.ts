import { publicEnv } from '@root/config/public';

import fs from 'fs';
import axios from 'axios';
import Path from 'path';

import type { dbInterface } from '@src/databases/dbInterface';
import type { authDBInterface } from '@src/auth/authDBInterface';
import type { User } from '@src/auth/types';

import { addData, updateData, handleRequest } from '@src/utils/data';

import type { Schema } from '@collections/types';
import { browser } from '$app/environment';
import type { z } from 'zod';
import type { MediaAudio, MediaImage, MediaVideo } from './types';

// Stores
import { get } from 'svelte/store';
import { translationProgress, contentLanguage, entryData, mode, collections, collection } from '@stores/store';

export const config = {
	headers: {
		'Content-Type': 'multipart/form-data'
	}
};

// This function generates GUI fields based on field parameters and a GUI schema.
export const getGuiFields = (fieldParams: { [key: string]: any }, GuiSchema: { [key: string]: any }) => {
	const guiFields = {};
	for (const key in GuiSchema) {
		if (Array.isArray(fieldParams[key])) {
			guiFields[key] = deepCopy(fieldParams[key]);
		} else {
			guiFields[key] = fieldParams[key];
		}
	}
	return guiFields;
};

// Function to convert an object to form data
export const obj2formData = (obj: any) => {
	// console.log(obj);
	// Create a new FormData object
	const formData = new FormData();
	// Iterate over the keys of the input object
	for (const key in obj) {
		// Append each key-value pair to the FormData object as a string
		const data = JSON.stringify(obj[key], (key, val) => {
			if (!val && val !== false) return undefined;
			else if (key == 'schema') return undefined;
			else if (key == 'display' && val.default == true) return undefined;
			else if (key == 'display') return ('🗑️' + val + '🗑️').replaceAll('display', 'function display');
			else if (key == 'widget') return { key: val.key, GuiFields: val.GuiFields };
			else if (typeof val === 'function') {
				return '🗑️' + val + '🗑️';
			}
			return val;
		});
		if (!data) continue;
		formData.append(key, data);
	}
	// Return the FormData object
	return formData;
};

// Converts data to FormData object
export const col2formData = async (getData: { [Key: string]: () => any }) => {
	// used to save data
	const formData = new FormData();
	const data = {};
	const parseFiles = async (object: any) => {
		for (const key in object) {
			if (!(object[key] instanceof File) && typeof object[key] == 'object') {
				parseFiles(object[key]);
				continue;
			} else if (!(object[key] instanceof File)) {
				continue;
			}
			// object[key] is file here
			const uuid = (await createRandomID()).toString();
			formData.append(uuid, object[key]);
			object[key] = { instanceof: 'File', id: uuid, path: object[key].path };
		}
	};

	for (const key in getData) {
		const value = await getData[key]();
		if (!value) continue;
		data[key] = value;
	}

	await parseFiles(data);

	for (const key in data) {
		if (typeof data[key] === 'object') {
			formData.append(key, JSON.stringify(data[key]));
		} else {
			formData.append(key, data[key]);
		}
	}
	if (!formData.entries().next().value) {
		return null;
	}
	return formData;
};

// Helper function to sanitize file names
export function sanitize(str: string) {
	return str.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
}

// Utility to hash file content
async function hashFileContent(buffer: Buffer): Promise<string> {
	return (await sha256(buffer)).slice(0, 20);
}

// Utility to sanitize and prepare file names
function getSanitizedFileName(fileName: string): { fileNameWithoutExt: string; ext: string } {
	const ext = Path.extname(fileName).toLowerCase();
	const fileNameWithoutExt = sanitize(Path.basename(fileName, ext));
	return { fileNameWithoutExt, ext };
}

export async function saveMedia(type: string, file: File, collectionName: string, dbAdapter: dbInterface) {
	switch (type) {
		case 'image':
			return await saveImage(file, collectionName, dbAdapter);
		case 'document':
			return await saveDocument(file, collectionName, dbAdapter);
		case 'audio':
			return await saveAudio(file, collectionName, dbAdapter);
		case 'video':
			return await saveVideo(file, collectionName, dbAdapter);
		case 'remote':
			return await saveRemoteMedia(file, collectionName, dbAdapter);
		default:
			throw new Error(`Unsupported media type: ${type}`);
	}
}

// Get the environment variables for image sizes
const env_sizes = publicEnv.IMAGE_SIZES;
export const SIZES = { ...env_sizes, original: 0, thumbnail: 200 } as const;

// Saves image to disk and returns file information
export async function saveImage(file: File, collectionName: string, dbAdapter: dbInterface): Promise<{ id: string; fileInfo: MediaImage }> {
	try {
		if (typeof window !== 'undefined') return {} as any; // Skip if running in browser
		const sharp = (await import('sharp')).default;
		// const _crypto = (await import('crypto')).default;

		let fileInfo: MediaImage = {} as MediaImage;

		const arrayBuffer = await file.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);
		const hash = (await sha256(buffer)).slice(0, 20);
		const existingFile = await dbAdapter.findOne('media_images', { hash: hash });
		const path = file.path || 'global'; // 'global' | 'unique' | 'collection'
		const { name: fileNameWithoutExt, ext } = removeExtension(file.name); // Extract name without extension
		const sanitizedBlobName = sanitize(fileNameWithoutExt); // Sanitize the name to remove special characters

		if (existingFile) {
			return { id: existingFile._id, fileInfo: existingFile };
		}

		// Original image URL construction
		let url: string;
		if (path === 'global') {
			url = `/original/${hash}-${sanitizedBlobName}.${ext}`;
		} else if (path === 'unique') {
			url = `/${collectionName}/original/${hash}-${sanitizedBlobName}.${ext}`;
		} else {
			url = `/${path}/original/${hash}-${sanitizedBlobName}.${ext}`;
		}

		// Prepend MEDIASERVER_URL if it's set
		if (publicEnv.MEDIASERVER_URL) {
			url = `${publicEnv.MEDIASERVER_URL}/files/${url}`;
		}

		const info = await sharp(buffer).metadata();
		// Construct default file information
		fileInfo = {
			hash,
			original: {
				name: `${hash}-${file.name}`,
				url,
				type: file.type,
				size: file.size,
				width: info.width,
				height: info.height
			}
		};

		if (!fs.existsSync(Path.dirname(`${publicEnv.MEDIA_FOLDER}/${url}`))) {
			fs.mkdirSync(Path.dirname(`${publicEnv.MEDIA_FOLDER}/${url}`), { recursive: true });
		}

		fs.writeFileSync(`${publicEnv.MEDIA_FOLDER}/${url}`, buffer);

		for (const size in SIZES) {
			if (size === 'original') continue;

			const fullName = `${hash}-${sanitizedBlobName}.${publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.format}`;
			const resizedImage = await sharp(buffer)
				.rotate() // Rotate image according to EXIF data
				.resize({ width: SIZES[size] })
				.toFormat(publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.format as keyof import('sharp').FormatEnum, {
					quality: publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.quality
				})
				.toBuffer({ resolveWithObject: true });

			// Save resized image URL construction
			let resizedUrl: string;
			if (path === 'global') {
				resizedUrl = `${size}/${fullName}`;
			} else if (path === 'unique') {
				resizedUrl = `${collectionName}/${size}/${fullName}`;
			} else {
				resizedUrl = `${path}/${size}/${fullName}`;
			}

			// Prepend MEDIASERVER_URL if it's set
			if (publicEnv.MEDIASERVER_URL) {
				resizedUrl = `${publicEnv.MEDIASERVER_URL}/${resizedUrl}`;
			}

			if (!fs.existsSync(Path.dirname(`${publicEnv.MEDIA_FOLDER}/${resizedUrl}`))) {
				fs.mkdirSync(Path.dirname(`${publicEnv.MEDIA_FOLDER}/${resizedUrl}`), { recursive: true });
			}

			// Resized images are saved as SIZES
			fs.writeFileSync(`${publicEnv.MEDIA_FOLDER}/${resizedUrl}`, resizedImage.data);
			fileInfo[size] = {
				name: `${fileNameWithoutExt}.${publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.format}`,
				url: resizedUrl,
				type: `image/${publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.format}`,
				size: resizedImage.info.size,
				width: resizedImage.info.width,
				height: resizedImage.info.height
			};
		}

		await dbAdapter.insertMany('media_images', [fileInfo]);

		return { id: (await createRandomID()).toString(), fileInfo: fileInfo as MediaImage };
	} catch (error) {
		console.error('Error saving image:', error);
		// Handle error appropriately, e.g., return null or throw an error
		throw error;
	}
}
// Save files and returns file information
export async function saveDocument(file: File, collectionName: string, dbAdapter: dbInterface) {
	if (browser) return;
	const fields: { file: any; replace: (id: string) => void }[] = [];
	const parseFiles = async (data: any) => {
		for (const fieldname in data) {
			if (!(data[fieldname] instanceof File) && typeof data[fieldname] == 'object') {
				await parseFiles(data[fieldname]);
				continue;
			} else if (!(data[fieldname] instanceof File)) {
				continue;
			}

			const blob = data[fieldname] as File;
			const arrayBuffer = await blob.arrayBuffer();
			const buffer = Buffer.from(arrayBuffer);
			const hash = (await sha256(buffer)).slice(0, 20);
			const existingFile = await dbAdapter.findOne('media_images', { hash: hash });
			if (existingFile) {
				data[fieldname] = existingFile._id.toString(); // ObjectID to string
				continue;
			}

			const path = blob.path; // 'global' | 'unique' | 'collection'
			const { name: fileNameWithoutExt, ext } = removeExtension(blob.name); // Extract name without extension
			const sanitizedBlobName = sanitize(fileNameWithoutExt); // Sanitize the name to remove special characters

			// Original file URL construction
			let url: string;
			if (path == 'global') {
				url = `files/original/${hash}-${sanitizedBlobName}.${ext}`;
			} else if (path == 'unique') {
				url = `files/${collectionName}/original/${hash}-${sanitizedBlobName}.${ext}`;
			} else {
				url = `files/${path}/original/${hash}-${sanitizedBlobName}.${ext}`;
			}

			// Prepend MEDIASERVER_URL if it's set
			if (publicEnv.MEDIASERVER_URL) {
				url = `${publicEnv.MEDIASERVER_URL}/${url}`;
			}

			data[fieldname] = {
				hash,
				original: {
					name: `${hash}-${blob.name}`,
					url,
					type: blob.type,
					size: blob.size
					// createdAt: new Date(),
					// lastModified: new Date(blob.lastModified)
				}
			};

			if (!fs.existsSync(Path.dirname(`${publicEnv.MEDIA_FOLDER}/${url}`))) {
				fs.mkdirSync(Path.dirname(`${publicEnv.MEDIA_FOLDER}/${url}`), { recursive: true });
			}

			fs.writeFileSync(`${publicEnv.MEDIA_FOLDER}/${url}`, buffer);

			fields.push({
				file: data[fieldname],
				replace: (id) => {
					data[fieldname] = id; // `id` is an ObjectId
				}
			});
		}
	};

	await parseFiles(file);

	const res = await dbAdapter.models['media_documents'].insertMany(fields.map((v) => v.file));

	for (const index in res) {
		const id = res[index]._id;
		fields[index].replace(id); // `id` is an ObjectId
	}
}

// Implement the saveVideo function to handle video files
export async function saveVideo(file: File, collectionName: string, dbAdapter: dbInterface) {
	try {
		const buffer = Buffer.from(await file.arrayBuffer());
		const hash = await hashFileContent(buffer);
		const { fileNameWithoutExt, ext } = getSanitizedFileName(file.name);
		const iconName = 'video-icon.svg'; // Assuming an icon file is stored locally or remotely

		const fileInfo = {
			name: `${hash}-${fileNameWithoutExt}.${ext}`,
			type: file.type,
			size: file.size,
			icon: iconName // URL to the icon
			// createdAt: new Date(),
			// lastModified: new Date(file.lastModified)
		};

		// Store the file in the appropriate location
		const filePath = `${publicEnv.MEDIA_FOLDER}/${collectionName}/video/${fileInfo.name}`;
		if (!fs.existsSync(Path.dirname(filePath))) {
			fs.mkdirSync(Path.dirname(filePath), { recursive: true });
		}
		fs.writeFileSync(filePath, buffer);

		// Save fileInfo to database
		await dbAdapter.insertMany('media_videos', [fileInfo]);
		return { id: (await createRandomID()).toString(), fileInfo: fileInfo as MediaVideo };
	} catch (error) {
		console.error('Error saving video:', error);
		throw error;
	}
}

// Implement the saveAudio function to handle audio files
export async function saveAudio(file: File, collectionName: string, dbAdapter: dbInterface) {
	try {
		const buffer = Buffer.from(await file.arrayBuffer());
		const hash = await hashFileContent(buffer);
		const { fileNameWithoutExt, ext } = getSanitizedFileName(file.name);
		const iconName = 'audio-icon.svg'; // Assuming an icon file is stored locally or remotely

		const fileInfo = {
			name: `${hash}-${fileNameWithoutExt}.${ext}`,
			type: file.type,
			size: file.size,
			icon: iconName, // URL to the icon
			createdAt: new Date(),
			lastModified: new Date(file.lastModified)
		};

		// Store the file in the appropriate location
		const filePath = `${publicEnv.MEDIA_FOLDER}/${collectionName}/audio/${fileInfo.name}`;
		if (!fs.existsSync(Path.dirname(filePath))) {
			fs.mkdirSync(Path.dirname(filePath), { recursive: true });
		}
		fs.writeFileSync(filePath, buffer);

		// Save fileInfo to database
		await dbAdapter.insertMany('media_audio', [fileInfo]);
		return { id: (await createRandomID()).toString(), fileInfo: fileInfo as MediaAudio };
	} catch (error) {
		console.error('Error saving audio:', error);
		throw error;
	}
}

// Implement the saveRemoteMedia function to handle remote video files
export async function saveRemoteMedia(fileUrl: string, collectionName: string, dbAdapter: dbInterface): Promise<{ id: string }> {
	try {
		const response = await fetch(fileUrl);
		if (!response.ok) throw new Error(`Failed to fetch file: ${response.statusText}`);

		const buffer = Buffer.from(await response.arrayBuffer());
		const hash = await hashFileContent(buffer);
		const fileName = decodeURI(fileUrl.split('/').pop() ?? 'defaultName'); // Safeguard default name
		const { fileNameWithoutExt, ext } = getSanitizedFileName(fileName);

		// Construct file URL or path where the file will be stored
		const url = `path_or_url_where_files_are_stored/${hash}-${fileNameWithoutExt}.${ext}`;

		const fileInfo = {
			name: `${hash}-${fileNameWithoutExt}.${ext}`,
			url,
			hash,
			createdAt: new Date()
		};

		// Save fileInfo to database using the collectionName
		const res = await dbAdapter.insertMany(collectionName, [fileInfo]);

		return { id: res[0]._id };
	} catch (error) {
		console.error('Error saving remote media:', error);
		throw error;
	}
}

// finds field title that matches the fieldname and returns that field
function _findFieldByTitle(schema: any, fieldname: string, found = { val: false }): any {
	for (const field of schema.fields) {
		// console.log('field is ', field.db_fieldName, field.label);
		if (field.db_fieldName == fieldname || field.label == fieldname) {
			found.val = true;

			return field;
		} else if (field.fields && field.fields.length > 0) {
			return _findFieldByTitle(field, fieldname, found);
		}
	}
	if (!found) {
		throw new Error('FIELD NOT FOUND');
	}
}

// takes an object and recursively parses any values that can be converted to JSON
export function parse(obj: any) {
	for (const key in obj) {
		try {
			if (Array.isArray(obj[key])) {
				for (const index of obj[key]) {
					obj[key][index] = JSON.parse(obj[key][index]);
				}
			} else {
				obj[key] = JSON.parse(obj[key]);
			}
		} catch (e) {
			console.error(e);
		}

		if (typeof obj[key] != 'string') {
			parse(obj[key]);
		}
	}
	return obj;
}

// Converts fields to schema object
export const fieldsToSchema = (fields: Array<any>) => {
	// removes widget, so it does not set up in db
	let schema: any = {};
	for (const field of fields) {
		schema = { ...schema, ...field.schema };
	}
	delete schema.widget;
	return schema;
};

// Finds documents in collection that match query
export async function find(query: object, collectionName: string) {
	if (!collectionName) return;
	const _query = JSON.stringify(query);
	return (await axios.get(`/api/find?collection=${collectionName}&query=${_query}`)).data;
}

// Finds document in collection with specified ID
export async function findById(id: string, collectionName: string) {
	if (!id || !collectionName) return;
	return (await axios.get(`/api/find?collection=${collectionName}&id=${id}`)).data;
}

// Returns field's database field name or label
export function getFieldName(field: any, sanitize = false) {
	if (sanitize) {
		return (field?.db_fieldName || field?.label)?.replaceAll(' ', '_');
	}
	return (field?.db_fieldName || field?.label) as string;
}

//Save Collections data to database
export async function saveFormData({
	data,
	_collection,
	_mode,
	id,
	authAdapter,
	user_id,
	user
}: {
	data: any;
	_collection?: Schema;
	_mode?: 'edit' | 'create';
	id?: string;
	dbAdapter: any;
	authAdapter: authDBInterface;
	user_id: string;
	user?: User | undefined;
}) {
	debugger;
	//console.log('saveFormData was called');
	const $mode = _mode || get(mode);
	const $collection = _collection || get(collection);
	const $entryData = get(entryData);
	const formData = data instanceof FormData ? data : await col2formData(data);

	if (_mode === 'edit' && !id) {
		throw new Error('ID is required for edit mode.');
	}

	if (!formData) return;

	if (!meta_data.is_empty()) formData.append('_meta_data', JSON.stringify(meta_data.get()));

	// Define status for each collection
	formData.append('status', $collection.status || 'unpublished');

	// Retrieve the user from the auth adapter
	//const user: User | null = await authAdapter.getUserById(user_id);
	const username = user ? user.username : 'Unknown';

	switch ($mode) {
		// Create a new Collection
		case 'create':
			return await addData({ data: formData, collectionName: $collection.name as any });

		// Edit an existing Collection
		case 'edit':
			formData.append('_id', id || $entryData._id);
			formData.append('updatedAt', new Date().getTime().toString());

			if ($collection.revision) {
				// Create a new revision of the Collection
				const newRevision = {
					...$entryData,
					_id: await createRandomID(),
					__v: [
						...($entryData.__v || []),
						{
							revisionNumber: $entryData.__v ? $entryData.__v.length : 0, // Fixed potential error if __v is undefined
							editedAt: new Date().getTime().toString(),
							editedBy: { username },
							changes: {}
						}
					]
				};

				// Append the new revision to the existing revisions
				const revisionFormData = new FormData();
				revisionFormData.append('data', JSON.stringify(newRevision));
				revisionFormData.append('collectionName', $collection.name as any);

				await handleRequest(revisionFormData, 'POST');
			}

			return await updateData({ data: formData, collectionName: $collection.name as any });
	}
}

// Function to delete image files associated with a content item
export async function deleteMediaImage(collectionName: string, fileName: string) {
	const env_sizes = publicEnv.IMAGE_SIZES;
	const SIZES = { ...env_sizes, original: 0, thumbnail: 320 } as const;

	const collection = get(collections).find((collection) => collection.name === collectionName);

	const path = _findFieldByTitle(collection, 'yourFieldName').path; // Replace 'yourFieldName' with the actual field name storing the image file

	try {
		// Delete the original image file from the trash folder
		fs.unlinkSync(`${publicEnv.MEDIA_FOLDER}/trash/${path}/${collectionName}/original/${fileName}`);

		// Delete resized image files from the trash folder
		for (const size in SIZES) {
			fs.unlinkSync(`${publicEnv.MEDIA_FOLDER}/trash/${path}/${collectionName}/${size}/${fileName}`);
		}

		// console.log(`Deleted image files associated with ${fileName}`);
	} catch (error) {
		console.error(`Error deleting image files: ${error}`);
		// Handle the error as needed
	}
}

// Move FormData to trash folder and delete trash files older than 30 days
export async function deleteData(id: any, collectionName: any) {
	// Fetch the entry data before deleting
	const entryData = await findById(id, collectionName);

	// Check if the collection has an 'images' field
	if (entryData && entryData.images) {
		// Move image files associated with the entry to trash folder
		for (const fieldName in entryData.images) {
			const fileName = entryData.images[fieldName]?.original?.name;
			if (fileName) {
				await moveMediaImageToTrash(collectionName, fileName);
			}
		}
	}

	// Move the content item to trash folder
	await fetch(`/api/trash/${collectionName}/${id}`, { method: 'PUT' });

	// Delete trash files older than 30 days
	await deleteOldTrashFiles();
}

// Move image files to trash folder
async function moveMediaImageToTrash(collectionName: string, fileName: string) {
	const env_sizes = publicEnv.IMAGE_SIZES;
	const SIZES = { ...env_sizes, original: 0, thumbnail: 200 } as const;

	const collection = get(collections).find((collection) => collection.name === collectionName);

	const path = _findFieldByTitle(collection, 'yourFieldName').path; // Replace 'yourFieldName' with the actual field name storing the image file

	try {
		// Move the original image file to trash folder
		fs.renameSync(
			`${publicEnv.MEDIA_FOLDER}/${path}/${collectionName}/original/${fileName}`,
			`${publicEnv.MEDIA_FOLDER}/trash/${path}/${collectionName}/original/${fileName}`
		);

		// Move resized image files to trash folder
		for (const size in SIZES) {
			fs.renameSync(
				`${publicEnv.MEDIA_FOLDER}/${path}/${collectionName}/${size}/${fileName}`,
				`${publicEnv.MEDIA_FOLDER}/trash/${path}/${collectionName}/${size}/${fileName}`
			);
		}

		console.log(`Moved image files associated with ${fileName} to trash folder`);
	} catch (error) {
		console.error(`Error moving image files to trash folder: ${error}`);
		// Handle the error as needed
	}
}

// Delete trash files older than 30 days
async function deleteOldTrashFiles() {
	// Get the current date
	const current_date = new Date();

	// Calculate the timestamp for 30 days ago
	const thirty_days_ago = new Date(current_date.getTime() - 30 * 24 * 60 * 60 * 1000);

	// Find all trash files that were created before the 30-day mark
	const old_trash_files = fs.readdirSync(`${publicEnv.MEDIA_FOLDER}/trash`).filter((file) => {
		const stats = fs.statSync(`${publicEnv.MEDIA_FOLDER}/trash/${file}`);
		return stats.ctime < thirty_days_ago;
	});

	// Delete the old trash files
	old_trash_files.forEach((file) => {
		fs.unlinkSync(`${publicEnv.MEDIA_FOLDER}/trash/${file}`);
	});
}

export async function extractData(fieldsData: any): Promise<{ [key: string]: any }> {
	// extracts data from fieldsData because FieldsData is async
	const temp = {};
	for (const key in fieldsData) {
		temp[key] = await fieldsData[key]();
	}
	return temp;
}

/**
 * Formats a file size in bytes to the appropriate unit (bytes, kilobytes, megabytes, or gigabytes).
 * @param sizeInBytes - The size of the file in bytes.
 * @returns The formatted file size as a string.
 */
export function formatBytes(bytes: number) {
	if (bytes < 0) {
		throw new Error('Input size cannot be negative');
	}

	const units = ['bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB'];
	let power = 0;

	while (bytes >= 1024 && power < units.length - 1) {
		bytes /= 1024;
		power++;
	}

	return `${bytes.toFixed(2)} ${units[power]}`;
}

// Function to convert Unix timestamp to readable date string
export function convertTimestampToDateString(timestamp: number) {
	if (timestamp === null || timestamp === undefined) {
		return '-';
	}

	const options: Intl.DateTimeFormatOptions = {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		hour12: false
	};
	const locale = get(contentLanguage);
	const date = new Date(timestamp);
	return date.toLocaleDateString(locale, options);
}

export function formatUptime(uptime: number) {
	const units = [
		{ label: ['year', 'years'], value: 365 * 24 * 60 * 60 },
		{ label: ['month', 'months'], value: 30 * 24 * 60 * 60 },
		{ label: ['week', 'weeks'], value: 7 * 24 * 60 * 60 },
		{ label: ['day', 'days'], value: 24 * 60 * 60 },
		{ label: ['hour', 'hours'], value: 60 * 60 },
		{ label: ['minute', 'minutes'], value: 60 },
		{ label: ['second', 'seconds'], value: 1 }
	];

	const result: string[] = [];
	for (const unit of units) {
		const quotient = Math.floor(uptime / unit.value);
		if (quotient > 0) {
			result.push(`${quotient} ${unit.label[quotient > 1 ? 1 : 0]}`);
			uptime %= unit.value;
		}
	}

	return result.join(' ');
}

// Export function for ReadableExpireIn
export function ReadableExpireIn(expiresIn: string) {
	const expiresInNumber = parseInt(expiresIn, 10); // Assuming expiresIn is a string representation of a number
	const expirationTime = expiresInNumber ? new Date(Date.now() + expiresInNumber) : new Date(); // Calculate expiration time

	const daysDiff = Math.floor((expirationTime.getTime() - Date.now()) / (1000 * 60 * 60 * 24)); // Convert milliseconds to days
	const hoursDiff = Math.floor((expirationTime.getTime() - Date.now()) / (1000 * 60 * 60)) % 24; // Convert remaining milliseconds to hours
	const minutesDiff = Math.floor((expirationTime.getTime() - Date.now()) / (1000 * 60)) % 60; // Convert remaining milliseconds to minutes

	const daysText = daysDiff > 0 ? `${daysDiff} day${daysDiff > 1 ? 's' : ''}` : '';
	const hoursText = hoursDiff > 0 ? `${hoursDiff} hour${hoursDiff > 1 ? 's' : ''}` : '';
	const minutesText = minutesDiff > 0 ? `${minutesDiff} minute${minutesDiff > 1 ? 's' : ''}` : '';

	return `${daysText} ${hoursText} ${minutesText}`.trim();
}

export function removeExtension(fileName: any) {
	const lastDotIndex = fileName.lastIndexOf('.');
	if (lastDotIndex === -1) {
		// If the file has no extension, return the original fileName
		return { name: fileName, ext: '' };
	}
	return { name: fileName.slice(0, lastDotIndex), ext: fileName.slice(lastDotIndex + 1) };
}

export const asAny = (value: any) => value;

// This function takes an object as a parameter and returns a deep copy of it
function deepCopy(obj: any) {
	// If the object is not an object or is null, return it as it is
	if (typeof obj !== 'object' || obj === null) {
		return obj;
	}

	// If the object is a Date instance, return a new Date with the same time value
	if (obj instanceof Date) {
		return new Date(obj.getTime());
	}

	// If the object is an Array instance, return a new array with deep copies of each element
	if (obj instanceof Array) {
		return obj.reduce((arr, item, i) => {
			// Recursively call deepCopy on each element and assign it to the new array
			arr[i] = deepCopy(item);
			return arr;
		}, []);
	}

	// If the object is a plain object, return a new object with deep copies of each property
	if (obj instanceof Object) {
		return Object.keys(obj).reduce((newObj, key) => {
			// Recursively call deepCopy on each property value and assign it to the new object
			newObj[key] = deepCopy(obj[key]);
			return newObj;
		}, {});
	}
}

export function debounce(delay?: number) {
	let timer: NodeJS.Timeout | undefined;
	let first = true;
	return (fn: () => void) => {
		if (first) {
			fn();
			first = false;
			return;
		}
		clearTimeout(timer);
		timer = setTimeout(() => {
			fn();
		}, delay);
	};
}

export function validateZod<T>(schema: z.Schema<T>, value?: T): null | { [P in keyof T]?: string[] | undefined } {
	const res = schema.safeParse(value);
	if (res.success || !value) {
		return null;
	} else {
		return res.error.flatten().fieldErrors as any;
	}
}

export function getTextDirection(lang: string): string {
	const rtlLanguages = ['ar', 'he', 'fa', 'ur', 'dv', 'ha', 'khw', 'ks', 'ku', 'ps', 'syr', 'ug', 'yi']; // Add more RTL languages if needed
	return rtlLanguages.includes(lang) ? 'rtl' : 'ltr';
}

// Motion function
export async function motion(start: number[], end: number[], duration: number, cb: (current: number[]) => void) {
	{
		const current = [...start];
		let elapsed = 0;
		let time = Date.now();
		let has_passed = false;
		setTimeout(() => {
			has_passed = true;
		}, duration);
		return new Promise<void>((resolve) => {
			function animation(current: number[]) {
				elapsed = Date.now() - time;
				// console.log(elapsed);
				const ds = start.map((s, i) => (s - end[i]) / (duration / elapsed));

				time = Date.now();
				for (const index in ds) {
					current[index] -= ds[index];
				}

				if (has_passed) {
					cb(end);
					resolve();
					return;
				} else {
					cb(current);
					requestAnimationFrame(() => animation(current));
				}
			}

			requestAnimationFrame(() => animation(current));
		});
	}
}

// Function to calculate Levenshtein distance with fine-tuned parameters
export function getEditDistance(a: string, b: string): number | undefined {
	if (a.length === 0) return b.length;
	if (b.length === 0) return a.length;

	const insertionCost = 1; // Adjust the cost of insertion
	const deletionCost = 1; // Adjust the cost of deletion
	const substitutionCost = 1; // Adjust the cost of substitution

	const matrix: number[][] = [];

	// Initialize first row and column
	for (let i = 0; i <= b.length; i++) {
		matrix[i] = [i];
	}
	for (let j = 0; j <= a.length; j++) {
		matrix[0][j] = j;
	}

	// Fill in the rest of the matrix
	for (let i = 1; i <= b.length; i++) {
		for (let j = 1; j <= a.length; j++) {
			if (b.charAt(i - 1) === a.charAt(j - 1)) {
				matrix[i][j] = matrix[i - 1][j - 1];
			} else {
				matrix[i][j] = Math.min(
					matrix[i - 1][j - 1] + substitutionCost, // substitution
					Math.min(
						matrix[i][j - 1] + insertionCost, // insertion
						matrix[i - 1][j] + deletionCost
					) // deletion
				);
			}
		}
	}

	// Normalize the distance to make it more intuitive (optional)
	const maxDistance = Math.max(a.length, b.length);
	const normalizedDistance = matrix[b.length][a.length] / maxDistance;

	return normalizedDistance;
}

// checks if the translation progress for a given language exist
export function updateTranslationProgress(data, field) {
	const languages = publicEnv.AVAILABLE_CONTENT_LANGUAGES;
	const $translationProgress = get(translationProgress);
	for (const lang of languages) {
		!$translationProgress[lang] && ($translationProgress[lang] = { total: new Set(), translated: new Set() });
		if (field?.translated) $translationProgress[lang].total.add(field);
		if (field?.translated && data[lang]) $translationProgress[lang].translated.add(field);
		else $translationProgress[lang].translated.delete(field);
	}
	translationProgress.set($translationProgress);
}

export const get_elements_by_id = {
	// This function is used to get elements by id together at the end to minimize calls to database.
	store: {},
	add(collection: string, id: string, callback: (data: any) => void) {
		if (!collection || !id) return;
		if (!this.store[collection]) {
			this.store[collection] = {};
		}
		if (!this.store[collection][id]) {
			this.store[collection][id] = [callback];
		} else {
			this.store[collection][id].push(callback);
		}
	},
	async getAll(dbAdapter: any) {
		const store = this.store;
		this.store = {};
		for (const collection in store) {
			const ids = Object.keys(store[collection]);
			const data = await dbAdapter.findOne(collection, { _id: { $in: ids } });

			for (const doc of data) {
				for (const callback of store[collection][doc._id.toString()]) {
					callback(doc);
				}
			}
		}
	}
};
function getRandomHex(size) {
	const bytes = new Uint8Array(size);
	for (let i = 0; i < size; i++) {
		bytes[i] = Math.floor(Math.random() * 256);
	}

	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
// Create random UUID// Create random ID
export const createRandomID = async (id?: string) => {
	if (id) return id;
	return getRandomHex(16);
	// const { randomBytes } = await import('crypto');
	// const _randomBytes = (await import('crypto')).default.randomBytes;
	// return _randomBytes(16).toString('hex');
};

// Meta data
export const meta_data: {
	meta_data: { [key: string]: any };
	add: (key: 'media_images_remove', data: string[]) => void;
	clear: () => void;
	get: () => { [key: string]: any };
	is_empty: () => boolean;
	media_images?: { removed: string[] }; // Define the media_images property as optional
} = {
	meta_data: {},
	add(key, data) {
		switch (key) {
			case 'media_images_remove':
				if (!this.meta_data?.media_images) this.meta_data.media_images = { removed: [] };
				this.meta_data.media_images.removed.push(...data);
				break;
		}
	},
	get() {
		return this.meta_data;
	},
	clear() {
		this.meta_data = {};
	},
	is_empty() {
		return Object.keys(this.meta_data).length === 0;
	}
};

// PascalCase to camelCase
export const pascalToCamelCase = (str: string) => {
	return str.substring(0, 0) + str.charAt(0).toLowerCase() + str.substring(1);
};

// Escape regex metacharacters
RegExp.escape = (string) => {
	return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

// Convert an object to form data
export const toFormData = function (obj: { [key: string]: string | number }) {
	const formData = new FormData();
	for (const key in obj) {
		if (typeof obj[key] == 'string') {
			formData.append(key, obj[key] as string);
		} else {
			formData.append(key, JSON.stringify(obj[key]));
		}
	}
	return formData;
};

// Get current date
export function get_date() {
	const d = new Date();
	return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// Convert data to string
export function toStringHelper({ field, data, path }: { field: any; data: any[]; path: (lang: string) => string }) {
	if (!data) return '';
	if (field.translated) return path(publicEnv.DEFAULT_CONTENT_LANGUAGE);
	return publicEnv.AVAILABLE_CONTENT_LANGUAGES.reduce((acc, lang) => {
		return (acc += path(lang) + '\n');
	}, '\n');
}

export function sha256(buffer: Buffer) {
	// Get the string as arraybuffer.
	return crypto.subtle.digest('SHA-256', buffer).then(function (hash) {
		return hex(hash);
	});
}

function hex(buffer) {
	let digest = '';
	const view = new DataView(buffer);
	for (let i = 0; i < view.byteLength; i += 4) {
		// We use getUint32 to reduce the number of iterations (notice the `i += 4`)
		const value = view.getUint32(i);
		// toString(16) will transform the integer into the corresponding hex string
		// but will remove any initial "0"
		const stringValue = value.toString(16);
		// One Uint32 element is 4 bytes or 8 hex chars (it would also work with 4
		// chars for Uint16 and 2 chars for Uint8)
		const padding = '00000000';
		const paddedValue = (padding + stringValue).slice(-padding.length);
		digest += paddedValue;
	}

	return digest;
}

// Default theme
export const DEFAULT_THEME = {
	name: 'SveltyCMSTheme',
	path: '/src/themes/SveltyCMS/SveltyCMSTheme.css',
	isDefault: true
};
