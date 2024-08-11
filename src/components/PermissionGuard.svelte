<!--
 @file src/components/PermissionGuard.svelte
 @description Guard component for permission-based access control

This component provides client-side permission checks and optional rate limiting visualization.
  It relies on server-side middleware in +page.server.ts for actual permission and rate limit enforcement.

  IMPORTANT: This component requires corresponding middleware in +page.server.ts to function correctly.
  The server-side middleware should:
  1. Perform permission checks using src/auth/permissionCheck.ts
  2. Apply rate limiting (optional, only for specified actions)
  3. Pass permission and rate limit data to the client via the `permissions` prop

  Usage:
  <PermissionGuard config={permissionConfig}>
    <ProtectedContent />
  </PermissionGuard>

  Props:
  - config: PermissionConfig (required) - Specifies the permission requirements

  The component expects the following data structure in $page.data:
  - user: User object
  - permissions: {
      [contextId: string]: {
        hasPermission: boolean,
        isRateLimited?: boolean  // Only present if rate limiting is applied
      }
    }
-->
<script lang="ts">
	import { page } from '$app/stores';
	import type { PermissionConfig } from '@src/auth/permissionCheck';

	export let config: PermissionConfig | undefined;

	$: user = $page.data.user;
	$: permissions = $page.data.permissions || {};
	$: permissionData = config?.contextId ? permissions[config.contextId] || {} : {};
	$: hasPermission = permissionData.hasPermission || false;
	$: isRateLimited = permissionData.isRateLimited || false;
	$: isAdmin = user && user.role === 'admin';
</script>

{#if config}
	{#if (hasPermission || isAdmin) && !isRateLimited}
		<slot />
	{:else if isRateLimited}
		<p>Rate limit reached. Please try again later.</p>
	{:else}
		<p>You don't have permission to view this content.</p>
	{/if}
{:else}
	<p>Permission configuration is missing.</p>
{/if}
