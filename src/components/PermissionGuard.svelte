<!--
@file src/components/PermissionGuard.svelte
@description Guard component for permission-based access control
Features:
- Checks user permissions based on provided configuration
- Handles admin roles, regular permissions, and rate limiting
- Provides fallback content for missing configurations or insufficient permissions
- Improved type safety and error handling
Usage:
Import and use <PermissionGuard {config}> in your Svelte application.
Wrap content that requires permission checks within the PermissionGuard component.
-->

<script lang="ts">
	import { page } from '$app/stores';
	import type { PermissionConfig } from '@src/auth/permissionCheck';
	import type { User, Permissions } from '@src/auth/types'; // Assuming these types exist

	// Prop to receive permission configuration
	export let config: PermissionConfig | undefined;

	// Prop to customize messages (optional)
	export let messages = {
		rateLimited: 'Rate limit reached. Please try again later.',
		missingConfig: 'Permission configuration is missing.',
		insufficientPermissions: 'You do not have permission to access this content.'
	};

	// Reactive variables from page store with type assertions
	$: user = $page.data.user as User | undefined;
	$: permissions = ($page.data.permissions || {}) as Permissions;

	// Computed values
	$: permissionData = config?.contextId ? permissions[config.contextId] || {} : {};
	$: isAdmin = user?.role?.toLowerCase() === 'admin';
	$: hasPermission = isAdmin || permissionData.hasPermission || false;
	$: isRateLimited = permissionData.isRateLimited || false;

	// Function to determine if content should be shown
	$: shouldShowContent = config && hasPermission && !isRateLimited;

	// Debugging function (can be enabled in development)
	// function logDebugInfo() {
	// 	if (import.meta.env.DEV) {
	// 		console.debug('PermissionGuard Debug Info:', {
	// 			user,
	// 			config,
	// 			permissions,
	// 			permissionData,
	// 			hasPermission,
	// 			isRateLimited,
	// 			isAdmin
	// 		});
	// 	}
	// }

	// Call debug function (comment out in production)
	// $: logDebugInfo();
</script>

{#if shouldShowContent}
	<slot />
{:else if config}
	{#if isRateLimited}
		<p class="text-warning-500" role="alert">{messages.rateLimited}</p>
	{:else}
		<p class="text-error-500" role="alert">{messages.insufficientPermissions}</p>
	{/if}
{:else}
	<p class="text-error-500" role="alert">{messages.missingConfig}</p>
{/if}
