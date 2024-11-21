<!--
@file src/components/PermissionGuard.svelte
@component
**PermissionGuard component for permission-based access control that wraps content with conditional rendering and error handling**

```tsx
<PermissionGuard {config}>
	<ContentToProtect />
</PermissionGuard>
```

#### Props:
- `config`: Permission configuration object
- `messages`: Custom messages for different scenarios

Features:
- Checks user permissions based on provided configuration
- Handles admin roles, regular permissions, and rate limiting
- Provides fallback content for missing configurations or insufficient permissions
- Improved type safety and error handling
-->

<script lang="ts">
	import { page } from '$app/stores';
	import type { PermissionConfig } from '@src/auth/permissionCheck';
	import type { User } from '@src/auth/types'; // Assuming these types exist
	import { store } from '@src/utils/reactivity.svelte';

	interface Permissions {
		[contextId: string]: {
			hasPermission: boolean;
			isRateLimited: boolean;
		};
	}

	interface Props {
		// Prop to receive permission configuration
		config: PermissionConfig | undefined;
		// Prop to customize messages (optional)
		messages?: any;
		children?: import('svelte').Snippet;
	}

	let {
		config,
		messages = {
			rateLimited: 'Rate limit reached. Please try again later.',
			missingConfig: 'Permission configuration is missing.',
			insufficientPermissions: 'You do not have permission to access this content.'
		},
		children
	}: Props = $props();

	// Create reactive stores
	const loading = store(false);
	// Reactive variables from page store with type assertions
	let user = $derived($page.data.user as User | undefined);
	let permissions = $derived(($page.data.permissions || {}) as Permissions);

	// Computed values with stores
	let permissionData = $derived(
		config?.contextId
			? permissions[config.contextId] || { hasPermission: false, isRateLimited: false }
			: { hasPermission: false, isRateLimited: false }
	);
	let isAdmin = $derived(user?.role?.toLowerCase() === 'admin');
	let hasPermission = $derived(isAdmin || permissionData.hasPermission || false);
	let isRateLimited = $derived(permissionData.isRateLimited || false);

	// Function to determine if content should be shown
	let shouldShowContent = $derived(config && hasPermission && !isRateLimited && !loading());

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
	{@render children?.()}
{:else if config}
	{#if isRateLimited}
		<p class="text-warning-500" role="alert">{messages.rateLimited}</p>
	{:else}
		<p class="text-error-500" role="alert">{messages.insufficientPermissions}</p>
	{/if}
{:else}
	<p class="text-error-500" role="alert">{messages.missingConfig}</p>
{/if}
