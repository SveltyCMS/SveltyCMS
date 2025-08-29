/**
 * @file src/routes/api/permissions.ts
 * @description API permission checking utilities
 *
 * This file provides centralized permission checking for API endpoints
 * using the existing permission system.
 */

import { error } from '@sveltejs/kit';
import type { User } from '@src/auth/types';
import { hasPermissionByAction } from '@src/auth/permissions';

export interface PermissionCheck {
	resource: string;
	action: string;
}

export interface PermissionResult {
	hasPermission: boolean;
	error?: string;
}

/**
 * Check if a user has permission for a specific API resource and action
 * @param user - The user object
 * @param permission - The permission to check
 * @returns PermissionResult with hasPermission boolean and optional error message
 */
export async function checkApiPermission(user: User | null, permission: PermissionCheck): Promise<PermissionResult> {
	// If no user, deny access
	if (!user) {
		return {
			hasPermission: false,
			error: 'Authentication required'
		};
	}

	// Check if user has the required permission
	const hasPermission = hasPermissionByAction(user, permission.action, permission.resource);

	if (!hasPermission) {
		return {
			hasPermission: false,
			error: `Insufficient permissions: ${permission.action} on ${permission.resource}`
		};
	}

	return {
		hasPermission: true
	};
}

/**
 * Check if a user has permission for a specific collection
 * @param user - The user object
 * @param collectionId - The collection ID to check
 * @param action - The action to perform (read, write, delete)
 * @returns PermissionResult with hasPermission boolean and optional error message
 */
export async function hasCollectionPermission(user: User | null, collectionId: string, action: string): Promise<PermissionResult> {
	// If no user, deny access
	if (!user) {
		return {
			hasPermission: false,
			error: 'Authentication required'
		};
	}

	// Check if user has the required permission for collections
	const hasPermission = hasPermissionByAction(user, action, 'collection');

	if (!hasPermission) {
		return {
			hasPermission: false,
			error: `Insufficient permissions: ${action} on collection ${collectionId}`
		};
	}

	return {
		hasPermission: true
	};
}
