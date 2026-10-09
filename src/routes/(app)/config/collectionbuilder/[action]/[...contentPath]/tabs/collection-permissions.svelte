<!--
@file src/routes/(app)/config/collectionbuilder/[action]/[...contentPath]/tabs/collection-permissions.svelte
@component Collection Permissions — Tab 3: Role-based edit/view/write matrix
 -->
<script lang="ts">
	import { collections, setCollection } from '@src/stores/collection-store.svelte';
	import Card from '@src/components/ui/card.svelte';
	import Button from '@src/components/ui/button.svelte';
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	import HelpIcon from '@components/ui/help-icon.svelte';
	import {
		builder_tip_grant_all,
		builder_tip_revoke_all,
		collection_permissions_actions,
		collection_permissions_actions_title,
		collection_permissions_edit,
		collection_permissions_edit_desc,
		collection_permissions_edit_title,
		collection_permissions_heading,
		collection_permissions_help_aria,
		collection_permissions_how,
		collection_permissions_inherited_link,
		collection_permissions_inherited_part1,
		collection_permissions_inherited_part2,
		collection_permissions_intro,
		collection_permissions_manage_in,
		collection_permissions_no_roles,
		collection_permissions_role,
		collection_permissions_role_title,
		collection_permissions_view,
		collection_permissions_view_desc,
		collection_permissions_view_title,
		collection_permissions_write,
		collection_permissions_write_desc,
		collection_permissions_write_title
	} from '@src/paraglide/messages';
	import type { Role } from '@src/databases/auth/types';
	import { toast } from '@src/stores/toast.svelte.ts';

	let { roles = [] } = $props<{ roles?: Role[] }>();

	// ── Collection-level permission state ──
	// Permissions are stored as: { [roleName]: { view: bool, edit: bool, write: bool } }
	let permissions = $state<Record<string, { view: boolean; edit: boolean; write: boolean }>>({});

	// Sync from existing collection on mount and when collection changes
	$effect(() => {
		const col = collections.active as Record<string, any> | null;
		if (!col) return;

		// Try to hydrate from collection.permissions if available
		const existing = col.permissions as
			| Record<string, { view?: boolean; edit?: boolean; write?: boolean }>
			| undefined;

		const next: Record<string, { view: boolean; edit: boolean; write: boolean }> = {};
		for (const role of roles) {
			const roleName = role.name || String(role._id || '');
			if (!roleName) continue;
			const existingPerm = existing?.[roleName];
			next[roleName] = {
				view: existingPerm?.view ?? true,
				edit: existingPerm?.edit ?? false,
				write: existingPerm?.write ?? false
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
				[key]: !permissions[roleName][key]
			}
		};
		flushToCollection();
	}

	// Enable/disable all for a role
	function setAllForRole(roleName: string, value: boolean) {
		permissions = {
			...permissions,
			[roleName]: { view: value, edit: value, write: value }
		};
		flushToCollection();
	}

	// Write to collection store
	function flushToCollection() {
		if (!collections.active) return;
		setCollection({ ...collections.active, permissions } as any);
		toast.info('Permissions updated', { duration: 1500 });
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

<div class="space-y-6">
	<!-- Section Header -->
	<div class="flex items-center gap-3">
		<div
			class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-tertiary-500/10 text-tertiary-500 dark:bg-primary-900/20 dark:text-primary-500"
		>
			<iconify-icon icon="mdi:shield-lock-outline" width="24"></iconify-icon>
		</div>
		<div>
			<div class="flex items-center gap-2">
				<h2 class="text-xl font-bold leading-none text-surface-900 dark:text-surface-100">
					{collection_permissions_heading()}
				</h2>
				<SystemTooltip positioning={{ placement: 'bottom' }} triggerClass="flex items-center">
					{#snippet content()}
						<div class="text-sm min-w-64 max-w-sm">
							<p class="font-semibold mb-2">{collection_permissions_how()}</p>
							<ul class="list-disc list-inside space-y-1 text-xs">
								<li>
									<strong>{collection_permissions_view()}</strong>: {collection_permissions_view_desc()}
								</li>
								<li>
									<strong>{collection_permissions_edit()}</strong>: {collection_permissions_edit_desc()}
								</li>
								<li>
									<strong>{collection_permissions_write()}</strong>: {collection_permissions_write_desc()}
								</li>
							</ul>
							<p class="mt-3 text-xs leading-relaxed">
								{collection_permissions_inherited_part1()}{' '}
								<a
									href="/config/access-management"
									class="text-tertiary-500 dark:text-primary-500 underline hover:text-tertiary-600 dark:hover:text-primary-400 transition-colors"
									>{collection_permissions_inherited_link()}</a
								>{collection_permissions_inherited_part2()}
							</p>
						</div>
					{/snippet}
					<HelpIcon ariaLabel={collection_permissions_help_aria()} />
				</SystemTooltip>
			</div>
			<p class="text-sm text-surface-500 dark:text-surface-400">
				{collection_permissions_intro()}
			</p>
		</div>
	</div>

	<!-- Permission Matrix -->
	<Card class="overflow-hidden">
		<div class="overflow-x-auto">
			<table class="w-full text-sm">
				<thead>
					<tr
						class="border-b border-surface-500/30 dark:border-surface-500/40 bg-surface-500/10 dark:bg-surface-900"
					>
						<th
							class="px-4 py-3 font-semibold text-surface-500 dark:text-surface-400 text-xs uppercase tracking-wider"
						>
							<div class="flex items-center justify-start gap-1">
								{collection_permissions_role()}
								<SystemTooltip
									title={collection_permissions_role_title()}
									positioning={{ placement: 'top-start' }}
									triggerClass="flex items-center"
								>
									<HelpIcon ariaLabel="Help: Role" />
								</SystemTooltip>
							</div>
						</th>
						<th
							class="px-3 py-3 font-semibold text-surface-500 dark:text-surface-400 text-xs uppercase tracking-wider w-24"
						>
							<div class="flex items-center justify-center gap-1">
								{collection_permissions_view()}
								<SystemTooltip
									title={collection_permissions_view_title()}
									positioning={{ placement: 'top' }}
									triggerClass="flex items-center"
								>
									<HelpIcon ariaLabel="Help: View" />
								</SystemTooltip>
							</div>
						</th>
						<th
							class="px-3 py-3 font-semibold text-surface-500 dark:text-surface-400 text-xs uppercase tracking-wider w-24"
						>
							<div class="flex items-center justify-center gap-1">
								{collection_permissions_edit()}
								<SystemTooltip
									title={collection_permissions_edit_title()}
									positioning={{ placement: 'top' }}
									triggerClass="flex items-center"
								>
									<HelpIcon ariaLabel="Help: Edit" />
								</SystemTooltip>
							</div>
						</th>
						<th
							class="px-3 py-3 font-semibold text-surface-500 dark:text-surface-400 text-xs uppercase tracking-wider w-24"
						>
							<div class="flex items-center justify-center gap-1">
								{collection_permissions_write()}
								<SystemTooltip
									title={collection_permissions_write_title()}
									positioning={{ placement: 'top' }}
									triggerClass="flex items-center"
								>
									<HelpIcon ariaLabel="Help: Write" />
								</SystemTooltip>
							</div>
						</th>
						<th
							class="px-4 py-3 font-semibold text-surface-500 dark:text-surface-400 text-xs uppercase tracking-wider w-32"
						>
							<div class="flex items-center justify-end gap-1">
								{collection_permissions_actions()}
								<SystemTooltip
									title={collection_permissions_actions_title()}
									positioning={{ placement: 'top-end' }}
									triggerClass="flex items-center"
								>
									<HelpIcon ariaLabel="Help: Actions" />
								</SystemTooltip>
							</div>
						</th>
					</tr>
				</thead>
				<tbody>
					{#each roles as role (role._id || role.name)}
						{@const roleName = getRoleName(role)}
						{@const perm = permissions[roleName]}
						<tr
							class="border-b border-surface-500/20 dark:border-surface-500/40 hover:bg-surface-500/10 dark:hover:bg-surface-900/50 transition-colors"
						>
							<!-- Role Name -->
							<td class="px-4 py-3">
								<div class="flex items-center gap-3">
									<div
										class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-tertiary-500/10 dark:bg-primary-900/20 text-tertiary-600 dark:text-primary-500"
									>
										<span class="text-xs font-bold">{getRoleLabel(role).charAt(0)}</span>
									</div>
									<div>
										<p class="font-semibold text-surface-900 dark:text-surface-100">
											{getRoleLabel(role)}
										</p>
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
										class="inline-flex h-7 w-7 items-center justify-center rounded transition-colors {perm.view
											? 'bg-tertiary-500/10 dark:bg-primary-900/20 text-tertiary-600 dark:text-primary-500'
											: 'bg-surface-500/10 dark:bg-surface-800 text-surface-300 dark:text-surface-600'}"
										aria-label={`Toggle view for ${getRoleLabel(role)}`}
										role="checkbox"
										aria-checked={perm.view}
									>
										<iconify-icon icon={perm.view ? 'mdi:check-bold' : 'mdi:close'} width="16"
										></iconify-icon>
									</button>
								{/if}
							</td>

							<!-- Edit -->
							<td class="text-center px-3 py-3">
								{#if perm}
									<button
										onclick={() => togglePermission(roleName, 'edit')}
										class="inline-flex h-7 w-7 items-center justify-center rounded transition-colors {perm.edit
											? 'bg-warning-500/10 dark:bg-warning-900/20 text-warning-600 dark:text-warning-400'
											: 'bg-surface-500/10 dark:bg-surface-800 text-surface-300 dark:text-surface-600'}"
										aria-label={`Toggle edit for ${getRoleLabel(role)}`}
										role="checkbox"
										aria-checked={perm.edit}
									>
										<iconify-icon icon={perm.edit ? 'mdi:check-bold' : 'mdi:close'} width="16"
										></iconify-icon>
									</button>
								{/if}
							</td>

							<!-- Write -->
							<td class="text-center px-3 py-3">
								{#if perm}
									<button
										onclick={() => togglePermission(roleName, 'write')}
										class="inline-flex h-7 w-7 items-center justify-center rounded transition-colors {perm.write
											? 'bg-success-500/10 dark:bg-success-900/20 text-success-600 dark:text-success-400'
											: 'bg-surface-500/10 dark:bg-surface-800 text-surface-300 dark:text-surface-600'}"
										aria-label={`Toggle write for ${getRoleLabel(role)}`}
										role="checkbox"
										aria-checked={perm.write}
									>
										<iconify-icon icon={perm.write ? 'mdi:check-bold' : 'mdi:close'} width="16"
										></iconify-icon>
									</button>
								{/if}
							</td>

							<!-- Quick Actions -->
							<td class="text-end px-4 py-3">
								{#if perm}
									<div class="flex items-center justify-end gap-1">
										<Button
											variant="ghost"
											size="sm"
											onclick={() => setAllForRole(roleName, true)}
											title={builder_tip_grant_all()}
											class="p-1!"
										>
											<iconify-icon icon="mdi:check-all" width="16" class="text-success-500"
											></iconify-icon>
										</Button>
										<Button
											variant="ghost"
											size="sm"
											onclick={() => setAllForRole(roleName, false)}
											title={builder_tip_revoke_all()}
											class="p-1!"
										>
											<iconify-icon
												icon="mdi:close-circle-outline"
												width="16"
												class="text-error-500"
											></iconify-icon>
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
				<iconify-icon icon="mdi:shield-off-outline" width="48" class="mb-3 opacity-20"
				></iconify-icon>
				<p class="text-sm font-medium">{collection_permissions_no_roles()}</p>
				<p class="mt-1 text-xs opacity-60">
					{collection_permissions_manage_in()}{' '}
					<a
						href="/config/access-management"
						class="text-tertiary-500 dark:text-primary-500 underline"
						>{collection_permissions_inherited_link()}</a
					>
				</p>
			</div>
		{/if}
	</Card>
</div>
