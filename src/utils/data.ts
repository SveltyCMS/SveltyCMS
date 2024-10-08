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
 * - Type-safe collection names using CollectionNames type
 * - Consistent API request formatting
 * - Support for pagination, filtering, and sorting in getData
 *
 * Usage:
 * Import and use these functions to perform CRUD operations on collections
 * via the API endpoint.
 */

import axios, { AxiosError } from 'axios';
import { config, toFormData } from './utils';

import type { CollectionNames } from '@src/collections/types';

// System Logs
import { logger } from '@utils/logger';

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
	collectionName: CollectionNames;
	page?: number;
	limit?: number;
	contentLanguage?: string;
	filter?: string;
	sort?: string;
}) {
	const q = toFormData({ method: 'GET', ...query });
	try {
		const response = await axios.post('/api/query', q, {
			...config,
			withCredentials: true // This ensures cookies are sent with the request
		});
		logger.debug('Successfully completed GET request', { data: response.data });
		return response.data as {
			entryList: [any];
			pagesCount: number;
		};
	} catch (error) {
		if (error instanceof AxiosError) {
			logger.error(`AxiosError in POST request: ${error.response?.status}`);
		} else {
			logger.error('Error in POST request:', error);
		}
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
