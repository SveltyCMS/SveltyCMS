<script lang="ts">
	import { getContext } from 'svelte';
	import type { authDBInterface } from '@src/auth/authDBInterface';
	import type { User, Role, Permission, PermissionAction, ContextType, RateLimit, PermissionConfig } from '@src/auth/types';
	import { getLoadedPermissions, getLoadedRoles, getRoleByName } from '@src/auth/types';

	const authDB: authDBInterface = getContext('authDB');

	export let user: User;
	export let roles: Role[];
	export let rateLimits: RateLimit[];
	export let contextId: string;
	export let action: PermissionAction;
	export let requiredRole: string;
	export let contextType: ContextType;
	export let addDynamicPermission: boolean = false;

	let userHasPermission = false;

	$: {
		if (user && roles && rateLimits && contextId && action && requiredRole && contextType) {
			checkUserPermission();
		}
	}

	async function checkUserPermission() {
		if (addDynamicPermission) {
			const newPermission: Permission = {
				permission_id: `${action}_${contextType}_${contextId}`,
				name: `${action}_${contextType}_${contextId}`,
				description: `Permission to ${action} ${contextType} with ID ${contextId}`,
				contextType,
				action,
				contextId,
				requiredRole
			};
			await authDB.createPermission(newPermission);
			const role = getRoleByName(requiredRole);
			if (role) {
				await authDB.assignPermissionToRole(role.role_id, newPermission.permission_id);
			}
		}

		const userRole = getRoleByName(user.role);
		if (!userRole) {
			userHasPermission = false;
			return;
		}

		// Check rate limits
		const userRateLimit = rateLimits.find((rl) => rl.user_id === user._id && rl.action === action);
		if (userRateLimit) {
			// Implement rate limit check logic here
			// For now, we'll assume the user is not rate limited
		}

		const rolePermissions = await authDB.getPermissionsForRole(userRole.role_id);
		const userPermissions = user.permissions || [];

		const allPermissions = [...rolePermissions, ...userPermissions];

		userHasPermission = allPermissions.some(
			(perm) => perm.action === action && perm.contextType === contextType && (perm.contextId === contextId || perm.contextId === 'global')
		);
	}
</script>

{#if userHasPermission}
	<slot />
{/if}
