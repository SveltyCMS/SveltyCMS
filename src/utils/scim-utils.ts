/**
 * @file src/utils/scim-utils.ts
 * @description SCIM 2.0 utilities for RFC 7644 compliance
 *
 * Features:
 * - SCIM filter parser (eq, co, sw operators)
 * - SCIM PATCH operation engine (add, remove, replace)
 * - Bearer token authentication middleware
 * - Standard SCIM response builders
 */

import { auth } from '@src/databases/db';
import { SCIM_SCHEMAS } from '@src/types/scim';
import type { ScimError, ScimPatchOp } from '@src/types/scim';
import { AppError } from '@utils/error-handling';
import { logger } from '@utils/logger.server';
import { json } from '@sveltejs/kit';

// ============================================================================
// SCIM Filter Parser (RFC 7644 §3.4.2.2)
// ============================================================================

export interface ScimFilter {
	attribute: string;
	operator: 'eq' | 'co' | 'sw';
	value: string;
}

/**
 * Parses a SCIM filter expression into structured filters.
 * Supports: `attribute op "value"` with operators eq, co, sw.
 * Example: `userName eq "john@example.com"` or `emails.value co "@acme"`
 */
export function parseScimFilter(filterString: string | null): ScimFilter[] {
	if (!filterString || !filterString.trim()) return [];

	const filters: ScimFilter[] = [];
	// Match patterns like: attribute op "value" or attribute op value
	const pattern = /(\S+)\s+(eq|co|sw)\s+"([^"]*)"(?:\s+and\s+)?/gi;
	let match: RegExpExecArray | null;

	while ((match = pattern.exec(filterString)) !== null) {
		const [, attribute, operator, value] = match;
		filters.push({
			attribute: attribute.toLowerCase(),
			operator: operator.toLowerCase() as ScimFilter['operator'],
			value
		});
	}

	return filters;
}

/**
 * Applies SCIM filters to a user object.
 * Maps SCIM attribute names to SveltyCMS user properties.
 */
export function matchesScimFilter(user: Record<string, any>, filters: ScimFilter[]): boolean {
	if (filters.length === 0) return true;

	return filters.every((filter) => {
		const fieldValue = resolveScimAttribute(user, filter.attribute);

		if (fieldValue === undefined || fieldValue === null) return false;

		const strValue = String(fieldValue).toLowerCase();
		const filterValue = filter.value.toLowerCase();

		switch (filter.operator) {
			case 'eq':
				return strValue === filterValue;
			case 'co':
				return strValue.includes(filterValue);
			case 'sw':
				return strValue.startsWith(filterValue);
			default:
				return false;
		}
	});
}

/**
 * Resolves a SCIM attribute path to a value on a SveltyCMS user object.
 * Handles dotted paths like `emails.value` and `name.givenName`.
 */
function resolveScimAttribute(obj: Record<string, any>, attribute: string): unknown {
	// Map SCIM attribute names to SveltyCMS user fields
	const scimToDb: Record<string, string> = {
		username: 'email',
		'name.givenname': 'username',
		'name.familyname': 'lastName',
		'name.formatted': 'username',
		displayname: 'username',
		active: 'isActive',
		externalid: '_id',
		id: '_id'
	};

	const lowerAttr = attribute.toLowerCase();

	// Direct mapping
	if (scimToDb[lowerAttr]) {
		return obj[scimToDb[lowerAttr]];
	}

	// Handle emails.value → user.email
	if (lowerAttr === 'emails.value') {
		return obj.email;
	}

	// Dotted path traversal
	const parts = attribute.split('.');
	let current: any = obj;
	for (const part of parts) {
		if (current === null || current === undefined) return undefined;
		current = current[part];
	}
	return current;
}

// ============================================================================
// SCIM PATCH Engine (RFC 7644 §3.5.2)
// ============================================================================

/**
 * Applies SCIM PATCH operations to a target object.
 * Returns the set of database-level field updates.
 *
 * Supports operations: add, replace, remove
 */
export function applyScimPatchOps(_target: Record<string, any>, operations: ScimPatchOp[]): Record<string, any> {
	const updates: Record<string, any> = {};

	for (const op of operations) {
		const path = op.path?.toLowerCase();

		switch (op.op.toLowerCase()) {
			case 'add':
			case 'replace': {
				if (!path && typeof op.value === 'object' && op.value !== null) {
					// No path → merge value object into target
					const mapped = mapScimFieldsToDb(op.value);
					Object.assign(updates, mapped);
				} else if (path) {
					const dbField = mapScimPathToDbField(path);
					if (dbField) {
						updates[dbField] = op.value;
					}
				}
				break;
			}
			case 'remove': {
				if (path) {
					const dbField = mapScimPathToDbField(path);
					if (dbField) {
						updates[dbField] = null;
					}
				}
				break;
			}
			default:
				logger.warn(`Unknown SCIM PATCH op: ${op.op}`);
		}
	}

	return updates;
}

/**
 * Maps a SCIM attribute path to a SveltyCMS database field.
 */
function mapScimPathToDbField(path: string): string | null {
	const mapping: Record<string, string> = {
		username: 'email',
		'name.givenname': 'username',
		'name.familyname': 'lastName',
		'name.formatted': 'username',
		displayname: 'username',
		active: 'isActive',
		'emails[type eq "work"].value': 'email',
		title: 'title',
		externalid: 'externalId'
	};

	return mapping[path] || null;
}

/**
 * Maps a SCIM value object (no-path merge) to SveltyCMS DB fields.
 */
function mapScimFieldsToDb(value: Record<string, any>): Record<string, any> {
	const result: Record<string, any> = {};

	if ('userName' in value) result.email = value.userName;
	if ('active' in value) result.isActive = value.active;
	if ('displayName' in value) result.username = value.displayName;
	if ('name' in value && typeof value.name === 'object') {
		if (value.name.givenName) result.username = value.name.givenName;
		if (value.name.familyName) result.lastName = value.name.familyName;
	}
	if ('emails' in value && Array.isArray(value.emails)) {
		const primary = value.emails.find((e: any) => e.primary) || value.emails[0];
		if (primary?.value) result.email = primary.value;
	}

	return result;
}

// ============================================================================
// SCIM Bearer Token Authentication
// ============================================================================

/**
 * Validates SCIM Bearer token authentication.
 * Checks for a valid API token with admin privileges.
 * Falls back to session-based admin auth if no Bearer token is present.
 */
export async function validateScimAuth(request: Request, locals: App.Locals): Promise<{ authenticated: boolean; error?: string }> {
	const authHeader = request.headers.get('authorization');

	// Option 1: Bearer token
	if (authHeader?.startsWith('Bearer ')) {
		const token = authHeader.slice(7).trim();

		if (!token) {
			return { authenticated: false, error: 'Empty Bearer token' };
		}

		if (!auth) {
			return { authenticated: false, error: 'Authentication service unavailable' };
		}

		try {
			// Validate the token against the API token store
			const tokenResult = await auth.validateToken(token, 'scim');
			if (!tokenResult) {
				return { authenticated: false, error: 'Invalid or expired SCIM token' };
			}
			return { authenticated: true };
		} catch {
			return { authenticated: false, error: 'Token validation failed' };
		}
	}

	// Option 2: Session-based admin auth (fallback for dashboard usage)
	if (locals.user && locals.user.role === 'admin') {
		return { authenticated: true };
	}

	return { authenticated: false, error: 'No valid authentication provided' };
}

// ============================================================================
// SCIM Response Builders
// ============================================================================

/**
 * Builds a SCIM User resource from a SveltyCMS user object.
 */
export function buildScimUser(user: Record<string, any>, baseUrl: string): Record<string, any> {
	return {
		schemas: [SCIM_SCHEMAS.USER],
		id: user._id,
		externalId: user.externalId || user._id,
		userName: user.email,
		name: {
			formatted: user.username || '',
			givenName: user.username || '',
			familyName: user.lastName || ''
		},
		displayName: user.username || user.email,
		active: user.isActive !== false,
		emails: [{ value: user.email, type: 'work', primary: true }],
		roles: user.role ? [{ value: user.role, display: user.role, primary: true }] : [],
		meta: {
			resourceType: 'User',
			created: user.createdAt || new Date().toISOString(),
			lastModified: user.updatedAt || new Date().toISOString(),
			location: `${baseUrl}/api/scim/v2/Users/${user._id}`,
			version: `W/"${user.updatedAt || user.createdAt || Date.now()}"`
		}
	};
}

/**
 * Builds a SCIM Group resource from a SveltyCMS role object.
 */
export function buildScimGroup(role: Record<string, any>, baseUrl: string, members?: Array<{ _id: string; email: string }>): Record<string, any> {
	return {
		schemas: [SCIM_SCHEMAS.GROUP],
		id: role._id,
		displayName: role.name,
		members: (members || []).map((m) => ({
			value: m._id,
			display: m.email,
			$ref: `${baseUrl}/api/scim/v2/Users/${m._id}`
		})),
		meta: {
			resourceType: 'Group',
			created: role.createdAt || new Date().toISOString(),
			lastModified: role.updatedAt || new Date().toISOString(),
			location: `${baseUrl}/api/scim/v2/Groups/${role._id}`
		}
	};
}

/**
 * Builds a SCIM ListResponse.
 */
export function buildScimListResponse<T>(resources: T[], totalResults: number, startIndex: number = 1): Record<string, any> {
	return {
		schemas: [SCIM_SCHEMAS.LIST_RESPONSE],
		totalResults,
		itemsPerPage: resources.length,
		startIndex,
		Resources: resources
	};
}

/**
 * Builds a SCIM Error response.
 */
export function scimError(status: number, detail: string, scimType?: string): Response {
	const body: ScimError = {
		schemas: [SCIM_SCHEMAS.ERROR],
		status: String(status),
		detail,
		...(scimType ? { scimType } : {})
	};
	return json(body, { status });
}

/**
 * Throws a SCIM-formatted AppError for use with apiHandler.
 */
export function throwScimError(status: number, detail: string, scimType?: string): never {
	throw new AppError(detail, status, scimType || 'scimError');
}
