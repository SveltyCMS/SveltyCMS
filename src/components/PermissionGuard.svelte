<!--
@file src/components/PermissionGuard.svelte
@description Guard component for permission-based access control.
-->

<script lang="ts">
	import { page } from '$app/stores';
	import type { PermissionConfig } from '@src/auth/permissionCheck';

	// Prop to receive permission configuration
	export let config: PermissionConfig | undefined;

	// Reactive variables from page store
	$: user = $page.data.user;
	$: permissions = $page.data.permissions || {};
	$: permissionData = config?.contextId ? permissions[config.contextId] || {} : {};
	$: isAdmin = user?.role?.toLowerCase() === 'admin'; // Ensure user object has role and check for admin
	$: hasPermission = isAdmin || permissionData.hasPermission || false; // Admins always have permission
	$: isRateLimited = permissionData.isRateLimited || false;

	// Debugging logs for development
	// $: {
	// 	console.debug('PermissionGuard Debug Info:', {
	// 		user,
	// 		config,
	// 		permissions,
	// 		permissionData,
	// 		hasPermission,
	// 		isRateLimited,
	// 		isAdmin
	// 	});
	// }
</script>

<!-- Permission Handling -->
{#if config}
	{#if hasPermission && !isRateLimited}
		<slot />
	{:else if isRateLimited}
		<p>Rate limit reached. Please try again later.</p>
	{/if}
{:else}
	<p>Permission configuration is missing.</p>
{/if}
