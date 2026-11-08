<!--
@file src/routes/(app)/config/webhooks/logs/+page.svelte
@component UI for monitoring Webhook delivery logs and the Dead-Letter Queue (DLQ).

### Features:
- SmartTableShell adoption: consistent table chrome, interactive column sorting, client pagination, token-compliant empty/loading states
- DLQ manual retry for failed webhook deliveries
- Preserves all test IDs (filter, refresh, loading, empty, error, table)
- Filter by delivery status
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { adminFade } from '@utils/admin-transitions';
	import { fetchApi } from '@utils/http-client';
	import { toast } from '@src/stores/toast.svelte';
	import { formatDisplayDate } from '@utils/date';
	import type { WebhookDeliveryLog } from '@src/services/background/webhook-service';
	import Badge from '@components/ui/badge.svelte';
	import Button from '@components/ui/button.svelte';
	import AdminCard from '@components/admin-card.svelte';
	import AdminPageShell from '@components/admin-page-shell.svelte';
	import Select from '@components/ui/select.svelte';
	import SmartTableShell from '@components/ui/smart-table/smart-table-shell.svelte';
	import {
		SMART_TABLE,
		SMART_TABLE_ROW_HOVER,
		SMART_TABLE_TD,
		SMART_TABLE_TH,
		SMART_TABLE_THEAD
	} from '@components/ui/smart-table/chrome';
	import {
		button_refresh,
		collection_status,
		common_error,
		trash_th_actions,
		webhooks_logs_attempts,
		webhooks_logs_failed_dlq,
		webhooks_logs_last_attempt,
		webhooks_logs_no_logs,
		webhooks_logs_no_logs_hint,
		webhooks_logs_retry_now,
		webhooks_logs_retrying,
		webhooks_logs_success,
		webhooks_logs_title,
		webhooks_logs_webhook_event
	} from '@src/paraglide/messages';

	type SortField = 'webhook' | 'status' | 'attempts' | 'updatedAt' | 'lastError';
	type SortOrder = 'asc' | 'desc';

	let logs = $state<WebhookDeliveryLog[]>([]);
	let isLoading = $state(true);
	let loadError = $state<string | null>(null);
	let filterStatus = $state('');

	let sortField = $state<SortField>('updatedAt');
	let sortOrder = $state<SortOrder>('desc');

	let currentPage = $state(1);
	let rowsPerPage = $state(10);

	const statusOptions = [
		{ value: '', label: 'All Statuses' },
		{ value: 'completed', label: 'Success' },
		{ value: 'pending', label: 'Pending/Retrying' },
		{ value: 'failed', label: 'Failed (DLQ)' }
	];

	function toggleSort(field: SortField) {
		if (sortField === field) {
			sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
		} else {
			sortField = field;
			sortOrder = field === 'updatedAt' ? 'desc' : 'asc';
		}
	}

	const sortedLogs = $derived.by(() => {
		const items = [...logs];
		items.sort((a, b) => {
			let cmp = 0;
			switch (sortField) {
				case 'webhook': {
					const aVal = `${a.webhookName} ${a.event}`;
					const bVal = `${b.webhookName} ${b.event}`;
					cmp = aVal.localeCompare(bVal);
					break;
				}
				case 'status': {
					cmp = (a.status || '').localeCompare(b.status || '');
					break;
				}
				case 'attempts': {
					cmp = (a.attempts ?? 0) - (b.attempts ?? 0);
					break;
				}
				case 'updatedAt': {
					const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
					const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
					cmp = aTime - bTime;
					break;
				}
				case 'lastError': {
					const aVal = a.lastError || '';
					const bVal = b.lastError || '';
					cmp = aVal.localeCompare(bVal);
					break;
				}
			}
			return sortOrder === 'asc' ? cmp : -cmp;
		});
		return items;
	});

	const pagesCount = $derived(Math.max(1, Math.ceil(sortedLogs.length / rowsPerPage)));
	const paginatedLogs = $derived.by(() => {
		const start = (currentPage - 1) * rowsPerPage;
		return sortedLogs.slice(start, start + rowsPerPage);
	});

	async function loadLogs() {
		isLoading = true;
		loadError = null;
		currentPage = 1;
		const query = filterStatus ? `?status=${filterStatus}` : '';
		const response = await fetchApi<WebhookDeliveryLog[]>(`/api/webhooks/logs${query}`);
		if (response.success) {
			// An empty delivery log is a normal state (fresh install, quiet tenant) —
			// it must never surface as an error toast.
			logs = Array.isArray(response.data) ? response.data : [];
		} else {
			logs = [];
			loadError = response.message || 'Failed to load webhook logs';
			toast.error(loadError);
		}
		isLoading = false;
	}

	async function retryWebhook(jobId: string) {
		const response = await fetchApi(`/api/webhooks/logs/${jobId}/retry`, {
			method: 'POST'
		});

		if (response.success) {
			toast.success('Webhook delivery queued for retry');
			await loadLogs();
		} else {
			toast.error(response.message || 'Failed to retry webhook');
		}
	}

	onMount(loadLogs);
</script>

<AdminPageShell
	title={webhooks_logs_title()}
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
			<Button
				variant="ghost"
				onclick={loadLogs}
				disabled={isLoading}
				leadingIcon="mdi:refresh"
				data-testid="webhook-logs-refresh"
			>
				{button_refresh()}
			</Button>
		</div>
	{/snippet}

	<div data-testid="webhook-logs-page" class="contents">
		{#if isLoading}
			<div data-testid="webhook-logs-loading" class="contents">
				<AdminCard class="my-2 flex h-64 min-h-0 w-full flex-col sm:my-3">
					<SmartTableShell loading={true} />
				</AdminCard>
			</div>
		{:else if loadError}
			<AdminCard
				class="border border-error-500/30 bg-error-500/10 p-6 text-center dark:border-error-500/40 dark:bg-error-900/20"
				data-testid="webhook-logs-error"
			>
				<h3 class="text-lg font-semibold text-error-500">{common_error()}</h3>
				<p class="mt-1 text-sm text-error-500">{loadError}</p>
			</AdminCard>
		{:else}
			<div in:adminFade class="flex min-h-0 flex-1 flex-col">
				<AdminCard
					class="my-2 flex h-full min-h-0 w-full flex-col sm:my-3"
					data-testid="webhook-logs-table"
				>
					<SmartTableShell
						empty={sortedLogs.length === 0}
						emptyTitle={webhooks_logs_no_logs()}
						emptyDescription={webhooks_logs_no_logs_hint()}
						emptyIcon="mdi:webhook"
						showPagination={sortedLogs.length > 0}
						bind:currentPage
						bind:rowsPerPage
						{pagesCount}
						totalItems={sortedLogs.length}
						rowsPerPageOptions={[10, 25, 50, 100]}
					>
						{#snippet emptyAction()}
							<div data-testid="webhook-logs-empty" class="contents"></div>
						{/snippet}

						<table class={SMART_TABLE}>
							<thead class={SMART_TABLE_THEAD}>
								<tr
									class="border-b border-surface-500/30 text-xs uppercase tracking-wide dark:border-surface-600"
								>
									<th class="{SMART_TABLE_TH} text-center">
										<button
											type="button"
											class="inline-flex items-center gap-1 font-semibold tracking-wider hover:text-primary-500 focus:outline-none"
											onclick={() => toggleSort('webhook')}
										>
											{webhooks_logs_webhook_event()}
											{#if sortField === 'webhook'}
												<iconify-icon
													icon={sortOrder === 'asc' ? 'mdi:arrow-up' : 'mdi:arrow-down'}
													class="text-primary-500"
												></iconify-icon>
											{/if}
										</button>
									</th>
									<th class="{SMART_TABLE_TH} text-center">
										<button
											type="button"
											class="inline-flex items-center gap-1 font-semibold tracking-wider hover:text-primary-500 focus:outline-none"
											onclick={() => toggleSort('status')}
										>
											{collection_status()}
											{#if sortField === 'status'}
												<iconify-icon
													icon={sortOrder === 'asc' ? 'mdi:arrow-up' : 'mdi:arrow-down'}
													class="text-primary-500"
												></iconify-icon>
											{/if}
										</button>
									</th>
									<th class="{SMART_TABLE_TH} text-center">
										<button
											type="button"
											class="inline-flex items-center gap-1 font-semibold tracking-wider hover:text-primary-500 focus:outline-none"
											onclick={() => toggleSort('attempts')}
										>
											{webhooks_logs_attempts()}
											{#if sortField === 'attempts'}
												<iconify-icon
													icon={sortOrder === 'asc' ? 'mdi:arrow-up' : 'mdi:arrow-down'}
													class="text-primary-500"
												></iconify-icon>
											{/if}
										</button>
									</th>
									<th class="{SMART_TABLE_TH} text-center">
										<button
											type="button"
											class="inline-flex items-center gap-1 font-semibold tracking-wider hover:text-primary-500 focus:outline-none"
											onclick={() => toggleSort('updatedAt')}
										>
											{webhooks_logs_last_attempt()}
											{#if sortField === 'updatedAt'}
												<iconify-icon
													icon={sortOrder === 'asc' ? 'mdi:arrow-up' : 'mdi:arrow-down'}
													class="text-primary-500"
												></iconify-icon>
											{/if}
										</button>
									</th>
									<th class="{SMART_TABLE_TH} text-center">
										<button
											type="button"
											class="inline-flex items-center gap-1 font-semibold tracking-wider hover:text-primary-500 focus:outline-none"
											onclick={() => toggleSort('lastError')}
										>
											{common_error()}
											{#if sortField === 'lastError'}
												<iconify-icon
													icon={sortOrder === 'asc' ? 'mdi:arrow-up' : 'mdi:arrow-down'}
													class="text-primary-500"
												></iconify-icon>
											{/if}
										</button>
									</th>
									<th class="{SMART_TABLE_TH} text-center">{trash_th_actions()}</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-surface-200/30 dark:divide-surface-700/30">
								{#each paginatedLogs as log (log._id)}
									<tr class={SMART_TABLE_ROW_HOVER} data-testid={`webhook-log-row-${log._id}`}>
										<td class={SMART_TABLE_TD}>
											<div class="font-medium">{log.webhookName}</div>
											<Badge preset="tonal" color="surface" size="sm">{log.event}</Badge>
										</td>
										<td class={SMART_TABLE_TD}>
											{#if log.status === 'completed'}
												<Badge variant="success">{webhooks_logs_success()}</Badge>
											{:else if log.status === 'failed'}
												<Badge variant="error">{webhooks_logs_failed_dlq()}</Badge>
											{:else}
												<Badge variant="warning">{webhooks_logs_retrying()}</Badge>
											{/if}
										</td>
										<td class={SMART_TABLE_TD}>{log.attempts} / {log.maxAttempts || 5}</td>
										<td class={SMART_TABLE_TD}>{formatDisplayDate(log.updatedAt)}</td>
										<td class="{SMART_TABLE_TD} max-w-xs truncate font-mono text-xs text-error-500">
											{log.lastError || '-'}
										</td>
										<td class={SMART_TABLE_TD}>
											{#if log.status === 'failed'}
												<Button variant="primary" onclick={() => retryWebhook(log._id)} size="sm">
													{webhooks_logs_retry_now()}
												</Button>
											{/if}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</SmartTableShell>
				</AdminCard>
			</div>
		{/if}
	</div>
</AdminPageShell>
