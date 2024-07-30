<script lang="ts">
	import type { User, Role, PermissionAction, ContextType, RateLimit } from '@src/auth/types';

	export let user: User;
	export let roles: Role[];
	export let rateLimits: RateLimit[];
	export let contextId: string;
	export let action: PermissionAction;
	export let requiredRole: string;
	export let contextType: ContextType | string;

	let userHasPermission = false;

	$: {
		if (user && roles && rateLimits && contextId && action && requiredRole && contextType) {
			checkUserPermission();
		}
	}

	function checkUserPermission() {
		console.log('PermissionGuard: Checking permission for:', {
			user,
			roles,
			contextId,
			action,
			requiredRole,
			contextType
		});

		if (!user) {
			console.error('PermissionGuard: User object is undefined or null');
			userHasPermission = false;
			return;
		}

		console.log('PermissionGuard: User role:', user.role);

		// Always allow admin access
		if (user.role === 'admin') {
			console.log('PermissionGuard: User is admin, granting permission');
			userHasPermission = true;
			return;
		}

		// ... rest of the function ...
	}
</script>

{#if userHasPermission}
	<slot />
{:else}
	<p>You don't have permission to view this content.</p>
{/if}
