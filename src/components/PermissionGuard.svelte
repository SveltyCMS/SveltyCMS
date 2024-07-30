<script lang="ts">
	import { getContext } from 'svelte';
	import type { authDBInterface } from '@src/auth/authDBInterface';
	import type { User, Permission, PermissionAction, ContextType } from '@src/auth/types';
	import { getLoadedRoles } from '@src/auth/types';

	const authDB: authDBInterface = getContext('authDB');

	export let user: User;
	export let contextId: string;
	export let action: PermissionAction;
	export let requiredRole: string = 'admin'; // Default to 'admin' if not provided
	export let contextType: ContextType; // Allow flexible context types
	export let addDynamicPermission: boolean = false;

	let userHasPermission = false;

	async function checkUserPermission() {
		if (addDynamicPermission) {
			const newPermission: Permission = {
				permission_id: `${action}_${contextType}_${contextId}`, // Generate a unique ID
				name: `${action}_${contextType}_${contextId}`,
				description: `Permission to ${action} ${contextType} with ID ${contextId}`,
				contextType,
				action,
				contextId,
				requiredRole
			};
			await authDB.createPermission(newPermission);
			const role = getLoadedRoles().find((r) => r.name === requiredRole);
			if (role) {
				await authDB.assignPermissionToRole(role.role_id, newPermission.permission_id);
			}
		}

		userHasPermission = await authDB.checkUserPermission(user._id, `${action}_${contextType}_${contextId}`);
	}

	$: if (user && contextId && action) {
		checkUserPermission();
	}
</script>

{#if userHasPermission}
	<slot />
{/if}
