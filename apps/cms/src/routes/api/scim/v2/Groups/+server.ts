/**
 * @file apps/cms/src/routes/api/scim/v2/Groups/+server.ts
 * @description API endpoint for SCIM v2 Groups.
 */

import { json } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { SCIM_SCHEMAS } from '@cms/types/scim';

export const GET = async ({ url }: RequestEvent) => {
	return json({
		schemas: [SCIM_SCHEMAS.LIST_RESPONSE],
		totalResults: 0,
		itemsPerPage: 10,
		startIndex: 1,
		Resources: []
	});
};
