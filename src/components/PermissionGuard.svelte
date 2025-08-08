<!--
@file src/components/PermissionGuard.svelte
@component
**PermissionGuard component for permission-based access control that wraps content with conditional rendering and error handling**

@example
<PermissionGuard {config}>
	<ContentToProtect />
</PermissionGuard>

@example Silent mode (no error messages)
<PermissionGuard {config} silent={true}>
	<ContentToProtect />
</PermissionGuard>

#### Props:
- `config`: Permission configuration object
- `messages`: Custom messages for different scenarios
- `silent`: If true, don't show error messages when permission is denied (default: false)

Features:
- Checks user permissions based on provided configuration
- Handles admin roles, regular permissions, and rate limiting
- Provides fallback content for missing configurations or insufficient permissions
- Silent mode for security-sensitive components that shouldn't reveal their existence
- Improved type safety and error handling
-->

<script lang="ts">
	import { page } from '$app/state';

	// Auth types
	import type { PermissionConfig } from '@src/auth/permissions';
	import type { User } from '@src/auth/types';

	interface Props {
		// Prop to receive permission configuration
		config: PermissionConfig | undefined;
		messages?: {
			rateLimited?: string;
			missingConfig?: string;
			insufficientPermissions?: string;
		};
		silent?: boolean; // If true, don't show error messages when permission is denied
		children?: import('svelte').Snippet;
	}

	// Destructure props using $props()
	let {
		config,
		messages = {
			rateLimited: 'Rate limit reached. Please try again later.',
			missingConfig: 'Permission configuration is missing.',
			insufficientPermissions: 'You do not have permission to access this content.'
		},
		silent = false,
		children
	}: Props = $props();

	// Reactive states
	let loading = $state(false);
	let user = $derived(page.data.user as User | undefined);
	let permissions = $derived((page.data.permissions || {}) as Record<string, { hasPermission: boolean; isRateLimited: boolean }>);
	let isAdmin = $derived(page.data.isAdmin as boolean | undefined);
	let permissionData = $derived(
		config?.contextId
			? permissions[config.contextId] || { hasPermission: false, isRateLimited: false }
			: { hasPermission: false, isRateLimited: false }
	);
	let hasPermission = $derived(!!isAdmin || permissionData.hasPermission);
	let isRateLimited = $derived(permissionData.isRateLimited);

	// Final determination if content should be shown
	let shouldShowContent = $derived(!!config && hasPermission && !isRateLimited && !loading);
</script>

{#if shouldShowContent}
	{@render children?.()}
{:else if !silent && config}
	{#if isRateLimited}
		<p class="text-warning-500" role="alert">{messages.rateLimited}</p>
	{:else}
		<p class="text-error-500" role="alert">{messages.insufficientPermissions}</p>
	{/if}
{:else if !silent && !config}
	<p class="text-error-500" role="alert">{messages.missingConfig}</p>
{/if}
