<script lang="ts">
/**
 * @file src/routes/(app)/config/trash/+page.svelte
 * @description UI for browsing and restoring soft-deleted content.
 */
import { onMount } from "svelte";
import { fetchApi } from "@utils/api-client";
import { toast } from "@src/stores/toast.svelte";
import { formatDate } from "@utils/date-utils";
let trashedItems = $state<any[]>([]);
let isLoading = $state(true);

async function loadTrash() {
	isLoading = true;
	const response = await fetchApi<any[]>("/api/trash");
	if (response.success) {
		trashedItems = response.data || [];
	} else {
		toast.error(response.message || "Failed to load trash");
	}
	isLoading = false;
}

async function restoreItem(collectionId: string, entryId: string) {
	const response = await fetchApi("/api/trash/restore", {
		method: "POST",
		body: JSON.stringify({ collectionId, entryId }),
	});

	if (response.success) {
		toast.success("Item restored successfully");
		await loadTrash();
	} else {
		toast.error(response.message || "Failed to restore item");
	}
}

onMount(loadTrash);
</script>

<div class="container mx-auto p-6">
	<header class="mb-8 flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold">Global Trash Bin</h1>
			<p class="text-surface-600 dark:text-surface-400">
				Browse and restore soft-deleted content from all collections.
			</p>
		</div>
		<button class="btn variant-ghost-surface" onclick={loadTrash} disabled={isLoading}>
			<iconify-icon icon="mdi:refresh" class="mr-2"></iconify-icon>
			Refresh
		</button>
	</header>

	{#if isLoading}
		<div class="flex h-64 items-center justify-center">
			<div class="placeholder animate-pulse">Loading trash...</div>
		</div>
	{:else if trashedItems.length === 0}
		<div class="card p-12 text-center border-dashed border-2 border-surface-300 dark:border-surface-700">
			<iconify-icon icon="mdi:trash-can-outline" width="64" class="mx-auto mb-4 opacity-20"></iconify-icon>
			<h3 class="text-xl font-semibold">Your trash is empty</h3>
			<p class="text-surface-500">Deleted items will appear here for 30 days.</p>
		</div>
	{:else}
		<div class="table-container card p-4">
			<table class="table table-hover">
				<thead>
					<tr>
						<th>Content</th>
						<th>Collection</th>
						<th>Deleted At</th>
						<th>Deleted By</th>
						<th class="text-right">Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each trashedItems as item}
						<tr>
							<td>
								<span class="font-medium">{item.title || item.name || item._id}</span>
								<div class="text-xs opacity-50 font-mono">{item._id}</div>
							</td>
							<td>
								<span class="badge variant-soft-secondary">{item.collectionName}</span>
							</td>
							<td>{formatDate(item.deletedAt)}</td>
							<td>{item.deletedBy || 'System'}</td>
							<td class="text-right">
								<button 
									class="btn btn-sm variant-filled-primary"
									onclick={() => restoreItem(item.collectionId, item._id)}
								>
									<iconify-icon icon="mdi:restore" class="mr-1"></iconify-icon>
									Restore
								</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
