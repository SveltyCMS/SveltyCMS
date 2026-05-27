<script lang="ts">
/**
 * @file src/routes/(app)/config/trash/+page.svelte
 * @description UI for browsing and restoring soft-deleted content.
 */
import { fade, fly } from "svelte/transition";
import { onMount } from "svelte";
import { fetchApi } from "@utils/api";
import { toast } from "@src/stores/toast.svelte";
import { formatDate } from "@utils/date";
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

<div class="absolute inset-0 p-6 space-y-8 bg-surface-50/50 dark:bg-surface-950/50 overflow-y-auto">
	<!-- Header -->
	<div class="flex items-center justify-between" in:fade>
		<div>
			<h1 class="text-3xl font-bold flex items-center gap-3">
				<iconify-icon icon="mdi:delete-outline" class="text-primary-500"></iconify-icon>
				Global Trash Bin
			</h1>
			<p class="text-sm opacity-50 font-medium">Browse and restore soft-deleted content from all collections</p>
		</div>
		<button class="btn preset-ghost-surface-500" onclick={loadTrash} disabled={isLoading}>
			<iconify-icon icon="mdi:refresh" class="mr-2"></iconify-icon>
			Refresh
		</button>
	</div>

	{#if isLoading}
		<div class="flex h-64 items-center justify-center">
			<div class="placeholder animate-pulse">Loading trash...</div>
		</div>
	{:else if trashedItems.length === 0}
		<div class="card p-12 text-center border-dashed border-2 border-surface-300 dark:border-surface-700  bg-white dark:bg-surface-900/50 backdrop-blur-md shadow-sm" in:fly={{ y: 20, delay: 100 }}>
			<iconify-icon icon="mdi:trash-can-outline" width="64" class="mx-auto mb-4 opacity-20"></iconify-icon>
			<h3 class="text-xl font-semibold">Your trash is empty</h3>
			<p class="text-surface-500">Deleted items will appear here for 30 days.</p>
		</div>
	{:else}
		<div class="card p-6 border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900/50 backdrop-blur-md shadow-sm" in:fly={{ y: 20, delay: 100 }}>
			<div class="table-container">
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
									<span class="badge preset-tonal-secondary-500">{item.collectionName}</span>
								</td>
								<td>{formatDate(item.deletedAt)}</td>
								<td>{item.deletedBy || 'System'}</td>
								<td class="text-right">
									<button
										class="btn btn-sm preset-filled-primary-500"
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
		</div>
	{/if}
</div>
