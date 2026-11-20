<!--
@file src/routes/(app)/config/collectionbuilder/[action]/[...contentPath]/tabs/collection-permissions.svelte
@component Collection Permissions — Tab 3: Role-based edit/view/write matrix
 -->
<script lang="ts">
	import { collections, setCollection } from '@src/stores/collection-store.svelte';
	import Card from '@src/components/ui/card.svelte';
	import Button from '@src/components/ui/button.svelte';
	import Checkbox from '@src/components/ui/checkbox.svelte';
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
		collection_permissions_form_intro_part1,
		collection_permissions_form_intro_part2,
		collection_permissions_form_intro_part3,
		collection_permissions_form_title,
		collection_permissions_form_toggle,
		collection_permissions_form_toggle_desc,
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

	let { roles = [] }: { roles?: Role[] } = $props();

	// ── Collection-level permission state ──
	// Permissions are stored as: { [roleName]: { view: bool, edit: bool, write: bool } }
	let permissions = $state<Record<string, { view: boolean; edit: boolean; write: boolean }>>({});

	// Public form ingestion is an explicit per-collection opt-in. The schema
	// flag is persisted by the builder's AST writer (`formEnabled: true`).
	const formEnabled = $derived(
		(collections.active as { formEnabled?: boolean } | null)?.formEnabled === true
	);

	function setFormEnabled(value: boolean) {
		if (!collections.active) return;
		setCollection({ ...collections.active, formEnabled: value } as any);
		toast.info(value ? 'Public form endpoint enabled' : 'Public form endpoint disabled', {
			duration: 1500
		});
	}

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
	let publicFormOpen = $state(false);
</script>

<div class="space-y-2.5 sm:space-y-6">
	<!-- Section Header -->
	<div class="flex items-center gap-2.5 sm:gap-3">
		<div
			class="flex size-8 sm:size-10 shrink-0 items-center justify-center rounded-xl bg-tertiary-500/10 text-tertiary-500 dark:bg-primary-900/20 dark:text-primary-500"
		>
			<iconify-icon icon="mdi:shield-lock-outline" width="20" class="sm:text-[24px]"></iconify-icon>
		</div>
		<div>
			<div class="flex items-center gap-2">
				<h2 class="text-base sm:text-xl font-bold leading-none text-(--admin-text-body)">
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
			<p class="hidden sm:block text-sm text-(--admin-text-muted)">
				{collection_permissions_intro()}
			</p>
		</div>
	</div>

	<!-- Public Form Endpoint (collapsible on mobile, always expanded on sm+) -->
	<Card class="p-2.5 sm:p-5">
		<button
			type="button"
			onclick={() => (publicFormOpen = !publicFormOpen)}
			aria-expanded={publicFormOpen}
			class="flex w-full items-center justify-between gap-2 text-start sm:hidden"
		>
			<div class="flex min-w-0 items-center gap-2">
				<span class="truncate text-sm font-semibold text-(--admin-text-body)">
					{collection_permissions_form_title()}
				</span>
				<span
					class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold {formEnabled
						? 'bg-success-500/10 text-success-500'
						: 'bg-surface-500/10 text-(--admin-text-muted)'}"
				>
					{formEnabled ? 'On' : 'Off'}
				</span>
			</div>
			<iconify-icon
				icon={publicFormOpen ? 'mdi:chevron-up' : 'mdi:chevron-down'}
				width="20"
				class="shrink-0 text-(--admin-text-muted)"
				aria-hidden="true"
			></iconify-icon>
		</button>

		<div
			class="{publicFormOpen
				? 'mt-2.5 pt-2.5 border-t border-(--admin-border-default) flex'
				: 'hidden'} sm:flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
		>
			<div class="max-w-prose">
				<h3 class="hidden sm:block text-base font-semibold text-(--admin-text-body)">
					{collection_permissions_form_title()}
				</h3>
				<p class="mt-0 sm:mt-1 text-xs sm:text-sm text-(--admin-text-muted)">
					{collection_permissions_form_intro_part1()}{' '}
					<code class="rounded bg-surface-500/10 px-1 py-0.5" dir="ltr"
						>POST /api/forms/&lt;collection&gt;</code
					>{collection_permissions_form_intro_part2()}{' '}
					<code class="rounded bg-surface-500/10 px-1 py-0.5" dir="ltr">_formStatus: "pending"</code
					>{collection_permissions_form_intro_part3()}
				</p>
			</div>
			<div class="sm:hidden flex items-center justify-between gap-3 pt-1">
				<div class="min-w-0">
					<p class="text-xs font-medium text-(--admin-text-body)">
						{collection_permissions_form_toggle()}
					</p>
					<p class="text-[11px] text-(--admin-text-muted)">
						{collection_permissions_form_toggle_desc()}
					</p>
				</div>
				<Checkbox checked={formEnabled} onchange={setFormEnabled} />
			</div>
			<Checkbox
				checked={formEnabled}
				label={collection_permissions_form_toggle()}
				description={collection_permissions_form_toggle_desc()}
				variant="toggle-card"
				onchange={setFormEnabled}
				class="hidden sm:flex sm:max-w-xs"
			/>
		</div>
	</Card>

	<!-- Permission Matrix -->
	<Card class="overflow-hidden">
		<!-- Mobile: stacked role cards (no horizontal scroll) -->
		<div class="divide-y divide-(--admin-border-default) sm:hidden">
			{#each roles as role (role._id || role.name)}
				{@const roleName = getRoleName(role)}
				{@const perm = permissions[roleName]}
				<div class="space-y-2.5 p-3">
					<div class="flex items-center justify-between gap-2">
						<div class="flex min-w-0 items-center gap-2.5">
							<div
								class="flex size-8 shrink-0 items-center justify-center rounded-full bg-tertiary-500/10 dark:bg-primary-900/20 text-tertiary-600 dark:text-primary-500"
							>
								<span class="text-xs font-bold">{getRoleLabel(role).charAt(0)}</span>
							</div>
							<div class="min-w-0">
								<p class="truncate text-sm font-semibold text-(--admin-text-body)">
									{getRoleLabel(role)}
								</p>
								<p class="text-[11px] text-(--admin-text-muted)">
									{perm ? getPermissionSummary(perm) : '—'}
								</p>
							</div>
						</div>
						{#if perm}
							<div class="flex shrink-0 items-center gap-1">
								<Button
									variant="ghost"
									size="sm"
									onclick={() => setAllForRole(roleName, true)}
									title={builder_tip_grant_all()}
									aria-label={`${builder_tip_grant_all()} ${getRoleLabel(role)}`}
									class="size-8 min-w-0! p-0!"
								>
									<iconify-icon icon="mdi:check-all" width="16" class="text-success-500"
									></iconify-icon>
								</Button>
								<Button
									variant="ghost"
									size="sm"
									onclick={() => setAllForRole(roleName, false)}
									title={builder_tip_revoke_all()}
									aria-label={`${builder_tip_revoke_all()} ${getRoleLabel(role)}`}
									class="size-8 min-w-0! p-0!"
								>
									<iconify-icon icon="mdi:close-circle-outline" width="16" class="text-error-500"
									></iconify-icon>
								</Button>
							</div>
						{/if}
					</div>

					{#if perm}
						<div class="grid grid-cols-3 gap-2">
							<button
								type="button"
								onclick={() => togglePermission(roleName, 'view')}
								role="checkbox"
								aria-checked={perm.view}
								class="flex h-9 items-center justify-center gap-1.5 rounded-lg border text-xs font-medium transition-colors {perm.view
									? 'border-tertiary-500/40 bg-tertiary-500/10 text-tertiary-600 dark:border-primary-500/40 dark:bg-primary-900/20 dark:text-primary-400'
									: 'border-(--admin-border-default) bg-surface-500/10 text-(--admin-text-muted)'}"
							>
								<iconify-icon icon={perm.view ? 'mdi:check-bold' : 'mdi:close'} width="14"
								></iconify-icon>
								<span>{collection_permissions_view()}</span>
							</button>
							<button
								type="button"
								onclick={() => togglePermission(roleName, 'edit')}
								role="checkbox"
								aria-checked={perm.edit}
								class="flex h-9 items-center justify-center gap-1.5 rounded-lg border text-xs font-medium transition-colors {perm.edit
									? 'border-warning-500/40 bg-warning-500/10 text-warning-600 dark:bg-warning-900/20 dark:text-warning-400'
									: 'border-(--admin-border-default) bg-surface-500/10 text-(--admin-text-muted)'}"
							>
								<iconify-icon icon={perm.edit ? 'mdi:check-bold' : 'mdi:close'} width="14"
								></iconify-icon>
								<span>{collection_permissions_edit()}</span>
							</button>
							<button
								type="button"
								onclick={() => togglePermission(roleName, 'write')}
								role="checkbox"
								aria-checked={perm.write}
								class="flex h-9 items-center justify-center gap-1.5 rounded-lg border text-xs font-medium transition-colors {perm.write
									? 'border-success-500/40 bg-success-500/10 text-success-600 dark:bg-success-900/20 dark:text-success-400'
									: 'border-(--admin-border-default) bg-surface-500/10 text-(--admin-text-muted)'}"
							>
								<iconify-icon icon={perm.write ? 'mdi:check-bold' : 'mdi:close'} width="14"
								></iconify-icon>
								<span>{collection_permissions_write()}</span>
							</button>
						</div>
					{/if}
				</div>
			{/each}
		</div>

		<!-- Desktop/Tablet: table -->
		<div class="hidden overflow-x-auto sm:block">
			<table class="w-full text-sm">
				<thead>
					<tr
						class="border-b border-(--admin-border-default) bg-surface-500/10 dark:bg-surface-900"
					>
						<th
							class="px-4 py-3 font-semibold text-(--admin-text-muted) text-xs uppercase tracking-wider"
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
							class="px-3 py-3 font-semibold text-(--admin-text-muted) text-xs uppercase tracking-wider w-24"
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
							class="px-3 py-3 font-semibold text-(--admin-text-muted) text-xs uppercase tracking-wider w-24"
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
							class="px-3 py-3 font-semibold text-(--admin-text-muted) text-xs uppercase tracking-wider w-24"
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
							class="px-4 py-3 font-semibold text-(--admin-text-muted) text-xs uppercase tracking-wider w-32"
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
										<p class="font-semibold text-(--admin-text-body)">
											{getRoleLabel(role)}
										</p>
										<p class="text-xs text-(--admin-text-muted)">
											{perm ? getPermissionSummary(perm) : '—'}
										</p>
									</div>
								</div>
							</td>

							<!-- View -->
							<td class="text-center px-3 py-3">
								{#if perm}
									<Button
										type="button"
										variant="transparent"
										size="sm"
										onclick={() => togglePermission(roleName, 'view')}
										class="h-7! w-7! min-w-0! p-0! {perm.view
											? 'bg-tertiary-500/10 text-tertiary-600 dark:bg-primary-900/20 dark:text-primary-400'
											: 'bg-surface-500/10 text-(--admin-text-muted)'}"
										aria-label={`Toggle view for ${getRoleLabel(role)}`}
										role="checkbox"
										aria-checked={perm.view}
									>
										<iconify-icon icon={perm.view ? 'mdi:check-bold' : 'mdi:close'} width="16"
										></iconify-icon>
									</Button>
								{/if}
							</td>

							<!-- Edit -->
							<td class="text-center px-3 py-3">
								{#if perm}
									<Button
										type="button"
										variant="transparent"
										size="sm"
										onclick={() => togglePermission(roleName, 'edit')}
										class="h-7! w-7! min-w-0! p-0! {perm.edit
											? 'bg-warning-500/10 text-warning-600 dark:bg-warning-900/20 dark:text-warning-400'
											: 'bg-surface-500/10 text-(--admin-text-muted)'}"
										aria-label={`Toggle edit for ${getRoleLabel(role)}`}
										role="checkbox"
										aria-checked={perm.edit}
									>
										<iconify-icon icon={perm.edit ? 'mdi:check-bold' : 'mdi:close'} width="16"
										></iconify-icon>
									</Button>
								{/if}
							</td>

							<!-- Write -->
							<td class="text-center px-3 py-3">
								{#if perm}
									<Button
										type="button"
										variant="transparent"
										size="sm"
										onclick={() => togglePermission(roleName, 'write')}
										class="h-7! w-7! min-w-0! p-0! {perm.write
											? 'bg-success-500/10 text-success-600 dark:bg-success-900/20 dark:text-success-400'
											: 'bg-surface-500/10 text-(--admin-text-muted)'}"
										aria-label={`Toggle write for ${getRoleLabel(role)}`}
										role="checkbox"
										aria-checked={perm.write}
									>
										<iconify-icon icon={perm.write ? 'mdi:check-bold' : 'mdi:close'} width="16"
										></iconify-icon>
									</Button>
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
			<div class="flex flex-col items-center justify-center py-12 text-(--admin-text-muted)">
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
