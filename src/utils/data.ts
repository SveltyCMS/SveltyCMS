import axios from 'axios';
import { config, toFormData } from './utils';

import type { CollectionNames } from '@src/collections/types';

// System Logs
import logger from '@src/utils/logger';

// Helper function to handle API requests
export async function handleRequest(data: FormData, method: string) {
	data.append('method', method);
	try {
		const response = await axios.post('/api/query', data, config);
		logger.info(`Successfully completed ${method} request`, { data: response.data });
		return response.data;
	} catch (error) {
		logger.error(`Error in ${method} request:`, error as Error);
		throw error;
	}
}

// Function to get data from a specified collection
export async function getData(query: {
	collectionName: CollectionNames;
	page?: number;
	limit?: number;
	contentLanguage?: string;
	filter?: string;
	sort?: string;
}) {
	const q = toFormData({ method: 'GET', ...query });
	try {
		const response = await axios.post('/api/query', q);
		logger.info('Successfully completed GET request', { data: response.data });
		return response.data as {
			entryList: [any];
			pagesCount: number;
		};
	} catch (error) {
		logger.error('Error in GET request:', error as Error);
		throw error;
	}
}

// Function to add data to a specified collection
export async function addData({ data, collectionName }: { data: FormData; collectionName: CollectionNames }) {
	data.append('collectionName', collectionName);
	return handleRequest(data, 'POST');
}

// Function to update data in a specified collection
export async function updateData({ data, collectionName }: { data: FormData; collectionName: CollectionNames }) {
	data.append('collectionName', collectionName);
	return handleRequest(data, 'PATCH');
}

// Function to delete data from a specified collection
export async function deleteData({ data, collectionName }: { data: FormData; collectionName: CollectionNames }) {
	data.append('collectionName', collectionName);
	return handleRequest(data, 'DELETE');
}

// Function to set the status of data in a specified collection
export async function setStatus({ data, collectionName }: { data: FormData; collectionName: CollectionNames }) {
	data.append('collectionName', collectionName);
	return handleRequest(data, 'SETSTATUS');
}
