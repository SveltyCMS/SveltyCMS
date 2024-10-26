/**
 * @file src/routes/api/query/PATCH.ts
 * @description Handler for PATCH operations on collections.
 */

import type { Schema } from '@src/collections/types';
import type { User } from '@src/auth/types';

// Utils
import { modifyRequest } from './modifyRequest';

// System Logger
import { logger } from '@utils/logger';

// Function to handle PATCH requests for a specified collection
export async function _PATCH({ data, schema, user }: { data: FormData; schema: Schema; user: User }) {
	try {
		// Validate schema name
		if (!schema.name) {
			logger.error('Invalid or undefined schema name.');
			throw new Error('Invalid schema name');
		}

		// Perform pre-update modifications
		const result = await modifyRequest({ data, schema, user });
		logger.info(`Document updated successfully in ${schema.name}`, { user: user._id });

		return new Response(JSON.stringify(result));
	} catch (error) {
		logger.error('Error in PATCH operation:', error instanceof Error ? error.message : String(error));
		throw error;
	}
}
