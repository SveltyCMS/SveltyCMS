/**
 * @file apps/cms/src/routes/api/scim/v2/Users/+server.ts
 * @description API endpoint for managing users via SCIM v2 protocol.
 */

import { json } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { SCIM_SCHEMAS } from '@cms/types/scim';

// Mock database for scaffolding
const users = [
	{
		id: '2819c223-7f76-453a-919d-413861904646',
		userName: 'bjensen@example.com',
		active: true,
		name: {
			formatted: 'Ms. Barbara J Jensen III',
			familyName: 'Jensen',
			givenName: 'Barbara'
		}
	}
];

export const GET = async ({ url }: RequestEvent) => {
	// In a real implementation, this would query the DB with pagination and filtering
	return json({
		schemas: [SCIM_SCHEMAS.LIST_RESPONSE],
		totalResults: users.length,
		itemsPerPage: 10,
		startIndex: 1,
		Resources: users.map((u) => ({
			schemas: [SCIM_SCHEMAS.USER],
			...u,
			meta: {
				resourceType: 'User',
				created: new Date().toISOString(),
				lastModified: new Date().toISOString(),
				location: `${url.origin}/api/scim/v2/Users/${u.id}`
			}
		}))
	});
};

export const POST = async ({ request, url }: RequestEvent) => {
	try {
		// basic scaffolding
		const body = await request.json();
		const newUser = {
			id: crypto.randomUUID(),
			...body,
			schemas: [SCIM_SCHEMAS.USER],
			meta: {
				resourceType: 'User',
				created: new Date().toISOString(),
				lastModified: new Date().toISOString(),
				location: `${url.origin}/api/scim/v2/Users/${crypto.randomUUID()}`
			}
		};

		return json(newUser, { status: 201 });
	} catch (e) {
		return json(
			{
				schemas: [SCIM_SCHEMAS.ERROR],
				status: '400',
				scimType: 'invalidSyntax',
				detail: 'Invalid JSON'
			},
			{ status: 400 }
		);
	}
};
