/**
 * @file src/routes/api/scim/v2/Groups/[id]/+server.ts
 * @description Individual SCIM v2 Group resource endpoint (RFC 7644)
 *
 * Features:
 * - GET single group/role by ID with members
 * - PATCH add/remove members
 * - DELETE group/role
 */

import { auth } from '@src/databases/db';
import { SCIM_SCHEMAS } from '@src/types/scim';
import type { ScimPatchRequest } from '@src/types/scim';
import { json } from '@sveltejs/kit';
import { apiHandler } from '@utils/api-handler';
import { logger } from '@utils/logger.server';
import { buildScimGroup, scimError, validateScimAuth } from '@utils/scim-utils';

// GET /api/scim/v2/Groups/{id} — Fetch a single group with members
export const GET = apiHandler(async ({ params, url, locals, request }) => {
	const authResult = await validateScimAuth(request, locals);
	if (!authResult.authenticated) {
		return scimError(401, authResult.error || 'Unauthorized');
	}

	const { id } = params;
	if (!id || !auth) {
		return scimError(400, 'Group ID is required', 'invalidValue');
	}

	try {
		const roleResult = await auth.authInterface.getRoleById(id);
		const role = roleResult?.success ? roleResult.data : null;
		if (!role) {
			return scimError(404, `Group ${id} not found`, 'invalidValue');
		}

		// Fetch members (users with this role)
		const allUsers = await auth.getAllUsers();
		const members = allUsers.filter((u: any) => u.role === role.name || u.role === role._id).map((u: any) => ({ _id: u._id, email: u.email }));

		return json(buildScimGroup(role, url.origin, members));
	} catch (e) {
		logger.error('SCIM Groups GET by ID error', { error: e, groupId: id });
		return scimError(500, 'Internal server error');
	}
});

// PATCH /api/scim/v2/Groups/{id} — Add/remove members
export const PATCH = apiHandler(async ({ params, request, url, locals }) => {
	const authResult = await validateScimAuth(request, locals);
	if (!authResult.authenticated) {
		return scimError(401, authResult.error || 'Unauthorized');
	}

	const { id } = params;
	if (!id || !auth) {
		return scimError(400, 'Group ID is required', 'invalidValue');
	}

	try {
		const body: ScimPatchRequest = await request.json();

		if (!body.schemas?.includes(SCIM_SCHEMAS.PATCH_OP)) {
			return scimError(400, 'Request must include PatchOp schema', 'invalidValue');
		}

		const roleResult = await auth.authInterface.getRoleById(id);
		const role = roleResult?.success ? roleResult.data : null;
		if (!role) {
			return scimError(404, `Group ${id} not found`, 'invalidValue');
		}

		// Process operations
		for (const op of body.Operations) {
			const path = op.path?.toLowerCase();

			if (path === 'members' || !path) {
				if (op.op === 'add' && Array.isArray(op.value)) {
					// Add members: assign this role to specified users
					for (const member of op.value as Array<{ value: string }>) {
						try {
							await auth.updateUser(member.value, { role: role.name } as any);
							logger.info('SCIM Group member added', { groupId: id, userId: member.value });
						} catch {
							logger.warn('SCIM Group member add failed', { groupId: id, userId: member.value });
						}
					}
				} else if (op.op === 'remove' && Array.isArray(op.value)) {
					// Remove members: revert to default role
					for (const member of op.value as Array<{ value: string }>) {
						try {
							await auth.updateUser(member.value, { role: 'user' } as any);
							logger.info('SCIM Group member removed', { groupId: id, userId: member.value });
						} catch {
							logger.warn('SCIM Group member remove failed', { groupId: id, userId: member.value });
						}
					}
				} else if (op.op === 'replace' && typeof op.value === 'object' && op.value !== null) {
					// Replace group displayName
					const val = op.value as Record<string, any>;
					if (val.displayName) {
						await auth.authInterface.updateRole(id, { name: val.displayName } as any);
						logger.info('SCIM Group renamed', { groupId: id, newName: val.displayName });
					}
				}
			}
		}

		// Return updated group
		const updatedRoleResult = await auth.authInterface.getRoleById(id);
		const updatedRole = updatedRoleResult?.success ? updatedRoleResult.data : null;
		const allUsers = await auth.getAllUsers();
		const members = allUsers
			.filter((u: any) => u.role === (updatedRole?.name || role.name) || u.role === id)
			.map((u: any) => ({ _id: u._id, email: u.email }));

		return json(buildScimGroup(updatedRole || role, url.origin, members));
	} catch (e) {
		logger.error('SCIM Groups PATCH error', { error: e, groupId: id });
		return scimError(500, 'Internal server error');
	}
});

// DELETE /api/scim/v2/Groups/{id} — Delete group/role
export const DELETE = apiHandler(async ({ params, request, locals }) => {
	const authResult = await validateScimAuth(request, locals);
	if (!authResult.authenticated) {
		return scimError(401, authResult.error || 'Unauthorized');
	}

	const { id } = params;
	if (!id || !auth) {
		return scimError(400, 'Group ID is required', 'invalidValue');
	}

	try {
		const roleResult = await auth.authInterface.getRoleById(id);
		const role = roleResult?.success ? roleResult.data : null;
		if (!role) {
			return scimError(404, `Group ${id} not found`, 'invalidValue');
		}

		// Prevent deletion of built-in admin role
		if (role.name === 'admin' || role.isAdmin) {
			return scimError(400, 'Cannot delete the admin role', 'mutability');
		}

		await auth.authInterface.deleteRole(id);
		logger.info('SCIM Group deleted', { groupId: id, roleName: role.name });
		return new Response(null, { status: 204 });
	} catch (e) {
		logger.error('SCIM Groups DELETE error', { error: e, groupId: id });
		return scimError(500, 'Internal server error');
	}
});
