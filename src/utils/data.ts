/**
 * @file src/utils/data.ts
 * @description Utility functions for handling API requests and data operations.
 *
 * This module provides a set of functions to interact with the API:
 * - handleRequest: Generic function to handle API requests
 * - getData: Retrieve data from a specified collection
 * - addData: Add new data to a collection
 * - updateData: Update existing data in a collection
 * - deleteData: Remove data from a collection
 * - setStatus: Set the status of data in a collection
 *
 * Features:
 * - Centralized error handling and logging
 * - Type-safe collection names using CollectionTypes
 * - Consistent API request formatting
 * - Support for pagination, filtering, and sorting in getData
 *
 * Usage:
 * Import and use these functions to perform CRUD operations on collections
 * via the API endpoint.
 */

import axios from 'axios';
import { error } from '@sveltejs/kit';
import { col2formData, config, createRandomID, toFormData } from './utils';
import type { CollectionTypes, Schema, User } from '@src/types';
import type { Entry } from '@src/types/Entry';

// Store
import { collection, collectionValue, mode } from '../stores/collectionStore.svelte';

// System Logs
import { logger } from '@utils/logger.svelte';

// Helper function to handle API requests
export async function handleRequest(data: FormData, method: string) {
	data.append('method', method);

	// Log the FormData entries before sending
	for (const [key, value] of data.entries()) {
		logger.debug(`FormData key: ${key}, value: ${value}`);
	}

	try {
		const response = await axios.post('/api/query', data, {
			...config,
			withCredentials: true // Ensure cookies are sent with the request
		});
		logger.info(`Successfully completed ${method} request`, { data: response.data });
		return response.data;
	} catch (error) {
		logger.error(`Error in ${method} request:`, error as Error);
		throw error;
	}
}

// Function to get data from a specified collection
export async function getData(query: {
	collectionTypes: keyof CollectionTypes;
	page?: number;
	limit?: number;
	contentLanguage?: string;
	filter?: string;
	sort?: string;
}) {
	const q = toFormData({ method: 'GET', ...query });
	return (await axios.post('/api/query', q).then((data) => data.data)) as {
		entryList: Entry[];
		pagesCount: number;
	};
}

// Function to add data to a specified collection
export async function addData({ data, collectionTypes }: { data: FormData; collectionTypes: keyof CollectionTypes }) {
	data.append('collectionTypes', collectionTypes as string);
	data.append('method', 'POST');
	return await axios.post(`/api/query`, data, config).then((res) => res.data);
}

// Function to update data in a specified collection
export async function updateData({ data, collectionTypes }: { data: FormData; collectionTypes: keyof CollectionTypes }) {
	data.append('collectionTypes', collectionTypes as string);
	data.append('method', 'PATCH');
	return await axios.post(`/api/query`, data, config).then((res) => res.data);
}

// Move FormData to trash folder and delete trash files older than 30 days
export async function deleteData({ data, collectionTypes }: { data: FormData; collectionTypes: CollectionTypes }) {
	data.append('collectionTypes', collectionTypes);
	data.append('method', 'DELETE');

	try {
		logger.debug(`Deleting data for collection: ${collectionTypes}`);
		const response = await axios.post(`/api/query`, data, config);
		logger.debug(`Data deleted successfully for collection: ${collectionTypes}`);
		return response.data;
	} catch (err) {
		const message = `Error deleting data for collection ${collectionTypes}: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		if (axios.isAxiosError(err)) {
			logger.error('Axios error details:', {
				response: err.response?.data,
				status: err.response?.status,
				headers: err.response?.headers
			});
		}
		throw new Error(message);
	}
}

// Function to set the status of data in a specified collection
export async function setStatus({ data, collectionTypes }: { data: FormData; collectionTypes: keyof CollectionTypes }) {
	data.append('collectionTypes', collectionTypes as string);
	data.append('method', 'SETSTATUS');
	return await axios.post(`/api/query`, data, config).then((res) => res.data);
}

// Save Collections data to the database
export async function saveFormData({
	data,
	_collection,
	_mode,
	id,
	user
}: {
	data: FormData | { [Key: string]: () => unknown };
	_collection?: Schema;
	_mode?: 'view' | 'edit' | 'create' | 'delete' | 'modify' | 'media';
	id?: string;
	user?: User;
}) {
	logger.debug('saveFormData was called');

	const $mode = _mode || mode();
	const $collection = _collection || collection();

	// Debugging: Log the incoming data
	logger.debug('Incoming data:', data);

	// Convert the collection data to FormData if not already an instance of FormData
	const formData = data instanceof FormData ? data : await col2formData(data);

	if (_mode === 'edit' && !id) {
		const message = 'ID is required for edit mode.';
		logger.error(message);
		throw error(400, message);
	}

	if (!formData) {
		const message = 'FormData is empty, unable to save.';
		logger.error(message);
		throw error(400, message);
	}

	// Debugging: Log the generated FormData
	logger.debug('Generated FormData:');
	for (const [key, value] of formData.entries()) {
		logger.debug(`FormData key: ${key}, value: ${value}`);
	}

	// TODO: Add meta_data to formData
	// if (!meta_data.is_empty()) formData.append('_meta_data', JSON.stringify(meta_data.get()));

	// Safely append status with a default value
	formData.append('status', (collectionValue.value?.status || 'unpublished').toString());

	const username = user ? user.username : 'Unknown';

	try {
		switch ($mode) {
			case 'create':
				logger.debug('Saving data in create mode.');
				formData.append('createdAt', Math.floor(Date.now() / 1000).toString());
				formData.append('updatedAt', (formData.get('createdAt') as string) || '');

				return await addData({ data: formData, collectionTypes: $collection.name as keyof CollectionTypes });

			case 'edit':
				logger.debug('Saving data in edit mode.');
				// Safely append _id with fallback
				formData.append('_id', (id || collectionValue.value?._id || '').toString());
				formData.append('updatedAt', Math.floor(Date.now() / 1000).toString());

				if ($collection.revision) {
					logger.debug('Creating new revision.');
					const newRevision = {
						...collectionValue.value,
						_id: await createRandomID(),
						__v: [
							...(collectionValue.value?.__v || []),
							{
								revisionNumber: collectionValue.value?.__v ? collectionValue.value.__v.length : 0,
								editedAt: Math.floor(Date.now() / 1000).toString(),
								editedBy: { username },
								changes: {}
							}
						]
					};

					const revisionFormData = new FormData();
					revisionFormData.append('data', JSON.stringify(newRevision));
					revisionFormData.append('collectionTypes', $collection.name as keyof CollectionTypes);

					await handleRequest(revisionFormData, 'POST');
				}

				return await updateData({ data: formData, collectionTypes: $collection.path as keyof CollectionTypes });

			default: {
				const message = `Unhandled mode: ${$mode}`;
				logger.error(message);
				throw error(400, message);
			}
		}
	} catch (err) {
		const message = `Failed to save data in mode ${$mode}: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw error(400, message);
	}
}
