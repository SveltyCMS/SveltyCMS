/**
 * @file src/routes/api/scim/v2/Users/[id]/+server.ts
 * @description Individual SCIM v2 User resource endpoint (RFC 7644 §3.4.1, §3.5.1, §3.5.2)
 *
 * Features:
 * - GET single user by ID
 * - PUT full user replace
 * - PATCH partial update (activate/deactivate, field updates)
 * - DELETE user deactivation
 */

import { auth } from '@src/databases/db';
import { SCIM_SCHEMAS } from '@src/types/scim';
import type { ScimPatchRequest } from '@src/types/scim';
import { json } from '@sveltejs/kit';
import { apiHandler } from '@utils/api-handler';
import { AppError } from '@utils/error-handling';
import { logger } from '@utils/logger.server';
import { applyScimPatchOps, buildScimUser, scimError, validateScimAuth } from '@utils/scim-utils';

// GET /api/scim/v2/Users/{id} — Fetch a single user
export const GET = apiHandler(async ({ params, url, locals, request }) => {
	const authResult = await validateScimAuth(request, locals);
	if (!authResult.authenticated) {
		return scimError(401, authResult.error || 'Unauthorized');
	}

	const { id } = params;
	if (!id) {
		return scimError(400, 'User ID is required', 'invalidValue');
	}

	if (!auth) {
		throw new AppError('Authentication service not available', 500, 'AUTH_UNAVAILABLE');
	}

	try {
		const user = await auth.getUserById(id);
		if (!user) {
			return scimError(404, `User ${id} not found`, 'invalidValue');
		}

		return json(buildScimUser(user, url.origin));
	} catch (e) {
		logger.error('SCIM Users GET by ID error', { error: e, userId: id });
		return scimError(500, 'Internal server error');
	}
});

// PUT /api/scim/v2/Users/{id} — Full user replace
export const PUT = apiHandler(async ({ params, request, url, locals }) => {
	const authResult = await validateScimAuth(request, locals);
	if (!authResult.authenticated) {
		return scimError(401, authResult.error || 'Unauthorized');
	}

	const { id } = params;
	if (!id || !auth) {
		return scimError(400, 'User ID is required', 'invalidValue');
	}

	try {
		const body = await request.json();
		const existingUser = await auth.getUserById(id);
		if (!existingUser) {
			return scimError(404, `User ${id} not found`, 'invalidValue');
		}

		// Map SCIM fields to DB fields
		const updates: Record<string, any> = {};
		if (body.userName) updates.email = body.userName;
		if (body.name?.givenName) updates.username = body.name.givenName;
		if (body.name?.familyName) updates.lastName = body.name.familyName;
		if (typeof body.active === 'boolean') updates.isActive = body.active;
		if (body.emails?.length) {
			const primary = body.emails.find((e: any) => e.primary) || body.emails[0];
			if (primary?.value) updates.email = primary.value;
		}

		await auth.updateUser(id, updates as any);
		const updatedUser = await auth.getUserById(id);

		logger.info('SCIM User replaced', { userId: id });
		return json(buildScimUser(updatedUser || existingUser, url.origin));
	} catch (e) {
		logger.error('SCIM Users PUT error', { error: e, userId: id });
		return scimError(500, 'Internal server error');
	}
});

// PATCH /api/scim/v2/Users/{id} — Partial update (RFC 7644 §3.5.2)
export const PATCH = apiHandler(async ({ params, request, url, locals }) => {
	const authResult = await validateScimAuth(request, locals);
	if (!authResult.authenticated) {
		return scimError(401, authResult.error || 'Unauthorized');
	}

	const { id } = params;
	if (!id || !auth) {
		return scimError(400, 'User ID is required', 'invalidValue');
	}

	try {
		const body: ScimPatchRequest = await request.json();

		// Validate SCIM PATCH schema
		if (!body.schemas?.includes(SCIM_SCHEMAS.PATCH_OP)) {
			return scimError(400, 'Request must include PatchOp schema', 'invalidValue');
		}

		if (!Array.isArray(body.Operations) || body.Operations.length === 0) {
			return scimError(400, 'Operations array is required', 'invalidValue');
		}

		const existingUser = await auth.getUserById(id);
		if (!existingUser) {
			return scimError(404, `User ${id} not found`, 'invalidValue');
		}

		// Apply SCIM PATCH operations
		const updates = applyScimPatchOps(existingUser, body.Operations);

		if (Object.keys(updates).length > 0) {
			await auth.updateUserAttributes(id, updates);
		}

		const updatedUser = await auth.getUserById(id);
		logger.info('SCIM User patched', { userId: id, ops: body.Operations.length });
		return json(buildScimUser(updatedUser || existingUser, url.origin));
	} catch (e) {
		logger.error('SCIM Users PATCH error', { error: e, userId: id });
		return scimError(500, 'Internal server error');
	}
});

// DELETE /api/scim/v2/Users/{id} — Deactivate user (soft delete)
export const DELETE = apiHandler(async ({ params, request, locals }) => {
	const authResult = await validateScimAuth(request, locals);
	if (!authResult.authenticated) {
		return scimError(401, authResult.error || 'Unauthorized');
	}

	const { id } = params;
	if (!id || !auth) {
		return scimError(400, 'User ID is required', 'invalidValue');
	}

	try {
		const existingUser = await auth.getUserById(id);
		if (!existingUser) {
			return scimError(404, `User ${id} not found`, 'invalidValue');
		}

		// Soft delete: deactivate user instead of hard delete
		await auth.updateUser(id, { isActive: false } as any);

		logger.info('SCIM User deactivated', { userId: id });
		return new Response(null, { status: 204 });
	} catch (e) {
		logger.error('SCIM Users DELETE error', { error: e, userId: id });
		return scimError(500, 'Internal server error');
	}
});
