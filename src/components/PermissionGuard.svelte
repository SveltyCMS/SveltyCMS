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

### Props:
- `config`: Permission configuration object
- `messages`: Custom messages for different scenarios
- `silent`: If true, don't show error messages when permission is denied (default: false)

### Features:
- Checks user permissions based on provided configuration
- Handles admin roles, regular permissions, and rate limiting
- Provides fallback content for missing configurations or insufficient permissions
- Silent mode for security-sensitive components that shouldn't reveal their existence
- Improved type safety and error handling
-->

<script lang="ts">
	// FIX: Use $app/stores for page store
	import { page } from '$app/stores';

	// Auth types
	import type { PermissionConfig } from '@src/databases/auth/permissions';
	import type { Snippet } from 'svelte'; // Import Snippet type directly

	interface Props {
		config: PermissionConfig | undefined;
		messages?: {
			rateLimited?: string;
			missingConfig?: string;
			insufficientPermissions?: string;
		};
		silent?: boolean;
		children?: Snippet; // Use imported Snippet type
	}

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

	// --- REMOVED unused `loading` state ---

	// Reactive states derived from page data and config
	let permissions = $derived(($page.data.permissions || {}) as Record<string, { hasPermission: boolean; isRateLimited: boolean }>);
	let isAdmin = $derived(($page.data.isAdmin || false) as boolean); // Default to false if undefined

	// Derive specific permission data based on config contextId
	let permissionData = $derived(
		config?.contextId
			? (permissions[config.contextId] ?? { hasPermission: false, isRateLimited: false }) // Use nullish coalescing
			: { hasPermission: false, isRateLimited: false }
	);

	// Derive permission status, considering admin override
	let hasPermission = $derived(isAdmin || permissionData.hasPermission);
	let isRateLimited = $derived(permissionData.isRateLimited);

	// Final determination if content should be shown (simplified)
	let shouldShowContent = $derived(!!config && hasPermission && !isRateLimited);
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
