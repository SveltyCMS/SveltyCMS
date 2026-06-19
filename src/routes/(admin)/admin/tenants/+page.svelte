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
import { toggleTenantStatus } from "./tenants.remote";
import AdminCard from '@components/admin-card.svelte';
import AdminPageShell from '@components/admin-page-shell.svelte';
import Badge from '@components/ui/badge.svelte';
import Button from '@components/ui/button.svelte';

let { data } = $props<{ data: PageData }>();

let tenants = $derived(data.tenants);

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
		<Button variant="primary" leadingIcon="mdi:plus">Create Tenant</Button>
	{/snippet}

	<AdminCard class="overflow-hidden border border-surface-200 bg-white p-0 shadow-xs backdrop-blur-md dark:border-surface-800 dark:bg-surface-900/40">
		<div class="w-full overflow-x-auto">
			<table class="w-full border-collapse text-sm">
				<thead>
					<tr class="border-b border-surface-200 text-left text-xs uppercase tracking-wider text-surface-400 dark:border-surface-800">
						<th class="px-4 py-3 font-semibold">Name</th>
						<th class="px-4 py-3 font-semibold">Status</th>
						<th class="px-4 py-3 font-semibold">Users</th>
						<th class="px-4 py-3 font-semibold">Storage</th>
						<th class="px-4 py-3 font-semibold">Collections</th>
						<th class="px-4 py-3 font-semibold">Plan</th>
						<th class="px-4 py-3 font-semibold">Created</th>
						<th class="px-4 py-3 text-right font-semibold">Actions</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-surface-100 dark:divide-surface-800/60">
					{#each tenants as tenant (tenant._id)}
						<tr class="text-surface-700 transition-colors hover:bg-surface-50/40 dark:text-surface-200 dark:hover:bg-surface-900/30">
							<td class="px-4 py-3 font-medium">{tenant.name}</td>
							<td class="px-4 py-3">
								{#if tenant.status === 'active'}
									<Badge variant="success">Active</Badge>
								{:else if tenant.status === 'suspended'}
									<Badge variant="error">Suspended</Badge>
								{:else}
									<Badge preset="tonal" color="surface">{tenant.status}</Badge>
								{/if}
							</td>
							<td class="px-4 py-3">
								<div class="flex flex-col text-xs">
									<span>{tenant.usage.usersCount} / {tenant.quota.maxUsers}</span>
									<progress class="progress mt-1 h-1 w-16" value={tenant.usage.usersCount} max={tenant.quota.maxUsers}></progress>
								</div>
							</td>
							<td class="px-4 py-3">
								<div class="flex flex-col text-xs">
									<span>{formatBytes(tenant.usage.storageBytes)} / {formatBytes(tenant.quota.maxStorageBytes)}</span>
									<progress class="progress mt-1 h-1 w-16" value={tenant.usage.storageBytes} max={tenant.quota.maxStorageBytes}></progress>
								</div>
							</td>
							<td class="px-4 py-3">{tenant.usage.collectionsCount} / {tenant.quota.maxCollections}</td>
							<td class="px-4 py-3 text-xs font-bold uppercase opacity-70">{tenant.plan}</td>
							<td class="px-4 py-3">{new Date(tenant.createdAt).toLocaleDateString()}</td>
							<td class="px-4 py-3 text-right">
								<Button
									variant={tenant.status === 'active' ? 'outline' : 'primary'}
									size="sm"
									onclick={async () => {
										await toggleTenantStatus({
											tenantId: tenant._id,
											status: tenant.status === 'active' ? 'suspended' : 'active',
										});
										window.location.reload();
									}}
								>
									{tenant.status === 'active' ? 'Suspend' : 'Activate'}
								</Button>
							</td>
						</tr>
					{/each}
					{#if tenants.length === 0}
						<tr>
							<td colspan="8" class="px-4 py-10 text-center text-surface-500">No tenants found.</td>
						</tr>
					{/if}
				</tbody>
			</table>
		</div>
	</AdminCard>
</AdminPageShell>
