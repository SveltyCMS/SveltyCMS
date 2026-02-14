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
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	let { data } = $props<{ data: PageData }>();

	let tenants = $derived(data.tenants);

	// Format bytes to human readable
	function formatBytes(bytes: number, decimals = 2) {
		if (!+bytes) return '0 Bytes';
		const k = 1024;
		const dm = decimals < 0 ? 0 : decimals;
		const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
	}
</script>

<div class="container mx-auto p-6 space-y-6">
	<header class="flex justify-between items-center">
		<div>
			<h1 class="h1 font-bold">Tenants</h1>
			<p class="text-surface-500">Manage organizations and resource quotas.</p>
		</div>
		<button class="btn variant-filled-primary">
			<span>+</span>
			<span>Create Tenant</span>
		</button>
	</header>

	<div class="table-container">
		<table class="table table-hover">
			<thead>
				<tr>
					<th>Name</th>
					<th>Status</th>
					<th>Users</th>
					<th>Storage</th>
					<th>Collections</th>
					<th>Plan</th>
					<th>Created</th>
					<th>Actions</th>
				</tr>
			</thead>
			<tbody>
				{#each tenants as tenant (tenant._id)}
					<tr>
						<td class="font-medium">{tenant.name}</td>
						<td>
							{#if tenant.status === 'active'}
								<span class="badge variant-filled-success">Active</span>
							{:else if tenant.status === 'suspended'}
								<span class="badge variant-filled-error">Suspended</span>
							{:else}
								<span class="badge variant-soft-surface">{tenant.status}</span>
							{/if}
						</td>
						<!-- Usage / Quota Visuals -->
						<td>
							<div class="flex flex-col text-xs">
								<span>{tenant.usage.usersCount} / {tenant.quota.maxUsers}</span>
								<progress class="progress h-1 w-16" value={tenant.usage.usersCount} max={tenant.quota.maxUsers}></progress>
							</div>
						</td>
						<td>
							<div class="flex flex-col text-xs">
								<span>{formatBytes(tenant.usage.storageBytes)} / {formatBytes(tenant.quota.maxStorageBytes)}</span>
								<progress class="progress h-1 w-16" value={tenant.usage.storageBytes} max={tenant.quota.maxStorageBytes}></progress>
							</div>
						</td>
						<td>{tenant.usage.collectionsCount} / {tenant.quota.maxCollections}</td>
						<td class="uppercase text-xs font-bold opacity-70">{tenant.plan}</td>
						<td>{new Date(tenant.createdAt).toLocaleDateString()}</td>
						<td>
							<form method="POST" action="?/toggleStatus" use:enhance>
								<input type="hidden" name="tenantId" value={tenant._id} />
								{#if tenant.status === 'active'}
									<input type="hidden" name="status" value="suspended" />
									<button class="btn btn-sm variant-soft-error">Suspend</button>
								{:else}
									<input type="hidden" name="status" value="active" />
									<button class="btn btn-sm variant-filled-success">Activate</button>
								{/if}
							</form>
						</td>
					</tr>
				{/each}
				{#if tenants.length === 0}
					<tr>
						<td colspan="8" class="text-center py-10 opacity-50">No tenants found.</td>
					</tr>
				{/if}
			</tbody>
		</table>
	</div>
</div>
