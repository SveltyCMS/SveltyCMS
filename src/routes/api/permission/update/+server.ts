/**
 * @file src/routes/api/permission/update/+server.ts
 * @description API endpoint for updating permissions and roles via database
 *
 * Supports multi-tenant mode with tenant-specific role isolation.
 */
import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { dbAdapter, dbInitPromise } from '@src/databases/db';
import { getAllPermissions } from '@src/databases/auth/permissions';
import { invalidateRolesCache } from '@src/hooks/handleAuthorization';
import { logger } from '@utils/logger.server';
import type { Role } from '@src/databases/auth/types';

const MAX_ROLE_NAME_LENGTH = 50;
const ROLE_NAME_PATTERN = /^[a-zA-Z0-9-_\s]+$/;

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user;
	const tenantId = locals.tenantId;

	if (!user) {
		logger.warn('Unauthenticated attempt to update permissions', { tenantId });
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	if (!locals.isAdmin) {
		logger.warn('Unauthorized attempt to update permissions', { userId: user._id, tenantId });
		return json({ success: false, error: 'Unauthorized' }, { status: 403 });
	}

	try {
		await dbInitPromise;

		if (!dbAdapter) {
			logger.error('Database adapter not initialized');
			return json({ success: false, error: 'Database not initialized' }, { status: 500 });
		}

		const { roles } = await request.json();

		if (!Array.isArray(roles)) {
			return json({ success: false, error: 'Roles must be provided as an array' }, { status: 400 });
		}

		const validationResult = await validateRoles(roles);
		if (!validationResult.isValid) {
			return json({ success: false, error: validationResult.error }, { status: 400 });
		}

		logger.info('Updating roles', { userId: user._id, roleCount: roles.length, tenantId });

		const existingRoles = await dbAdapter.auth.getAllRoles(tenantId);
		const existingRoleIds = new Set(existingRoles.map((r) => r._id));
		const incomingRoleIds = new Set(roles.map((r: Role) => r._id));

		for (const existingRole of existingRoles) {
			if (!incomingRoleIds.has(existingRole._id)) {
				await dbAdapter.auth.deleteRole(existingRole._id, tenantId);
			}
		}

		for (const role of roles) {
			const roleData: Role = { ...role, tenantId: tenantId || undefined };
			if (existingRoleIds.has(role._id)) {
				await dbAdapter.auth.updateRole(role._id, roleData, tenantId);
			} else {
				await dbAdapter.auth.createRole(roleData);
			}
		}

		invalidateRolesCache(tenantId);
		logger.info('Roles updated successfully', { userId: user._id, tenantId });

		return json({ success: true }, { status: 200 });
	} catch (error) {
		logger.error('Error updating permissions:', { error, userId: user._id, tenantId });
		return json({ success: false, error: `Error: ${error}` }, { status: 500 });
	}
};

async function validateRoles(roles: Role[]): Promise<{ isValid: boolean; error?: string }> {
	if (roles.length === 0) return { isValid: false, error: 'At least one role required' };

	const permissions = await getAllPermissions();
	const permissionIds = new Set(permissions.map((p) => p._id));
	const roleNames = new Set<string>();
	const roleIds = new Set<string>();
	let hasAdmin = false;

	for (const role of roles) {
		if (!validateRoleStructure(role)) {
			return { isValid: false, error: `Invalid structure: ${role.name}` };
		}
		if (!validateRoleName(role.name)) {
			return { isValid: false, error: `Invalid name: ${role.name}` };
		}
		if (roleIds.has(role._id)) return { isValid: false, error: `Duplicate ID: ${role._id}` };
		if (roleNames.has(role.name.toLowerCase())) return { isValid: false, error: `Duplicate name: ${role.name}` };

		roleIds.add(role._id);
		roleNames.add(role.name.toLowerCase());

		if (!role.isAdmin) {
			for (const perm of role.permissions) {
				if (!permissionIds.has(perm)) {
					return { isValid: false, error: `Invalid permission: ${perm}` };
				}
			}
		}
		if (role.isAdmin) hasAdmin = true;
	}

	if (!hasAdmin) return { isValid: false, error: 'At least one admin role required' };
	return { isValid: true };
}

function validateRoleStructure(role: Role): boolean {
	return (
		typeof role._id === 'string' &&
		typeof role.name === 'string' &&
		Array.isArray(role.permissions) &&
		role.permissions.every((p) => typeof p === 'string') &&
		(role.isAdmin === undefined || typeof role.isAdmin === 'boolean') &&
		(role.tenantId === undefined || typeof role.tenantId === 'string')
	);
}

function validateRoleName(name: string): boolean {
	return name.length > 0 && name.length <= MAX_ROLE_NAME_LENGTH && ROLE_NAME_PATTERN.test(name);
}
