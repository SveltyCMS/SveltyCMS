<script lang="ts">
	import { hasPermission, addPermission } from '@src/auth/permissionManager';
	import type { User, Role, RateLimit, PermissionAction, ContextType } from '@src/auth/types';

	export let user: User;
	export let roles: Role[];
	export let rateLimits: RateLimit[];
	export let contextId: string;
	export let action: PermissionAction;
	export let requiredRole: string = 'admin'; // Default to 'admin' if not provided
	export let contextType: ContextType; // Allow flexible context types
	export let addDynamicPermission: boolean = true;

	let userHasPermission = false;

	if (addDynamicPermission) {
		console.log(requiredRole);
		addPermission(contextId, action, requiredRole, contextType);
	}

	$: userHasPermission = hasPermission(user, roles, action, contextId, rateLimits);
</script>

{#if userHasPermission}
	<slot />
{/if}
