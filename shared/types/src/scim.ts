/**
 * @file apps/cms/src/types/scim.ts
 * @description SCIM type definitions for SvelteKit.
 */

export interface ScimUser {
	schemas: string[];
	id: string;
	userName: string;
	name?: {
		formatted?: string;
		familyName?: string;
		givenName?: string;
	};
	active: boolean;
	emails?: Array<{ value: string; type: string; primary: boolean }>;
	meta: {
		resourceType: 'User';
		created: string;
		lastModified: string;
		location: string;
	};
}

export interface ScimListResponse<T> {
	schemas: string[];
	totalResults: number;
	itemsPerPage: number;
	startIndex: number;
	Resources: T[];
}

export const SCIM_SCHEMAS = {
	USER: 'urn:ietf:params:scim:schemas:core:2.0:User',
	GROUP: 'urn:ietf:params:scim:schemas:core:2.0:Group',
	LIST_RESPONSE: 'urn:ietf:params:scim:api:messages:2.0:ListResponse',
	ERROR: 'urn:ietf:params:scim:api:messages:2.0:Error'
};
