<script lang="ts">
	import { type User, type Role, type PermissionAction, type ContextType, type RateLimit } from '@src/auth/types';

	export let user: User;
	export let roles: Role[];
	export let rateLimits: RateLimit[] | undefined;
	export let contextId: string;
	export let action: PermissionAction;
	export let requiredRole: string;
	export let contextType: ContextType | string;

	let userHasPermission = false;
	$: {
		if (user && roles && contextId && action && requiredRole && contextType) {
			checkUserPermission();
		}
	}

	function checkUserPermission() {
		console.log('PermissionGuard: Checking permission for:', {
			user,
			roles,
			rateLimits,
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
		if (user.role.toLowerCase() === 'admin') {
			console.log('PermissionGuard: User is admin, granting permission');
			userHasPermission = true;
			return;
		}

		// Check rate limits if they exist
		if (rateLimits) {
			const userRateLimit = rateLimits.find((rl) => rl.user_id === user._id && rl.action === action);
			if (userRateLimit) {
				const now = new Date();
				if (userRateLimit.current >= userRateLimit.limit && now.getTime() - userRateLimit.lastActionAt.getTime() < userRateLimit.windowMs) {
					console.log('PermissionGuard: Rate limit exceeded');
					userHasPermission = false;
					return;
				}
			}
		}

		// Check if user's role matches the required role
		userHasPermission = user.role.toLowerCase() === requiredRole.toLowerCase();
		console.log(`PermissionGuard: Permission ${userHasPermission ? 'granted' : 'denied'}`);
	}
</script>

{#if userHasPermission}
	<slot />
{:else}
	<p>You don't have permission to view this content.</p>
{/if}
