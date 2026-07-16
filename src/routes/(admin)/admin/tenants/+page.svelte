<!--
@file src/routes/(admin)/admin/tenants/+page.svelte
@component
**Admin dashboard for managing tenants, quotas, and statuses. features: List tenants, toggle status, visualize quotas**

### Props:
 - `data`: { tenants: Tenant[] }

### Features:
 - List tenants
 - Toggle tenant status
 - Visualize quotas
-->

<script lang="ts">
import type { PageData } from "./$types";
import { createTenant, toggleTenantStatus } from "./tenants.remote";
import { invalidateAll } from '$app/navigation';
import AdminCard from '@components/admin-card.svelte';
import AdminPageShell from '@components/admin-page-shell.svelte';
import Badge from '@components/ui/badge.svelte';
import Button from '@components/ui/button.svelte';
import {
	SMART_TABLE,
	SMART_TABLE_ROW_HOVER,
	SMART_TABLE_SCROLL,
	SMART_TABLE_TD,
	SMART_TABLE_TH,
	SMART_TABLE_THEAD,
} from '@components/ui/smart-table';

let { data } = $props<{ data: PageData }>();

let tenants = $derived(data.tenants);
let creating = $state(false);

async function handleCreate() {
	creating = true;
	try {
		const name = `Tenant ${Date.now()}`;
		await createTenant({ name });
		await invalidateAll();
	} finally {
		creating = false;
	}
}

function formatBytes(bytes: number, decimals = 2) {
	if (!+bytes) {
		return "0 Bytes";
	}
	const k = 1024;
	const dm = decimals < 0 ? 0 : decimals;
	const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${Number.parseFloat((bytes / k ** i).toFixed(dm))} ${sizes[i]}`;
}
</script>

<AdminPageShell
		title="Tenants"
		icon="mdi:office-building"
		description="Manage organizations and resource quotas."
		showBackButton={true}
		backUrl="/admin"
	>
	{#snippet actions()}
		<Button variant="primary" leadingIcon="mdi:plus" loading={creating} onclick={handleCreate}>Create Tenant</Button>
	{/snippet}

	<AdminCard class="overflow-hidden border border-surface-200 bg-white p-0 shadow-xs backdrop-blur-md dark:border-surface-800 dark:bg-surface-900/40">
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
						<tr class="border-t border-surface-100 text-surface-700 dark:border-surface-800/60 dark:text-surface-200 {SMART_TABLE_ROW_HOVER}">
							<td class="{SMART_TABLE_TD} text-start! px-4! font-medium">{tenant.name}</td>
							<td class="{SMART_TABLE_TD} text-start! px-4!">
								{#if tenant.status === 'active'}
									<Badge variant="success">Active</Badge>
								{:else if tenant.status === 'suspended'}
									<Badge variant="error">Suspended</Badge>
								{:else}
									<Badge preset="tonal" color="surface">{tenant.status}</Badge>
								{/if}
							</td>
							<td class="{SMART_TABLE_TD} text-start! px-4!">
								<div class="flex flex-col text-xs">
									<span>{tenant.usage.usersCount} / {tenant.quota.maxUsers}</span>
									<progress class="progress mt-1 h-1 w-16" value={tenant.usage.usersCount} max={tenant.quota.maxUsers}></progress>
								</div>
							</td>
							<td class="{SMART_TABLE_TD} text-start! px-4!">
								<div class="flex flex-col text-xs">
									<span>{formatBytes(tenant.usage.storageBytes)} / {formatBytes(tenant.quota.maxStorageBytes)}</span>
									<progress class="progress mt-1 h-1 w-16" value={tenant.usage.storageBytes} max={tenant.quota.maxStorageBytes}></progress>
								</div>
							</td>
							<td class="{SMART_TABLE_TD} text-start! px-4!">{tenant.usage.collectionsCount} / {tenant.quota.maxCollections}</td>
							<td class="{SMART_TABLE_TD} text-start! px-4! text-xs font-bold uppercase opacity-70">{tenant.plan}</td>
							<td class="{SMART_TABLE_TD} text-start! px-4!">{new Date(tenant.createdAt).toLocaleDateString()}</td>
							<td class="{SMART_TABLE_TD} text-end! px-4!">
								<Button
									variant={tenant.status === 'active' ? 'outline' : 'primary'}
									size="sm"
									onclick={async () => {
										await toggleTenantStatus({
											tenantId: tenant._id,
											status: tenant.status === 'active' ? 'suspended' : 'active',
										});
										await invalidateAll();
									}}
								>
									{tenant.status === 'active' ? 'Suspend' : 'Activate'}
								</Button>
							</td>
						</tr>
					{/each}
					{#if tenants.length === 0}
						<tr>
							<td colspan="8" class="{SMART_TABLE_TD} py-10! text-surface-500">No tenants found.</td>
						</tr>
					{/if}
				</tbody>
			</table>
		</div>
	</AdminCard>
</AdminPageShell>
