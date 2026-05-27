/**
 * @file src/routes/api/auth/saml/config/+server.ts
 * @description Admin endpoint to configure SAML IdP connections
 *
 * POST /api/auth/saml/config
 *
 * @param request - The incoming request containing the SAML connection configuration.
 * @param locals - The local state containing the authenticated user.
 * @returns A JSON response containing the created SAML connection.
 * @throws AppError if the user is not authorized or if the SAML connection configuration is invalid.
 */

import { createSAMLConnection } from '@src/databases/auth/saml-auth';
import { AppError } from '@utils/error-handling';
import { logger } from '@utils/logger.server';
import { apiHandler } from '@utils/api-handler';
import { json } from '@sveltejs/kit';

export const POST = apiHandler(async ({ request, locals }) => {
	const { user } = locals;
	if (!user || user.role !== 'admin') {
		throw new AppError('Unauthorized', 403, 'UNAUTHORIZED');
	}

	try {
		const data = await request.json();
		// Requires properties matching Jackson's createSAMLConnection
		// e.g. rawMetadata (XML string), defaultRedirectUrl, tenant, product

		if (!data.rawMetadata || !data.defaultRedirectUrl || !data.tenant || !data.product) {
			throw new AppError('Missing required SAML connection payload', 400, 'INVALID_PAYLOAD');
		}

		logger.info(`Creating new SAML connection for tenant: ${data.tenant}, product: ${data.product}`);
		const result = await createSAMLConnection(data);

		return json({
			success: true,
			data: result
		});
	} catch (error) {
		logger.error('Failed to create SAML connection:', error);
		throw new AppError('Failed to save SAML connection', 500, 'SAML_CONFIG_ERROR');
	}
});
