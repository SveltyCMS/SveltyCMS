<script lang="ts">
/**
 * @file src/routes/(app)/config/webhooks/logs/+page.svelte
 * @description UI for monitoring Webhook delivery logs and the Dead-Letter Queue (DLQ).
 */
import { onMount } from "svelte";
import { fetchApi } from "@utils/api";
import { toast } from "@src/stores/toast.svelte";
import { formatDisplayDate } from "@utils/date";
import Badge from '@components/ui/badge.svelte';
import Button from '@components/ui/button.svelte';
import Loader from '@components/ui/loader.svelte';
import AdminCard from '@components/admin-card.svelte';
import AdminPageShell from '@components/admin-page-shell.svelte';
import Select from '@components/ui/select.svelte';

let logs = $state<any[]>([]);
let isLoading = $state(true);
let filterStatus = $state("");

const statusOptions = [
	{ value: "", label: "All Statuses" },
	{ value: "completed", label: "Success" },
	{ value: "pending", label: "Pending/Retrying" },
	{ value: "failed", label: "Failed (DLQ)" },
];

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

<AdminPageShell
		title="Webhook Health Monitor"
		icon="mdi:webhook"
		description="Monitor delivery status and manage the Dead-Letter Queue."
		showBackButton={true}
		backUrl="/config/webhooks"
	>
	{#snippet actions()}
		<div class="flex items-center gap-3">
			<div data-testid="webhook-logs-filter">
				<Select
					bind:value={filterStatus}
					options={statusOptions}
					size="sm"
					class="min-w-44"
					onchange={() => loadLogs()}
				/>
			</div>
			<Button variant="ghost" onclick={loadLogs} disabled={isLoading} leadingIcon="mdi:refresh" data-testid="webhook-logs-refresh">
				Refresh
			</Button>
		</div>
	{/snippet}

	<div data-testid="webhook-logs-page" class="contents">
	{#if isLoading}
		<AdminCard class="flex h-64 items-center justify-center border border-surface-200 bg-white p-6 dark:border-surface-800 dark:bg-surface-900/40" data-testid="webhook-logs-loading">
			<Loader variant="text" lines={2} lastLineWidth="40%" ariaLabel="Loading delivery logs" />
		</AdminCard>
	{:else if logs.length === 0}
		<AdminCard class="border-2 border-dashed border-surface-300 p-12 text-center dark:border-surface-700" data-testid="webhook-logs-empty">
			<iconify-icon icon="mdi:webhook" width="64" class="mx-auto mb-4 opacity-20"></iconify-icon>
			<h3 class="text-xl font-semibold text-surface-900 dark:text-white">No logs found</h3>
			<p class="text-surface-500">Webhook delivery attempts will appear here.</p>
		</AdminCard>
	{:else}
		<AdminCard class="overflow-hidden border border-surface-200 bg-white p-0 shadow-xs backdrop-blur-md dark:border-surface-800 dark:bg-surface-900/40" data-testid="webhook-logs-table">
			<div class="overflow-x-auto w-full">
				<table class="w-full border-collapse text-sm">
					<thead>
						<tr class="border-b border-surface-200 text-start text-xs uppercase tracking-wider text-surface-400 dark:border-surface-800">
							<th class="px-4 py-3 font-semibold">Webhook / Event</th>
							<th class="px-4 py-3 font-semibold">Status</th>
							<th class="px-4 py-3 font-semibold">Attempts</th>
							<th class="px-4 py-3 font-semibold">Last Attempt</th>
							<th class="px-4 py-3 font-semibold">Error</th>
							<th class="px-4 py-3 text-end font-semibold">Actions</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-surface-100 dark:divide-surface-800/60">
						{#each logs as log (log._id)}
							<tr class="text-surface-700 transition-colors hover:bg-surface-50/40 dark:text-surface-200 dark:hover:bg-surface-900/30">
								<td class="px-4 py-3">
									<div class="font-medium">{log.payload?.webhook?.name}</div>
									<Badge preset="tonal" color="surface" size="sm">{log.payload?.event}</Badge>
								</td>
								<td class="px-4 py-3">
									{#if log.status === 'completed'}
										<Badge variant="success">SUCCESS</Badge>
									{:else if log.status === 'failed'}
										<Badge variant="error">FAILED (DLQ)</Badge>
									{:else}
										<Badge variant="warning">RETRYING</Badge>
									{/if}
								</td>
								<td class="px-4 py-3">{log.attempts} / {log.maxAttempts || 5}</td>
								<td class="px-4 py-3">{formatDisplayDate(log.updatedAt)}</td>
								<td class="max-w-xs truncate px-4 py-3 font-mono text-xs text-error-500">
									{log.lastError || '-'}
								</td>
								<td class="px-4 py-3 text-end">
									{#if log.status === 'failed'}
										<Button variant="primary" onclick={() => retryWebhook(log._id)} size="sm">
											Retry Now
										</Button>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</AdminCard>
	{/if}
	</div>
</AdminPageShell>
