/**
 * @file apps/cms/src/routes/api/scim/v2/ServiceProviderConfig/+server.ts
 * @component
 **API endpoint for fetching SCIM service provider configuration.**
 */

import { json } from '@sveltejs/kit';
import type { RequestEvent } from './$types';

export const GET = async ({ url }: RequestEvent) => {
	return json({
		schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
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
				documentationUri: 'https://sveltycms.com/docs/scim',
				type: 'oauthbearertoken',
				primary: true
			}
		],
		meta: {
			location: `${url.origin}/api/scim/v2/ServiceProviderConfig`,
			resourceType: 'ServiceProviderConfig',
			created: new Date().toISOString(),
			lastModified: new Date().toISOString(),
			version: 'v1'
		}
	});
};
