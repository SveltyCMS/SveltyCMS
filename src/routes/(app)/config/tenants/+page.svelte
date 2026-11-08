<!--
@file src/routes/(app)/config/tenants/+page.svelte
@component
**Tenant management dashboard for managing tenants, quotas, and statuses. Features: List tenants, toggle status, visualize quotas, create/edit tenant modal**

### Props:
 - `data`: { tenants: Tenant[] }

### Features:
 - List tenants
 - Toggle tenant status
 - Visualize quotas
 - Create/Edit Tenant modal with quota controls
-->

<script lang="ts">
	import type { PageData } from './$types';
	import type { Tenant } from '@src/databases/db-interface';
	import { createTenant, toggleTenantStatus, updateTenant } from './tenants.remote';
	import { refreshAll } from '$app/navigation';
	import { page } from '$app/state';
	import AdminCard from '@components/admin-card.svelte';
	import AdminPageShell from '@components/admin-page-shell.svelte';
	import Badge from '@components/ui/badge.svelte';
	import Button from '@components/ui/button.svelte';
	import Input from '@components/ui/input.svelte';
	import Select from '@components/ui/select.svelte';
	import Modal from '@components/ui/modal.svelte';
	import Tooltip from '@components/ui/tooltip.svelte';
	import HelpIcon from '@components/ui/help-icon.svelte';
	import { formatDate } from '@utils/format-date';
	import { toast } from '@src/stores/toast.svelte';
	import {
		SMART_TABLE,
		SMART_TABLE_ROW_HOVER,
		SMART_TABLE_SCROLL,
		SMART_TABLE_TD,
		SMART_TABLE_TH,
		SMART_TABLE_THEAD
	} from '@components/ui/smart-table/chrome';

	let { data }: { data: PageData } = $props();

	let tenants = $derived(data.tenants);

	// Status action loading tracker per tenant ID
	let actionLoading = $state<Record<string, boolean>>({});

	// Modal State
	let modalOpen = $state(false);
	let modalMode = $state<'create' | 'edit'>('create');
	let submitting = $state(false);

	// Form fields
	let targetTenantId = $state('');
	let formName = $state('');
	let formPlan = $state<'free' | 'pro' | 'enterprise'>('free');
	let formMaxUsers = $state(5);
	let formMaxStorageMB = $state(25);
	let formMaxCollections = $state(10);
	let formMaxApiRequests = $state(10000);

	const planOptions = [
		{ value: 'free', label: 'Free' },
		{ value: 'pro', label: 'Pro' },
		{ value: 'enterprise', label: 'Enterprise' }
	];

	function openCreateModal() {
		modalMode = 'create';
		targetTenantId = '';
		formName = '';
		formPlan = 'free';
		formMaxUsers = 5;
		formMaxStorageMB = 25;
		formMaxCollections = 10;
		formMaxApiRequests = 10000;
		modalOpen = true;
	}

	function openEditModal(tenant: Tenant) {
		modalMode = 'edit';
		targetTenantId = String(tenant._id);
		formName = tenant.name;
		formPlan = tenant.plan;
		formMaxUsers = tenant.quota?.maxUsers ?? 5;
		formMaxStorageMB = Math.round((tenant.quota?.maxStorageBytes ?? 26214400) / (1024 * 1024));
		formMaxCollections = tenant.quota?.maxCollections ?? 10;
		formMaxApiRequests = tenant.quota?.maxApiRequestsPerMonth ?? 10000;
		modalOpen = true;
	}

	function onPlanChange(newPlan: string) {
		formPlan = newPlan as 'free' | 'pro' | 'enterprise';
		if (modalMode === 'create') {
			if (formPlan === 'free') {
				formMaxUsers = 5;
				formMaxStorageMB = 25;
				formMaxCollections = 10;
				formMaxApiRequests = 10000;
			} else if (formPlan === 'pro') {
				formMaxUsers = 25;
				formMaxStorageMB = 10240; // 10 GB
				formMaxCollections = 50;
				formMaxApiRequests = 100000;
			} else if (formPlan === 'enterprise') {
				formMaxUsers = 100;
				formMaxStorageMB = 102400; // 100 GB
				formMaxCollections = 200;
				formMaxApiRequests = 1000000;
			}
		}
	}

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (!formName.trim()) {
			toast.warning('Tenant name is required');
			return;
		}

		submitting = true;
		try {
			const quota = {
				maxUsers: Number(formMaxUsers) || 1,
				maxStorageBytes: (Number(formMaxStorageMB) || 1) * 1024 * 1024,
				maxCollections: Number(formMaxCollections) || 1,
				maxApiRequestsPerMonth: Number(formMaxApiRequests) || 1000
			};

			if (modalMode === 'create') {
				await createTenant({
					name: formName.trim(),
					plan: formPlan,
					quota
				});
				toast.success(`Tenant "${formName}" created`);
			} else {
				await updateTenant({
					tenantId: targetTenantId,
					name: formName.trim(),
					plan: formPlan,
					quota
				});
				toast.success(`Tenant "${formName}" updated`);
			}
			modalOpen = false;
			await refreshAll();
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Operation failed';
			toast.error(msg);
		} finally {
			submitting = false;
		}
	}

	async function handleToggleStatus(tenant: Tenant) {
		const id = String(tenant._id);
		actionLoading[id] = true;
		const nextStatus = tenant.status === 'active' ? 'suspended' : 'active';
		try {
			await toggleTenantStatus({
				tenantId: id,
				status: nextStatus
			});
			toast.success(`Tenant marked as ${nextStatus}`);
			await refreshAll();
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Status update failed';
			toast.error(msg);
		} finally {
			actionLoading[id] = false;
		}
	}

	function formatBytes(bytes: number, decimals = 2) {
		if (!+bytes) {
			return '0 Bytes';
		}
		const k = 1024;
		const dm = decimals < 0 ? 0 : decimals;
		const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return `${Number.parseFloat((bytes / k ** i).toFixed(dm))} ${sizes[i]}`;
	}
</script>

<AdminPageShell
	title="Tenants"
	icon="mdi:office-building"
	description="Manage organizations and resource quotas."
	showBackButton={true}
	backUrl="/config"
>
	{#snippet actions()}
		<Button variant="primary" leadingIcon="mdi:plus" onclick={openCreateModal}>
			Create Tenant
		</Button>
	{/snippet}

	<AdminCard class="overflow-hidden p-0">
		<div class="{SMART_TABLE_SCROLL} w-full">
			<table class={SMART_TABLE}>
				<thead class={SMART_TABLE_THEAD}>
					<tr class="text-xs uppercase tracking-wider">
						<th class="{SMART_TABLE_TH} text-start! px-4!">Name</th>
						<th class="{SMART_TABLE_TH} text-start! px-4!">Status</th>
						<th class="{SMART_TABLE_TH} text-start! px-4!">Users</th>
						<th class="{SMART_TABLE_TH} text-start! px-4!">Storage</th>
						<th class="{SMART_TABLE_TH} text-start! px-4!">Collections</th>
						<th class="{SMART_TABLE_TH} text-start! px-4!">Plan</th>
						<th class="{SMART_TABLE_TH} text-start! px-4!">Created</th>
						<th class="{SMART_TABLE_TH} text-end! px-4!">Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each tenants as tenant (tenant._id)}
						{@const id = String(tenant._id)}
						<tr
							class="border-t border-surface-100 text-surface-600 dark:border-surface-500/40 dark:text-surface-400 {SMART_TABLE_ROW_HOVER}"
						>
							<td class="{SMART_TABLE_TD} text-start! px-4! font-medium">{tenant.name}</td>
							<td class="{SMART_TABLE_TD} text-start! px-4!">
								{#if tenant.status === 'active'}
									<Badge variant="primary">Active</Badge>
								{:else if tenant.status === 'suspended'}
									<Badge variant="error">Suspended</Badge>
								{:else}
									<Badge variant="surface">{tenant.status}</Badge>
								{/if}
							</td>
							<td class="{SMART_TABLE_TD} text-start! px-4!">
								<div class="flex flex-col text-xs">
									<span>{tenant.usage.usersCount} / {tenant.quota.maxUsers}</span>
									<progress
										class="progress mt-1 h-1 w-16"
										value={tenant.usage.usersCount}
										max={tenant.quota.maxUsers}
									></progress>
								</div>
							</td>
							<td class="{SMART_TABLE_TD} text-start! px-4!">
								<div class="flex flex-col text-xs">
									<span
										>{formatBytes(tenant.usage.storageBytes)} / {formatBytes(
											tenant.quota.maxStorageBytes
										)}</span
									>
									<progress
										class="progress mt-1 h-1 w-16"
										value={tenant.usage.storageBytes}
										max={tenant.quota.maxStorageBytes}
									></progress>
								</div>
							</td>
							<td class="{SMART_TABLE_TD} text-start! px-4!"
								>{tenant.usage.collectionsCount} / {tenant.quota.maxCollections}</td
							>
							<td class="{SMART_TABLE_TD} text-start! px-4! text-xs font-bold uppercase opacity-70"
								>{tenant.plan}</td
							>
							<td class="{SMART_TABLE_TD} text-start! px-4!">
								{formatDate(tenant.createdAt, page.data.systemLanguage)}
							</td>
							<td class="{SMART_TABLE_TD} text-end! px-4!">
								<div class="flex items-center justify-end gap-2">
									<Button
										variant="ghost"
										size="sm"
										leadingIcon="mdi:pencil"
										title="Edit Tenant & Quotas"
										onclick={() => openEditModal(tenant)}
									>
										Edit
									</Button>
									<Button
										variant={tenant.status === 'active' ? 'outline' : 'primary'}
										size="sm"
										loading={actionLoading[id]}
										onclick={() => handleToggleStatus(tenant)}
									>
										{tenant.status === 'active' ? 'Suspend' : 'Activate'}
									</Button>
								</div>
							</td>
						</tr>
					{/each}
					{#if tenants.length === 0}
						<tr>
							<td colspan="8" class="{SMART_TABLE_TD} py-10! text-surface-500">No tenants found.</td
							>
						</tr>
					{/if}
				</tbody>
			</table>
		</div>
	</AdminCard>
</AdminPageShell>

<!-- Create / Edit Tenant Modal -->
<Modal
	bind:open={modalOpen}
	title={modalMode === 'create' ? 'Create New Tenant' : 'Edit Tenant & Quotas'}
	size="md"
>
	<form onsubmit={handleSubmit} class="space-y-4 p-2">
		<div>
			<div class="mb-1 flex items-center gap-1.5">
				<label for="tenant-name" class="block text-sm font-medium">Tenant Name</label>
				<Tooltip
					title="The human-readable name of the organization or workspace."
					positioning={{ placement: 'top' }}
				>
					<HelpIcon ariaLabel="Help for Tenant Name" tabindex="0" />
				</Tooltip>
			</div>
			<Input id="tenant-name" bind:value={formName} placeholder="e.g. Acme Corporation" required />
		</div>

		<div>
			<div class="mb-1 flex items-center gap-1.5">
				<label for="tenant-plan" class="block text-sm font-medium">Plan</label>
				<Tooltip
					title="Select a plan tier to populate default quota limits or customize individually."
					positioning={{ placement: 'top' }}
				>
					<HelpIcon ariaLabel="Help for Plan" tabindex="0" />
				</Tooltip>
			</div>
			<Select
				id="tenant-plan"
				value={formPlan}
				options={planOptions}
				onchange={(val) => onPlanChange(String(val))}
			/>
		</div>

		<div class="border-t border-surface-500/20 pt-4">
			<h4 class="mb-3 text-xs font-bold uppercase tracking-wider text-(--admin-text-muted)">
				Resource Quotas
			</h4>

			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<div>
					<div class="mb-1 flex items-center gap-1.5">
						<label for="quota-users" class="block text-xs font-medium">Max Users</label>
						<Tooltip
							title="Maximum number of active users allowed in this tenant."
							positioning={{ placement: 'top' }}
						>
							<HelpIcon ariaLabel="Help for Max Users" tabindex="0" />
						</Tooltip>
					</div>
					<Input id="quota-users" type="number" min="1" bind:value={formMaxUsers} required />
				</div>

				<div>
					<div class="mb-1 flex items-center gap-1.5">
						<label for="quota-storage" class="block text-xs font-medium">Max Storage (MB)</label>
						<Tooltip
							title="Storage ceiling in megabytes allocated for files and media uploads."
							positioning={{ placement: 'top' }}
						>
							<HelpIcon ariaLabel="Help for Max Storage" tabindex="0" />
						</Tooltip>
					</div>
					<Input id="quota-storage" type="number" min="1" bind:value={formMaxStorageMB} required />
				</div>

				<div>
					<div class="mb-1 flex items-center gap-1.5">
						<label for="quota-collections" class="block text-xs font-medium">Max Collections</label>
						<Tooltip
							title="Maximum number of content schemas/collections this tenant may define."
							positioning={{ placement: 'top' }}
						>
							<HelpIcon ariaLabel="Help for Max Collections" tabindex="0" />
						</Tooltip>
					</div>
					<Input
						id="quota-collections"
						type="number"
						min="1"
						bind:value={formMaxCollections}
						required
					/>
				</div>

				<div>
					<div class="mb-1 flex items-center gap-1.5">
						<label for="quota-api" class="block text-xs font-medium">Max API Req / Month</label>
						<Tooltip
							title="Monthly request rate ceiling for API endpoints and webhooks."
							positioning={{ placement: 'top' }}
						>
							<HelpIcon ariaLabel="Help for Max API Requests" tabindex="0" />
						</Tooltip>
					</div>
					<Input
						id="quota-api"
						type="number"
						min="100"
						step="100"
						bind:value={formMaxApiRequests}
						required
					/>
				</div>
			</div>
		</div>

		<div class="mt-6 flex justify-end gap-3 pt-2">
			<Button
				variant="ghost"
				type="button"
				disabled={submitting}
				onclick={() => (modalOpen = false)}
			>
				Cancel
			</Button>
			<Button variant="primary" type="submit" loading={submitting}>
				{modalMode === 'create' ? 'Create' : 'Save Changes'}
			</Button>
		</div>
	</form>
</Modal>
