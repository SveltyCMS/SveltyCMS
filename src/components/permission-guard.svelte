<!--
@file src/components/permission-guard.svelte
@component
**Permission guard that hides children when RBAC or collection flags block access**

### Props
- `collection` (Schema | null): The collection schema to check (bulkDelete flag)
- `action` (string): Collection action being guarded (default bulkDelete)
- `config` (PermissionConfig): System/config contextId used with page.data.permissions
- `silent` (boolean): When true, render nothing when denied (no fallback text)
- `fallback` (string): Optional text when blocked and not silent
- `children` (Snippet): Content to render when allowed

### Features:
- checks page.data.permissions[contextId].hasPermission for system/config guards
- admin fast-path via page.data.isAdmin when permissions entry is missing
- checks disableBulkDelete flag on the collection schema
- fail-closed when a config.contextId is set but no grant is found
-->
<script lang="ts">
	import type { Schema } from '@src/content/types';
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';

	interface PermissionConfig {
		contextId?: string;
		action?: string;
		requiredRole?: string;
		name?: string;
		description?: string;
		contextType?: string;
	}

	let {
		collection = null,
		action = 'bulkDelete',
		config = undefined,
		silent = false,
		fallback = '',
		children
	}: {
		collection?: Schema | null;
		action?: 'bulkDelete' | 'delete' | 'create' | 'update' | string;
		config?: PermissionConfig;
		silent?: boolean;
		fallback?: string;
		children: Snippet;
	} = $props();

	const allowed = $derived.by(() => {
		// Collection-scoped: respect disableBulkDelete
		if (action === 'bulkDelete' && collection?.disableBulkDelete === true) {
			return false;
		}

		// System / config guards driven by load() permission maps
		if (config?.contextId) {
			const perms = page.data?.permissions as
				| Record<string, { hasPermission?: boolean } | boolean>
				| undefined;
			const entry = perms?.[config.contextId];
			if (typeof entry === 'boolean') {
				return entry;
			}
			if (entry && typeof entry.hasPermission === 'boolean') {
				return entry.hasPermission;
			}
			// Admin bypass when map has no entry for this key
			if (page.data?.isAdmin === true) {
				return true;
			}
			// Fail-closed: explicit config means deny unless granted
			return false;
		}

		// No config → allow (legacy collection-only usage)
		return true;
	});
</script>

{#if allowed}
	{@render children()}
{:else if fallback && !silent}
	<span class="text-muted-foreground text-sm">{fallback}</span>
{/if}
