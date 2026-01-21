/**
 * @file src/types/scim.ts
 * @description SCIM (System for Cross-domain Identity Management) type definitions
 *
 * Features:
 * - SCIM User
 * - SCIM Group
 * - SCIM List Response
 * - SCIM Error
 * - SCIM Service Provider Config
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

export interface ScimGroup {
	schemas: string[];
	id: string;
	displayName: string;
	members?: Array<{ value: string; display?: string; $ref?: string }>;
	meta: {
		resourceType: 'Group';
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

export interface ScimError {
	schemas: string[];
	detail?: string;
	status: string;
	scimType?: string;
}

export const SCIM_SCHEMAS = {
	USER: 'urn:ietf:params:scim:schemas:core:2.0:User',
	GROUP: 'urn:ietf:params:scim:schemas:core:2.0:Group',
	LIST_RESPONSE: 'urn:ietf:params:scim:api:messages:2.0:ListResponse',
	SERVICE_PROVIDER_CONFIG: 'urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig',
	ERROR: 'urn:ietf:params:scim:api:messages:2.0:Error'
};
