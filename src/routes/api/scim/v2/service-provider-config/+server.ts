/**
 * @file src/routes/api/scim/v2/ServiceProviderConfig/+server.ts
 * @description API endpoint for fetching SCIM v2 Service Provider Configuration
 *
 * Features
 * - Authorization Check (Admin only)
 * - Get Service Provider Configuration
 * - Error Handling
 */

// type RequestHandler removed
import { SCIM_SCHEMAS } from '@src/types/scim';
import { json } from '@sveltejs/kit';

// Unified Error Handling
import { apiHandler } from '@utils/api-handler';

export const GET = apiHandler(async ({ url }) => {
	return json({
		schemas: [SCIM_SCHEMAS.SERVICE_PROVIDER_CONFIG],
		documentationUri: 'https://sveltycms.com/docs/scim',
		patch: { supported: true },
		bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
		filter: { supported: true, maxResults: 200 },
		changePassword: { supported: false },
		sort: { supported: true },
		etag: { supported: true },
		authenticationSchemes: [
			{
				name: 'OAuth Bearer Token',
				description: 'Authentication scheme using the OAuth Bearer Token Standard',
				specUri: 'http://www.rfc-editor.org/info/rfc6750',
				documentationUri: 'https://sveltycms.com/docs/scim/auth',
				type: 'oauthbearertoken',
				primary: true
			}
		],
		meta: {
			location: `${url.origin}/api/scim/v2/ServiceProviderConfig`,
			resourceType: 'ServiceProviderConfig',
			created: '2026-01-21T00:00:00Z',
			lastModified: '2026-01-21T00:00:00Z',
			version: 'v1'
		}
	});
});
