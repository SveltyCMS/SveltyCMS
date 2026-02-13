/**
 * @file src/services/token/relationResolver.ts
 * @description Client-safe relation token resolution and permission checking
 */
import type { TokenContext } from './types';
import type { FieldInstance } from '@src/content/types';
import type { User } from '@src/databases/auth/types';
import { hasPermissionByAction } from '@src/databases/auth/permissions';
import { logger } from '@utils/logger';

// Checks if user has read access to a collection
export async function canAccessCollection(
	user: User | undefined,
	collectionId: string,
	_tenantId?: string,
	roles?: import('@src/databases/auth/types').Role[]
): Promise<boolean> {
	if (!user) return false;

	// Admins have access to everything
	const userRole = roles?.find((r) => r._id === user.role);
	if (userRole?.isAdmin) return true;

	// Check collection-specific read permission
	return hasPermissionByAction(user, 'read', 'collection', collectionId, roles);
}

// Middleware-aware token resolution that respects user permissions
export async function resolveRelationToken(tokenPath: string, context: TokenContext, user: User | undefined, tenantId?: string): Promise<unknown> {
	// Parse relation path: entry.manufacturer.name
	const parts = tokenPath.split('.');
	if (parts.length < 3 || parts[0] !== 'entry') {
		return null;
	}

	const [, relationField, ...nestedPath] = parts;
	const relationData = context.entry?.[relationField];

	if (!relationData) return null;

	// Security check: Verify user has access to the related collection
	// This is enforced during token registration, but double-check at resolution time
	const schema = context.collection;
	if (schema) {
		const field = (schema.fields as FieldInstance[]).find((f) => (f.db_fieldName || f.label) === relationField);

		if (field?.widget?.Name === 'Relation') {
			const relatedCollectionId = (field.widget as Record<string, any>).collection;
			const hasAccess = await canAccessCollection(user, relatedCollectionId, tenantId, context.roles);

			if (!hasAccess) {
				logger.warn(`Unauthorized relation access attempt: user=${user?._id}, field=${relationField}`);
				return '[Access Denied]';
			}
		}
	}

	// Navigate nested path
	let value = relationData as any;
	for (const key of nestedPath) {
		if (Array.isArray(value)) {
			value = value[0]; // For arrays, take first item
		}
		value = value?.[key];
		if (value === undefined || value === null) break;
	}

	return value;
}
