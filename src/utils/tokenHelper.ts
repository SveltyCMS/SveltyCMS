import { replaceTokens } from '@src/services/token/engine';
import type { TokenContext } from '@src/services/token/types';
import type { User } from '@src/databases/auth/types';
import { logger } from '@utils/logger';

/**
 * Process tokens in a JSON response body.
 * Recursively traverses the object and replaces tokens in string values.
 */
export async function processTokensInResponse(data: any, user: User | undefined, locale: string): Promise<any> {
	if (!data) return data;

	// Create context
	const context: TokenContext = {
		user,
		locale
		// We can add more context here if needed, like site settings
		// site: ... (handled by engine via publicEnv)
	};

	// Helper to process a single value
	const processValue = async (value: any): Promise<any> => {
		if (typeof value === 'string') {
			if (value.includes('{{')) {
				return await replaceTokens(value, context);
			}
			return value;
		}

		if (Array.isArray(value)) {
			return await Promise.all(value.map(processValue));
		}

		if (typeof value === 'object' && value !== null) {
			// Handle special objects like Date if needed, but usually they are strings in JSON
			if (value instanceof Date) return value;

			const result: Record<string, any> = {};
			for (const [key, val] of Object.entries(value)) {
				result[key] = await processValue(val);
			}
			return result;
		}

		return value;
	};

	try {
		return await processValue(data);
	} catch (e) {
		logger.error('Error processing tokens in response:', e);
		return data; // Fallback to original data on error
	}
}
