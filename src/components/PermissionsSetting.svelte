<!--
@file src/components/PermissionsSetting.svelte
@component
**Enhanced Permissions Management - Svelte 5 Optimized**

Advanced permission management interface with bulk actions and presets.

@example
```svelte
<PermissionsSetting {permissions} {roles} {onUpdate} />
```

### Props
- `permissions` (object): Current permissions configuration
- `roles` (Role[]): Available roles
- `onUpdate` (function): Callback when permissions change

### Features
- Visual permission matrix
- Bulk permission actions (enable/disable all)
- Permission presets (read-only, editor, admin)
- Role search and filtering
- Admin role protection
- Undo/redo support
- Export/import permissions
- Full ARIA accessibility
- Reduced motion support
-->

<script lang="ts">
	import type { Role } from '@src/databases/auth/types';
	import { PermissionAction } from '@src/databases/auth/types';
	import { showToast } from '@utils/toast';
	import { onMount } from 'svelte';
	import { fade, slide } from 'svelte/transition';

	type PermissionsMap = Record<string, Record<string, boolean>>;

	interface Props {
		onUpdate?: (permissions: PermissionsMap) => void;
		permissions?: PermissionsMap;
		roles?: Role[];
	}

	const { permissions = {}, roles = [], onUpdate = () => {} }: Props = $props();

	// State
	let error = $state<string | null>(null);
	let searchQuery = $state('');
	let showBulkActions = $state(false);
	let prefersReducedMotion = $state(false);
	let historyIndex = $state(-1);
	let permissionsHistory = $state<PermissionsMap[]>([]);

	// Icons for permissions
	const actionIcons: Record<PermissionAction, string> = {
		[PermissionAction.CREATE]: 'bi:plus-circle-fill',
		[PermissionAction.READ]: 'bi:eye-fill',
		[PermissionAction.WRITE]: 'bi:pencil-square',
		[PermissionAction.UPDATE]: 'bi:pencil-fill',
		[PermissionAction.DELETE]: 'bi:trash-fill',
		[PermissionAction.MANAGE]: 'bi:gear-fill',
		[PermissionAction.ACCESS]: 'bi:key-fill',
		[PermissionAction.EXECUTE]: 'bi:play-fill',
		[PermissionAction.SHARE]: 'bi:share-fill'
	};

	// Permission presets
	const presets = {
		'read-only': {
			name: 'Read Only',
			description: 'Can only view content',
			permissions: {
				read: true,
				access: true,
				create: false,
				write: false,
				update: false,
				delete: false,
				manage: false,
				execute: false,
				share: false
			}
		},
		editor: {
			name: 'Editor',
			description: 'Can create and edit content',
			permissions: {
				read: true,
				access: true,
				create: true,
				write: true,
				update: true,
				share: true,
				delete: false,
				manage: false,
				execute: false
			}
		},
		admin: {
			name: 'Administrator',
			description: 'Full access to everything',
			permissions: Object.fromEntries(Object.values(PermissionAction).map((action) => [action, true]))
		}
	};

	// Initialize permissions with all roles
	function initializePermissions(currentPermissions: PermissionsMap, availableRoles: Role[]): PermissionsMap {
		const initialized: PermissionsMap = { ...currentPermissions };

		availableRoles.forEach((role) => {
			if (!initialized[role._id]) {
				initialized[role._id] = Object.fromEntries(Object.values(PermissionAction).map((action) => [action, true]));
			}
		});

		return initialized;
	}

	// Initialize state from props - use $derived to react to prop changes
	let permissionsState = $derived(initializePermissions(permissions, roles));

	// Save to history
	function saveToHistory() {
		const newHistory = permissionsHistory.slice(0, historyIndex + 1);
		newHistory.push(JSON.parse(JSON.stringify(permissionsState)));
		permissionsHistory = newHistory;
		historyIndex = newHistory.length - 1;
	}

	// Undo/Redo
	function undo() {
		if (historyIndex > 0) {
			historyIndex--;
			permissionsState = JSON.parse(JSON.stringify(permissionsHistory[historyIndex]));
			updateParent();
		}
	}

	function redo() {
		if (historyIndex < permissionsHistory.length - 1) {
			historyIndex++;
			permissionsState = JSON.parse(JSON.stringify(permissionsHistory[historyIndex]));
			updateParent();
		}
	}

	const canUndo = $derived(historyIndex > 0);
	const canRedo = $derived(historyIndex < permissionsHistory.length - 1);

	// Toggle permission
	function togglePermission(roleId: string, action: PermissionAction) {
		const role = roles.find((r: Role) => r._id === roleId);

		if (role?.isAdmin) {
			showToast('Cannot modify permissions for admin role', 'warning');
			return;
		}

		if (!permissionsState[roleId]) {
			permissionsState[roleId] = {} as Record<string, boolean>;
		}

		permissionsState[roleId][action] = !permissionsState[roleId][action];
		saveToHistory();
		updateParent();
	}

	// Bulk actions
	function setAllPermissionsForRole(roleId: string, value: boolean) {
		const role = roles.find((r: Role) => r._id === roleId);

		if (role?.isAdmin) {
			showToast('Cannot modify permissions for admin role', 'warning');
			return;
		}

		permissionsState[roleId] = Object.fromEntries(Object.values(PermissionAction).map((action) => [action, value]));

		saveToHistory();
		updateParent();
		showToast(`All permissions ${value ? 'enabled' : 'disabled'} for ${role?.name}`, 'success');
	}

	function setPermissionForAllRoles(action: PermissionAction, value: boolean) {
		roles.forEach((role) => {
			if (!role.isAdmin) {
				permissionsState[role._id][action] = value;
			}
		});

		saveToHistory();
		updateParent();
		showToast(`${action} ${value ? 'enabled' : 'disabled'} for all roles`, 'success');
	}

	// Apply preset
	function applyPreset(roleId: string, presetKey: string) {
		const role = roles.find((r: Role) => r._id === roleId);

		if (role?.isAdmin) {
			showToast('Cannot modify permissions for admin role', 'warning');
			return;
		}

		const preset = presets[presetKey as keyof typeof presets];
		if (preset) {
			permissionsState[roleId] = { ...preset.permissions };
			saveToHistory();
			updateParent();
			showToast(`Applied "${preset.name}" preset to ${role?.name}`, 'success');
		}
	}

	// Update parent
	function updateParent() {
		const cleanedPermissions = Object.entries(permissionsState).reduce((acc, [roleId, perms]) => {
			const hasRestrictions = Object.values(perms).some((value) => value === false);
			if (hasRestrictions) {
				acc[roleId] = perms;
			}
			return acc;
		}, {} as PermissionsMap);

		onUpdate(cleanedPermissions);
	}

	// Export permissions
	function exportPermissions() {
		const data = JSON.stringify(permissionsState, null, 2);
		const blob = new Blob([data], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `permissions-${new Date().toISOString().split('T')[0]}.json`;
		a.click();
		URL.revokeObjectURL(url);
		showToast('Permissions exported', 'success');
	}

	// Import permissions
	async function importPermissions(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];

		if (!file) return;

		try {
			const text = await file.text();
			const imported = JSON.parse(text);
			permissionsState = { ...permissionsState, ...imported };
			saveToHistory();
			updateParent();
			showToast('Permissions imported successfully', 'success');
		} catch {
			showToast('Failed to import permissions', 'error');
			error = 'Invalid permissions file';
		}
	}

	// Filter roles
	const filteredRoles = $derived(
		roles.filter(
			(role) => role.name.toLowerCase().includes(searchQuery.toLowerCase()) || role.description?.toLowerCase().includes(searchQuery.toLowerCase())
		)
	);

	// Count enabled permissions per role
	function countEnabledPermissions(roleId: string): number {
		return Object.values(permissionsState[roleId] || {}).filter(Boolean).length;
	}

	const totalActions = $derived(Object.values(PermissionAction).length);

	// Lifecycle
	onMount(() => {
		const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		prefersReducedMotion = mediaQuery.matches;

		const handleChange = (e: MediaQueryListEvent) => {
			prefersReducedMotion = e.matches;
		};

		mediaQuery.addEventListener('change', handleChange);

		// Initialize history
		saveToHistory();

		return () => mediaQuery.removeEventListener('change', handleChange);
	});
</script>

{#if error}
	<div
		class="rounded-lg border-l-4 border-error-500 bg-error-50 p-4 text-error-700 dark:bg-error-900/20 dark:text-error-300"
		role="alert"
		transition:fade={{ duration: prefersReducedMotion ? 0 : 200 }}
	>
		<div class="flex items-start gap-3">
			<span class="text-2xl" role="img" aria-label="Error">⚠️</span>
			<div class="flex-1">
				<p class="font-semibold">Error</p>
				<p class="mt-1 text-sm">{error}</p>
			</div>
			<button onclick={() => (error = null)} class="preset-outlined-error-500 btn-sm" aria-label="Dismiss error">Dismiss</button>
		</div>
	</div>
{:else}
	<div class="flex flex-col gap-4" role="region" aria-label="Permission settings">
		<!-- Toolbar -->
		<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<!-- Search -->
			<div class="flex-1">
				<input bind:value={searchQuery} placeholder="Search roles..." class="input w-full" type="search" aria-label="Search roles">
			</div>

			<!-- Actions -->
			<div class="flex flex-wrap gap-2">
				<!-- Undo/Redo -->
				<button onclick={undo} disabled={!canUndo} class="preset-outlined-surface-500btn btn-sm" title="Undo" aria-label="Undo last change">
					<iconify-icon icon="mdi:undo" width="18"></iconify-icon>
				</button>
				<button onclick={redo} disabled={!canRedo} class="preset-outlined-surface-500btn btn-sm" title="Redo" aria-label="Redo last change">
					<iconify-icon icon="mdi:redo" width="18"></iconify-icon>
				</button>

				<!-- Bulk Actions Toggle -->
				<button onclick={() => (showBulkActions = !showBulkActions)} class="preset-outlined-primary-500 btn-sm" aria-expanded={showBulkActions}>
					<iconify-icon icon="mdi:cog-box" width="18"></iconify-icon>
					Bulk Actions
				</button>

				<!-- Export -->
				<button
					onclick={exportPermissions}
					class="preset-outlined-primary-500 btn-sm"
					title="Export permissions"
					aria-label="Export permissions as JSON"
				>
					<iconify-icon icon="mdi:download" width="18"></iconify-icon>
				</button>

				<!-- Import -->
				<label class="preset-outlined-warning-500 btn-sm cursor-pointer">
					<iconify-icon icon="mdi:upload" width="18"></iconify-icon>
					<input type="file" accept=".json" onchange={importPermissions} class="hidden" aria-label="Import permissions from JSON">
				</label>
			</div>
		</div>

		<!-- Bulk Actions Panel -->
		{#if showBulkActions}
			<div
				class="rounded-lg border border-primary-200 bg-primary-50 p-4 dark:border-primary-800 dark:bg-primary-900/20"
				transition:slide={{ duration: prefersReducedMotion ? 0 : 200 }}
			>
				<h3 class="mb-3 text-sm font-semibold">Bulk Actions</h3>
				<div class="flex flex-wrap gap-2">
					{#each Object.values(PermissionAction) as action (action)}
						<div class="flex gap-1">
							<button
								onclick={() => setPermissionForAllRoles(action, true)}
								class="preset-filled-success-500 btn-sm"
								title={`Enable ${action} for all roles`}
								aria-label={`Enable ${action} for all roles`}
							>
								<iconify-icon icon={actionIcons[action]} width="16"></iconify-icon>
								✓
							</button>
							<button
								onclick={() => setPermissionForAllRoles(action, false)}
								class="preset-filled-error-500 btn-sm"
								title={`Disable ${action} for all roles`}
								aria-label={`Disable ${action} for all roles`}
							>
								<iconify-icon icon={actionIcons[action]} width="16"></iconify-icon>
								✗
							</button>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Permissions Table -->
		<div class="overflow-x-auto rounded-lg border border-surface-200 dark:text-surface-50">
			<table class="table w-full" role="grid">
				<thead>
					<tr>
						<th scope="col" class="px-4 py-3 text-left">
							<div class="flex items-center gap-2">
								Role
								<span class="text-xs font-normal opacity-70"> ({filteredRoles.length}) </span>
							</div>
						</th>
						{#each Object.values(PermissionAction) as action (action)}
							<th scope="col" class="px-4 py-3 text-center">
								<div class="flex flex-col items-center gap-1">
									<iconify-icon icon={actionIcons[action]} width="20" aria-hidden="true"></iconify-icon>
									<span class="text-xs">{action}</span>
								</div>
							</th>
						{/each}
						<th scope="col" class="px-4 py-3 text-center">Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each filteredRoles as role (role._id)}
						<tr class="border-t border-surface-200 dark:text-surface-50">
							<!-- Role Info -->
							<th scope="row" class="px-4 py-3">
								<div class="flex flex-col gap-1">
									<div class="flex items-center gap-2">
										<span class="font-semibold">{role.name}</span>
										{#if role.isAdmin}
											<span class="badge preset-filled-primary-500 text-xs"> Admin </span>
										{/if}
									</div>
									{#if role.description}
										<span class="text-xs text-surface-600 dark:text-surface-50"> {role.description} </span>
									{/if}
									<span class="text-xs font-medium text-primary-500"> {countEnabledPermissions(role._id)}/{totalActions} enabled </span>
								</div>
							</th>

							<!-- Permission Toggles -->
							{#each Object.values(PermissionAction) as action (action)}
								<td class="px-4 py-3 text-center">
									<button
										onclick={() => togglePermission(role._id, action)}
										disabled={role.isAdmin}
										aria-label={`${permissionsState[role._id]?.[action] ? 'Disable' : 'Enable'} ${action} for ${role.name}`}
										class="btn-icon transition-all duration-200 {permissionsState[role._id]?.[action]
											? 'preset-filled-success-500 hover:scale-110'
											: 'preset-filled-error-500 opacity-50 hover:opacity-100 hover:scale-110'} {role.isAdmin ? 'cursor-not-allowed opacity-30' : ''}"
									>
										<iconify-icon
											icon={permissionsState[role._id]?.[action] ? 'mdi:check' : 'mdi:check'}
											width="18"
											class={permissionsState[role._id]?.[action] ? 'text-white' : 'text-white'}
										></iconify-icon>
									</button>
								</td>
							{/each}

							<!-- Row Actions -->
							<td class="px-4 py-3 text-center">
								<div class="flex justify-center gap-1">
									<button
										onclick={() => setAllPermissionsForRole(role._id, true)}
										disabled={role.isAdmin}
										class="preset-outlined-primary-500 btn-sm"
										title="Enable all"
										aria-label={`Enable all permissions for ${role.name}`}
									>
										✓ All
									</button>
									<button
										onclick={() => setAllPermissionsForRole(role._id, false)}
										disabled={role.isAdmin}
										class="preset-outlined-error-500 btn-sm"
										title="Disable all"
										aria-label={`Disable all permissions for ${role.name}`}
									>
										✗ All
									</button>

									<!-- Preset Dropdown -->
									<select
										onchange={(e) => {
											const target = e.target as HTMLSelectElement;
											if (target.value) {
												applyPreset(role._id, target.value);
												target.value = '';
											}
										}}
										disabled={role.isAdmin}
										class="input w-auto px-2 py-1 text-xs"
										aria-label={`Apply preset to ${role.name}`}
									>
										<option value="">Preset...</option>
										{#each Object.entries(presets) as [ key, preset ] (key)}
											<option value={key}>{preset.name}</option>
										{/each}
									</select>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<!-- No Results -->
		{#if filteredRoles.length === 0}
			<div
				class="flex flex-col items-center gap-3 rounded-lg bg-surface-50 py-12 text-center dark:bg-surface-800"
				transition:fade={{ duration: prefersReducedMotion ? 0 : 200 }}
			>
				<iconify-icon icon="mdi:magnify-close" width="48" class="text-surface-400"></iconify-icon>
				<p class="text-surface-600 dark:text-surface-50">No roles match your search for "<span class="font-medium">{searchQuery}</span>"</p>
			</div>
		{/if}
	</div>
{/if}
