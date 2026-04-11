<script lang="ts">
/**
 * @file src/routes/(app)/config/webhooks/logs/+page.svelte
 * @description UI for monitoring Webhook delivery logs and the Dead-Letter Queue (DLQ).
 */
import { onMount } from "svelte";
import { fetchApi } from "@utils/api-client";
import { toast } from "@src/stores/toast.svelte";
import { formatDate } from "@utils/date-utils";

let logs = $state<any[]>([]);
let isLoading = $state(true);
let filterStatus = $state("");

async function loadLogs() {
	isLoading = true;
	const query = filterStatus ? `?status=${filterStatus}` : "";
	const response = await fetchApi<any[]>(`/api/webhooks/logs${query}`);
	if (response.success) {
		logs = response.data || [];
	} else {
		toast.error(response.message || "Failed to load webhook logs");
	}
	isLoading = false;
}

async function retryWebhook(jobId: string) {
	const response = await fetchApi(`/api/webhooks/logs/${jobId}/retry`, {
		method: "POST",
	});

	if (response.success) {
		toast.success("Webhook delivery queued for retry");
		await loadLogs();
	} else {
		toast.error(response.message || "Failed to retry webhook");
	}
}

onMount(loadLogs);
</script>

<div class="container mx-auto p-6">
	<header class="mb-8 flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold">Webhook Health Monitor</h1>
			<p class="text-surface-600 dark:text-surface-400">
				Monitor delivery status and manage the Dead-Letter Queue.
			</p>
		</div>
		<div class="flex gap-4">
			<select class="select" bind:value={filterStatus} onchange={loadLogs}>
				<option value="">All Statuses</option>
				<option value="completed">Success</option>
				<option value="pending">Pending/Retrying</option>
				<option value="failed">Failed (DLQ)</option>
			</select>
			<button class="btn variant-ghost-surface" onclick={loadLogs} disabled={isLoading}>
				<iconify-icon icon="mdi:refresh" class="mr-2"></iconify-icon>
				Refresh
			</button>
		</div>
	</header>

	{#if isLoading}
		<div class="flex h-64 items-center justify-center">
			<div class="placeholder animate-pulse">Loading delivery logs...</div>
		</div>
	{:else if logs.length === 0}
		<div class="card p-12 text-center border-dashed border-2 border-surface-300 dark:border-surface-700">
			<iconify-icon icon="mdi:webhook" width="64" class="mx-auto mb-4 opacity-20"></iconify-icon>
			<h3 class="text-xl font-semibold">No logs found</h3>
			<p class="text-surface-500">Webhook delivery attempts will appear here.</p>
		</div>
	{:else}
		<div class="table-container card p-4">
			<table class="table table-hover">
				<thead>
					<tr>
						<th>Webhook / Event</th>
						<th>Status</th>
						<th>Attempts</th>
						<th>Last Attempt</th>
						<th>Error</th>
						<th class="text-right">Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each logs as log}
						<tr>
							<td>
								<div class="font-medium">{log.payload?.webhook?.name}</div>
								<div class="text-xs badge variant-soft-surface">{log.payload?.event}</div>
							</td>
							<td>
								{#if log.status === 'completed'}
									<span class="badge variant-filled-success">SUCCESS</span>
								{:else if log.status === 'failed'}
									<span class="badge variant-filled-error">FAILED (DLQ)</span>
								{:else}
									<span class="badge variant-filled-warning">RETRYING</span>
								{/if}
							</td>
							<td>{log.attempts} / {log.maxAttempts || 5}</td>
							<td>{formatDate(log.updatedAt)}</td>
							<td class="max-w-xs truncate text-xs text-error-500 font-mono">
								{log.lastError || '-'}
							</td>
							<td class="text-right">
								{#if log.status === 'failed'}
									<button 
										class="btn btn-sm variant-filled-primary"
										onclick={() => retryWebhook(log._id)}
									>
										Retry Now
									</button>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
