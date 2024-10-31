/**
 * @file src/routes/api/permission/update/+server.ts
 * @description API endpoint for updating permissions and roles in the CMS.
 *
 * This module provides functionality to:
 * - Update roles and their associated permissions
 * - Validate and transform incoming roles/permissions data
 * - Handle authorization and access control
 *
 * Features:
 * - Dynamic permission and role updates
 * - Comprehensive data validation
 * - Error handling and logging
 * - Audit logging for changes
 *
 * Usage:
 * POST /api/permission/update
 * Body: JSON object with 'roles' array
 *
 * Note: This endpoint modifies crucial authorization settings.
 * Ensure proper access controls and input validation are in place.
 */

import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';

// Authorization
import { initializationPromise, authAdapter } from '@src/databases/db';
import { getAllPermissions } from '@src/auth/permissionManager';

// System Logger
import { logger } from '@utils/logger';

// Constants for validation
const MAX_ROLE_NAME_LENGTH = 50;
const ROLE_NAME_PATTERN = /^[a-zA-Z0-9-_\s]+$/;

export const POST: RequestHandler = async ({ request, locals }) => {
	// Authorization check
	const user = locals.user;
	if (!user || !user.isAdmin) {
		logger.warn('Unauthorized attempt to update permissions', { userId: user?._id });
		return json({ success: false, error: 'Unauthorized' }, { status: 403 });
	}

	try {
		await initializationPromise;

		const { roles } = await request.json();

		// Basic array validation
		if (!Array.isArray(roles)) {
			logger.warn('Invalid roles data: not an array');
			return json({ success: false, error: 'Roles must be provided as an array' }, { status: 400 });
		}

		// Validate role structure and constraints
		const validationResult = await validateRoles(roles);
		if (!validationResult.isValid) {
			logger.warn('Role validation failed', { reason: validationResult.error });
			return json({ success: false, error: validationResult.error }, { status: 400 });
		}

		// Log the changes being made
		logger.info('Updating roles and permissions', {
			userId: user._id,
			roleCount: roles.length,
			timestamp: new Date().toISOString()
		});

		await authAdapter?.setAllRoles(roles);

		// Log successful update
		logger.info('Roles and permissions updated successfully', {
			userId: user._id,
			roleCount: roles.length,
			timestamp: new Date().toISOString()
		});

		return json({ success: true }, { status: 200 });
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error('Error updating permissions:', {
			error: errorMessage,
			userId: user._id,
			timestamp: new Date().toISOString()
		});
		return json({ success: false, error: `Error updating permissions: ${errorMessage}` }, { status: 500 });
	}
};

// Validates the complete roles array and their relationships
async function validateRoles(roles: any[]): Promise<{ isValid: boolean; error?: string }> {
	try {
		// Check for empty roles array
		if (roles.length === 0) {
			return { isValid: false, error: 'At least one role must be provided' };
		}

		// Get available permissions for validation
		const availablePermissions = await getAllPermissions();
		const permissionIds = new Set(availablePermissions.map((p) => p._id));

		// Check for unique role names
		const roleNames = new Set<string>();
		let hasAdminRole = false;

		for (const role of roles) {
			// Validate basic structure
			if (!validateRoleStructure(role)) {
				return { isValid: false, error: `Invalid role structure for role: ${role.name || 'unnamed'}` };
			}

			// Validate role name
			if (!validateRoleName(role.name)) {
				return {
					isValid: false,
					error: `Invalid role name: ${role.name}. Names must be 1-${MAX_ROLE_NAME_LENGTH} characters and contain only letters, numbers, spaces, hyphens, and underscores.`
				};
			}

			// Check for duplicate names
			if (roleNames.has(role.name.toLowerCase())) {
				return { isValid: false, error: `Duplicate role name: ${role.name}` };
			}
			roleNames.add(role.name.toLowerCase());

			// Validate permissions
			for (const permission of role.permissions) {
				if (!permissionIds.has(permission)) {
					return { isValid: false, error: `Invalid permission: ${permission} in role: ${role.name}` };
				}
			}

			// Track admin role
			if (role.isAdmin) {
				hasAdminRole = true;
			}
		}

		// Ensure at least one admin role exists
		if (!hasAdminRole) {
			return { isValid: false, error: 'At least one role must be designated as admin' };
		}

		return { isValid: true };
	} catch (error) {
		logger.error('Error in role validation:', { error });
		return { isValid: false, error: 'Internal validation error' };
	}
}

// Validates the basic structure of a role object
function validateRoleStructure(role: any): boolean {
	return (
		typeof role._id === 'string' &&
		typeof role.name === 'string' &&
		Array.isArray(role.permissions) &&
		role.permissions.every((perm: any) => typeof perm === 'string') &&
		(role.isAdmin === undefined || typeof role.isAdmin === 'boolean') &&
		(role.description === undefined || typeof role.description === 'string')
	);
}

// Validates role name format and length
function validateRoleName(name: string): boolean {
	return name.length > 0 && name.length <= MAX_ROLE_NAME_LENGTH && ROLE_NAME_PATTERN.test(name);
}
