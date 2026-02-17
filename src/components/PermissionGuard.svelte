<!--
@file src/components/PermissionGuard.svelte
@component
**Enhanced PermissionGuard - Svelte 5 Optimized**

Permission-based access control component with advanced features and security.

@example Basic usage
```svelte
<PermissionGuard {config}>
	<ProtectedContent />
</PermissionGuard>
```

@example Silent mode (no error messages)
```svelte
<PermissionGuard {config} silent>
	<ProtectedContent />
</PermissionGuard>
```

@example Custom error messages
```svelte
<PermissionGuard 
	{config}
	messages={{
		insufficientPermissions: 'Access denied',
		rateLimited: 'Too many requests'
	}}
>
	<ProtectedContent />
</PermissionGuard>
```

@example With fallback content
```svelte
<PermissionGuard {config}>
	{#snippet children()}
		<ProtectedContent />
	{/snippet}
	{#snippet fallback()}
		<LoginPrompt />
	{/snippet}
</PermissionGuard>
```

### Props
- `config` (PermissionConfig): Permission configuration object
- `messages` (object): Custom error messages
- `silent` (boolean): Hide error messages (default: false)
- `showLoadingState` (boolean): Show loading indicator (default: true)
- `logDenials` (boolean): Log permission denials for security auditing (default: true)

### Features
- Comprehensive permission checking with admin override
- Rate limiting support
- Silent mode for security-sensitive components
- Custom error messages
- Optional fallback content via snippet
- Loading state support
- Security audit logging
- Full ARIA accessibility
- Type-safe with proper TypeScript
-->

<script lang="ts">
	import type { PermissionConfig } from '@src/databases/auth/permissions';
	import type { Snippet } from 'svelte';
	import { fade } from 'svelte/transition';
	import { page } from '$app/state';

	interface ErrorMessages {
		insufficientPermissions?: string;
		loadingPermissions?: string;
		missingConfig?: string;
		rateLimited?: string;
	}

	interface Props {
		children?: Snippet;
		config: PermissionConfig | undefined;
		fallback?: Snippet;
		logDenials?: boolean;
		messages?: ErrorMessages;
		showLoadingState?: boolean;
		silent?: boolean;
	}

	const { config, messages = {}, silent = false, showLoadingState = true, logDenials = true, children, fallback }: Props = $props();

	// Default messages
	const defaultMessages: Required<ErrorMessages> = {
		rateLimited: 'Rate limit reached. Please try again later.',
		missingConfig: 'Permission configuration is missing.',
		insufficientPermissions: 'You do not have permission to access this content.',
		loadingPermissions: 'Loading permissions...'
	};

	// Merge with user-provided messages
	const finalMessages = $derived({ ...defaultMessages, ...messages });

	// Derive permissions and admin status from page data
	const permissions = $derived((page.data?.permissions || {}) as Record<string, { hasPermission: boolean; isRateLimited: boolean }>);
	const isAdmin = $derived(page.data?.isAdmin as boolean);
	const isLoading = $derived(page.data?.isLoadingPermissions as boolean);

	// Get permission data for specific context
	const permissionData = $derived.by(() => {
		if (!config?.contextId) {
			return { hasPermission: false, isRateLimited: false };
		}
		return permissions[config.contextId] ?? { hasPermission: false, isRateLimited: false };
	});

	// Determine access status
	const hasPermission = $derived(isAdmin || permissionData.hasPermission);
	const isRateLimited = $derived(permissionData.isRateLimited);
	const shouldShowContent = $derived(!!config && hasPermission && !isRateLimited && !isLoading);

	// Denial reason (for logging)
	const denialReason = $derived.by(() => {
		if (!config) return 'missing_config';
		if (isRateLimited) return 'rate_limited';
		if (!hasPermission) return 'insufficient_permissions';
		return null;
	});

	// Log permission denials for security audit
	$effect(() => {
		if (logDenials && denialReason && config) {
			console.warn('[PermissionGuard] Access denied:', {
				contextId: config.contextId,
				reason: denialReason,
				timestamp: new Date().toISOString(),
				userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
			});
		}
	});

	// Get appropriate error message
	const errorMessage = $derived.by(() => {
		if (!config) return finalMessages.missingConfig;
		if (isRateLimited) return finalMessages.rateLimited;
		if (!hasPermission) return finalMessages.insufficientPermissions;
		return null;
	});

	// Determine icon for error state
	const errorIcon = $derived.by(() => {
		if (!config) return '⚙️';
		if (isRateLimited) return '⏱️';
		if (!hasPermission) return '🔒';
		return '❌';
	});

	// ARIA role for error messages
	const errorRole = $derived(isRateLimited ? 'status' : 'alert');
</script>

{#if isLoading && showLoadingState}
	<!-- Loading state -->
	<div
		class="flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800"
		role="status"
		aria-live="polite"
		transition:fade={{ duration: 200 }}
	>
		<div class="h-4 w-4 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" aria-hidden="true"></div>
		<span class="text-sm text-gray-600 dark:text-gray-400"> {finalMessages.loadingPermissions} </span>
	</div>
{:else if shouldShowContent}
	<!-- Authorized content -->
	{@render children?.()}
{:else if fallback}
	<!-- Custom fallback content -->
	{@render fallback()}
{:else if !silent && errorMessage}
	<!-- Error message (only if not silent) -->
	<div
		class="flex items-start gap-3 rounded-lg border p-4 {isRateLimited
			? 'border-warning-200 bg-warning-50 dark:border-warning-800 dark:bg-warning-900/20'
			: 'border-error-200 bg-error-50 dark:border-error-800 dark:bg-error-900/20'}"
		role={errorRole}
		aria-live="polite"
		transition:fade={{ duration: 200 }}
	>
		<!-- Error icon -->
		<span class="text-2xl" role="img" aria-label={isRateLimited ? 'Rate limited' : 'Access denied'}> {errorIcon} </span>

		<!-- Error content -->
		<div class="flex-1">
			<h3 class="font-semibold {isRateLimited ? 'text-warning-800 dark:text-warning-200' : ''}">
				{isRateLimited ? 'Rate Limit Exceeded' : 'Access Denied'}
			</h3>
			<p class="mt-1 text-sm {isRateLimited ? 'text-warning-700 dark:text-warning-300' : 'text-error-700 dark:text-error-300'}">{errorMessage}</p>

			<!-- Additional context for missing config (dev mode only) -->
			{#if !config && import.meta.env.DEV}
				<p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
					<strong>Dev Note:</strong>
					No permission config provided. Pass a valid PermissionConfig object to this component.
				</p>
			{/if}
		</div>
	</div>
{/if}
