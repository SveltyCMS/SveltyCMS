<!--
@file src/routes/(app)/config/collectionbuilder/[action]/[...contentPath]/tabs/collection-permissions.svelte
@component Collection Permissions — Tab 3: Role-based edit/view/write matrix
 -->
<script lang="ts">
import { collection, setCollection } from "@src/stores/collection-store.svelte";
import Card from "@src/components/ui/card.svelte";
import Button from "@src/components/ui/button.svelte";
import type { Role } from "@src/databases/auth/types";
import { toast } from "@src/stores/toast.svelte.ts";

let { roles = [] } = $props<{ roles?: Role[] }>();

// ── Collection-level permission state ──
// Permissions are stored as: { [roleName]: { view: bool, edit: bool, write: bool } }
let permissions = $state<Record<string, { view: boolean; edit: boolean; write: boolean }>>({});

// Sync from existing collection on mount and when collection changes
$effect(() => {
	const col = collection.value as Record<string, any> | null;
	if (!col) return;

	// Try to hydrate from collection.permissions if available
	const existing = col.permissions as Record<string, { view?: boolean; edit?: boolean; write?: boolean }> | undefined;

	const next: Record<string, { view: boolean; edit: boolean; write: boolean }> = {};
	for (const role of roles) {
		const roleName = role.name || String(role._id || '');
		if (!roleName) continue;
		const existingPerm = existing?.[roleName];
		next[roleName] = {
			view: existingPerm?.view ?? true,
			edit: existingPerm?.edit ?? false,
			write: existingPerm?.write ?? false,
		};
	}
	permissions = next;
});

// ── Helper: derive permission summary ──
function getPermissionSummary(perms: { view: boolean; edit: boolean; write: boolean }): string {
	const granted: string[] = [];
	if (perms.view) granted.push('View');
	if (perms.edit) granted.push('Edit');
	if (perms.write) granted.push('Write');
	if (granted.length === 0) return 'No access';
	if (granted.length === 3) return 'Full access';
	return granted.join(', ');
}


// ── Toggle handlers ──
function togglePermission(roleName: string, key: 'view' | 'edit' | 'write') {
	permissions = {
		...permissions,
		[roleName]: {
			...permissions[roleName],
			[key]: !permissions[roleName][key],
		},
	};
	flushToCollection();
}

// Enable/disable all for a role
function setAllForRole(roleName: string, value: boolean) {
	permissions = {
		...permissions,
		[roleName]: { view: value, edit: value, write: value },
	};
	flushToCollection();
}

// Write to collection store
function flushToCollection() {
	if (!collection.value) return;
	setCollection({ ...collection.value, permissions } as any);
	toast.info("Permissions updated", { duration: 1500 });
}

// ── Role name display ──
function getRoleName(role: Role): string {
	return role.name || String(role._id || 'Unknown Role');
}

function getRoleLabel(role: Role): string {
	const roleName = getRoleName(role).toLowerCase();
	if (roleName === 'admin') return 'Administrator';
	if (roleName === 'editor') return 'Editor';
	if (roleName === 'author') return 'Author';
	if (roleName === 'viewer' || roleName === 'public') return 'Viewer';
	return getRoleName(role);
}
</script>

<div class="space-y-6 p-4 sm:p-6 lg:p-8">
	<!-- Section Header -->
	<div class="flex items-center gap-3">
		<iconify-icon icon="mdi:shield-lock-outline" width="24" class="text-primary-500"></iconify-icon>
		<div>
			<h2 class="text-xl font-bold text-surface-900 dark:text-surface-100">Permissions</h2>
			<p class="text-sm text-surface-500 dark:text-surface-400">Configure which roles can access and modify this collection</p>
		</div>
	</div>

	<!-- Permission Matrix -->
	<Card class="overflow-hidden">
		<div class="overflow-x-auto">
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900">
						<th class="text-start px-4 py-3 font-semibold text-surface-500 dark:text-surface-400 text-xs uppercase tracking-wider">Role</th>
						<th class="text-center px-3 py-3 font-semibold text-surface-500 dark:text-surface-400 text-xs uppercase tracking-wider w-20">View</th>
						<th class="text-center px-3 py-3 font-semibold text-surface-500 dark:text-surface-400 text-xs uppercase tracking-wider w-20">Edit</th>
						<th class="text-center px-3 py-3 font-semibold text-surface-500 dark:text-surface-400 text-xs uppercase tracking-wider w-20">Write</th>
						<th class="text-end px-4 py-3 font-semibold text-surface-500 dark:text-surface-400 text-xs uppercase tracking-wider w-28">Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each roles as role (role._id || role.name)}
						{@const roleName = getRoleName(role)}
						{@const perm = permissions[roleName]}
						<tr class="border-b border-surface-100 dark:border-surface-800 hover:bg-surface-50 dark:hover:bg-surface-900/50 transition-colors">
							<!-- Role Name -->
							<td class="px-4 py-3">
								<div class="flex items-center gap-3">
									<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400">
										<span class="text-xs font-bold">{getRoleLabel(role).charAt(0)}</span>
									</div>
									<div>
										<p class="font-semibold text-surface-900 dark:text-surface-100">{getRoleLabel(role)}</p>
										<p class="text-xs text-surface-400">
											{perm ? getPermissionSummary(perm) : '—'}
										</p>
									</div>
								</div>
							</td>

							<!-- View -->
							<td class="text-center px-3 py-3">
								{#if perm}
									<button
										onclick={() => togglePermission(roleName, 'view')}
										class="inline-flex h-7 w-7 items-center justify-center rounded transition-colors {perm.view ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400' : 'bg-surface-100 dark:bg-surface-800 text-surface-300 dark:text-surface-600'}"
										aria-label={`Toggle view for ${getRoleLabel(role)}`}
										role="checkbox"
										aria-checked={perm.view}
									>
										<iconify-icon icon={perm.view ? 'mdi:check-bold' : 'mdi:close'} width="16"></iconify-icon>
									</button>
								{/if}
							</td>

							<!-- Edit -->
							<td class="text-center px-3 py-3">
								{#if perm}
									<button
										onclick={() => togglePermission(roleName, 'edit')}
										class="inline-flex h-7 w-7 items-center justify-center rounded transition-colors {perm.edit ? 'bg-warning-100 dark:bg-warning-900/30 text-warning-600 dark:text-warning-400' : 'bg-surface-100 dark:bg-surface-800 text-surface-300 dark:text-surface-600'}"
										aria-label={`Toggle edit for ${getRoleLabel(role)}`}
										role="checkbox"
										aria-checked={perm.edit}
									>
										<iconify-icon icon={perm.edit ? 'mdi:check-bold' : 'mdi:close'} width="16"></iconify-icon>
									</button>
								{/if}
							</td>

							<!-- Write -->
							<td class="text-center px-3 py-3">
								{#if perm}
									<button
										onclick={() => togglePermission(roleName, 'write')}
										class="inline-flex h-7 w-7 items-center justify-center rounded transition-colors {perm.write ? 'bg-success-100 dark:bg-success-900/30 text-success-600 dark:text-success-400' : 'bg-surface-100 dark:bg-surface-800 text-surface-300 dark:text-surface-600'}"
										aria-label={`Toggle write for ${getRoleLabel(role)}`}
										role="checkbox"
										aria-checked={perm.write}
									>
										<iconify-icon icon={perm.write ? 'mdi:check-bold' : 'mdi:close'} width="16"></iconify-icon>
									</button>
								{/if}
							</td>

							<!-- Quick Actions -->
							<td class="text-end px-4 py-3">
								{#if perm}
									<div class="flex items-center justify-end gap-1">
										<Button variant="ghost" size="sm" onclick={() => setAllForRole(roleName, true)} title="Grant all" class="p-1!">
											<iconify-icon icon="mdi:check-all" width="16" class="text-success-500"></iconify-icon>
										</Button>
										<Button variant="ghost" size="sm" onclick={() => setAllForRole(roleName, false)} title="Revoke all" class="p-1!">
											<iconify-icon icon="mdi:close-circle-outline" width="16" class="text-error-500"></iconify-icon>
										</Button>
									</div>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		{#if roles.length === 0}
			<div class="flex flex-col items-center justify-center py-12 text-surface-400">
				<iconify-icon icon="mdi:shield-off-outline" width="48" class="mb-3 opacity-20"></iconify-icon>
				<p class="text-sm font-medium">No roles configured</p>
				<p class="mt-1 text-xs opacity-60">
					Manage roles in
					<a href="/config/access-management" class="text-primary-500 underline">Access Management</a>
				</p>
			</div>
		{/if}
	</Card>

	<!-- Info Footer -->
	<div class="flex items-start gap-3 rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 p-4">
		<iconify-icon icon="mdi:information-outline" width="20" class="text-primary-500 shrink-0 mt-0.5"></iconify-icon>
		<div class="text-sm text-surface-500 dark:text-surface-400">
			<p class="font-semibold text-surface-700 dark:text-surface-300 mb-1">How permissions work</p>
			<ul class="list-disc list-inside space-y-0.5 text-xs">
				<li><strong>View</strong>: Can see the collection and its entries</li>
				<li><strong>Edit</strong>: Can create and update entries</li>
				<li><strong>Write</strong>: Can delete entries and manage collection settings</li>
			</ul>
			<p class="mt-2 text-xs">
				Collection-level permissions are inherited by all entries. For granular per-field permissions, use the widget inspector.
				Full RBAC management is available in
				<a href="/config/access-management" class="text-primary-500 underline">Access Management</a>.
			</p>
		</div>
	</div>
</div>
