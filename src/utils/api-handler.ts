/**
 * @file src/utils/apiHandler.ts
 * @description Higher-order wrapper function for API endpoints.
 * Abstraction layer that eliminates try/catch blocks in individual routes.
 */

import type { RequestEvent, RequestHandler } from '@sveltejs/kit';
import { handleApiError } from './error-handling';

type ApiHandlerCallback = (event: RequestEvent) => Promise<Response> | Response;

/**
 * Wraps a SvelteKit RequestHandler to provide unified error handling.
 * Usage:
 * export const POST = apiHandler(async ({ request }) => {
 * // ... logic ...
 * // throw new AppError('Fail', 400); // Handled automatically
 * // parse(schema, body); // Handled automatically
 * return json({ success: true });
 * });
 * @param handler The async function containing business logic
 * @returns A standard SvelteKit RequestHandler
 */
export const apiHandler = (handler: ApiHandlerCallback): RequestHandler => {
	return async (event) => {
		try {
			return await handler(event);
		} catch (err) {
			return handleApiError(err, event);
		}
	};
};
