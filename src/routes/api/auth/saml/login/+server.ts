/**
 * @file src/routes/api/auth/saml/login/+server.ts
 * @description SAML 2.0 / Enterprise SSO Integration Login Redirect Endpoint
 */

import { generateSAMLAuthUrl } from '@src/databases/auth/saml-auth';
import { AppError } from '@utils/error-handling';
import { logger } from '@utils/logger.server';
import { redirect } from '@sveltejs/kit';

export async function GET({ url }) {
	const tenant = url.searchParams.get('tenant') || 'default';
	const product = url.searchParams.get('product') || 'sveltycms';

	try {
		logger.info(`Initiating SAML SSO for tenant: ${tenant}, product: ${product}`);
		const redirectUrl = await generateSAMLAuthUrl(tenant, product);
		throw redirect(302, redirectUrl);
	} catch (error) {
		if (error instanceof Response && error.status === 302) {
			throw error; // Standard SvelteKit redirect
		}
		logger.error('Failed to initiate SAML login:', error);
		throw new AppError('Failed to initiate Enterprise SSO', 500, 'SAML_INIT_FAILED');
	}
}
