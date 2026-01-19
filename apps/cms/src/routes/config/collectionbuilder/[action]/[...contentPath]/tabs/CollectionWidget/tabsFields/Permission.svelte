<!-- 
@files src/routes/(app)/config/collectionbuilder/[...contentTypes]/tabs/CollectionWidget/tabsFields/Permission.svelte
@component
**This component handles permission settings for widget fields**

Features:
- Permissions settings

-->

<script lang="ts">
	import { onMount } from 'svelte';
	// Components
	import PermissionsSetting from '@cms/components/PermissionsSetting.svelte';
	import type { Role } from '@shared/database/auth/types';
	import { collections } from '@cms/stores/collectionStore.svelte';

	// State for roles
	let roles = $state<Role[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	// Function to handle permission updates
	function handlePermissionUpdate(updatedPermissions: Record<string, Record<string, boolean>>) {
		const w = collections.targetWidget;
		if (!w) return;
		w.permissions = updatedPermissions;
		collections.setTargetWidget(w);
	}

	// Default fallback roles
	const defaultRoles = [
		{ _id: 'admin', name: 'Admin' },
		{ _id: 'developer', name: 'Developer' },
		{ _id: 'editor', name: 'Editor' }
	] as unknown as Role[];

	// Fetch roles on mount or use defaults
	onMount(async () => {
		try {
			const response = await fetch('/api/roles');
			if (response.ok) {
				const data = await response.json();
				roles = (data.roles || data || []) as Role[];
				// If no roles returned, use defaults
				if (roles.length === 0) {
					roles = defaultRoles;
				}
			} else {
				// API failed (403/404), use default roles
				console.warn('Roles API returned', response.status, '- using default roles');
				roles = defaultRoles;
			}
		} catch (e) {
			console.warn('Error loading roles, using defaults:', e);
			roles = defaultRoles;
		} finally {
			loading = false;
			error = null;
		}
	});
</script>

<div class="mb-4">
	{#if loading}
		<div class="flex items-center justify-center py-8">
			<iconify-icon icon="mdi:loading" width="32" class="animate-spin text-tertiary-500 dark:text-primary-500"></iconify-icon>
			<span class="ml-2 text-surface-500">Loading roles...</span>
		</div>
	{:else if error}
		<div class="rounded-lg bg-error-100 p-4 text-error-700 dark:bg-error-900/30 dark:text-error-300">
			{error}
		</div>
	{:else if roles.length > 0}
		<PermissionsSetting {roles} permissions={collections.targetWidget?.permissions || {}} onUpdate={handlePermissionUpdate} />
	{:else}
		<div class="rounded-lg bg-warning-100 p-4 text-warning-700 dark:bg-warning-900/30 dark:text-warning-300">
			<iconify-icon icon="mdi:alert" width="20" class="inline-block mr-2"></iconify-icon>
			No roles found. Please create roles in System Settings first.
		</div>
	{/if}
</div>
