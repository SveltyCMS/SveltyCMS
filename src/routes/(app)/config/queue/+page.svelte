<!--
@file src/routes/(app)/config/queue/+page.svelte
@description Queue Observability Dashboard UI.
-->

<script lang="ts">
	import { goto, refreshAll } from '$app/navigation';
	import { page } from '$app/state';
	import { clearCompleted, deleteJob, retryJob } from './queue.remote';
	import { toast } from '@src/stores/toast.svelte.ts';
	import { showConfirm } from '@utils/modal.svelte';
	import { formatRelativeDate } from '@utils/date';
	import { adminFade } from '@utils/admin-transitions';
	import Badge from '@components/ui/badge.svelte';
	import Button from '@components/ui/button.svelte';
	import AdminPageShell from '@components/admin-page-shell.svelte';
	import AdminCard from '@components/admin-card.svelte';
	import Modal from '@components/ui/modal.svelte';
	import SmartTableShell from '@components/ui/smart-table/smart-table-shell.svelte';
	import {
		SMART_TABLE,
		SMART_TABLE_ROW_HOVER,
		SMART_TABLE_TD,
		SMART_TABLE_TH,
		SMART_TABLE_THEAD
	} from '@components/ui/smart-table';
	import {
		button_refresh,
		queue_actions,
		queue_attempts,
		queue_clear_completed,
		queue_clear_filter,
		queue_completed,
		queue_created,
		queue_delete_aria,
		queue_delete_title,
		queue_empty,
		queue_failed,
		queue_filter,
		queue_job_id,
		queue_next_run,
		queue_pending,
		queue_recent,
		queue_refresh_aria,
		queue_retry_title,
		queue_running,
		queue_status,
		queue_task_type,
		queue_title,
		queue_total,
		queue_view_all_aria,
		queue_view_completed_aria,
		queue_view_failed_aria,
		queue_view_pending_aria,
		queue_view_running_aria
	} from '@src/paraglide/messages';

	let { data } = $props();

	interface QueueJob {
		_id: string;
		taskType: string;
		status: 'pending' | 'running' | 'completed' | 'failed';
		attempts: number;
		maxAttempts: number;
		nextRunAt?: string | Date | null;
		lastError?: string | null;
		createdAt?: string | Date;
		updatedAt?: string | Date;
		payload?: Record<string, unknown>;
		tenantId?: string | null;
	}

	let isRetrying = $state(false);
	let isDeleting = $state(false);
	let isClearing = $state(false);
	let detailsOpen = $state(false);
	let selectedJob = $state<QueueJob | null>(null);

	/** What each built-in handler actually does — shown in the row detail dialog. */
	const taskDescriptions: Record<string, string> = {
		'publish-scheduled':
			'Publishes entries whose scheduled time has passed, acting as the user who scheduled them. Runs every minute; a tick with nothing due still records a completed job.',
		'session-cleanup':
			'Deletes expired session and token rows, cleans rotated sessions and sweeps the in-memory session store. Runs every five minutes.',
		'process-media':
			'Builds the responsive image ladder (derivative sizes + placeholder) for one upload.',
		'webhook-delivery': 'Delivers one outbound webhook with retries and exponential backoff.',
		'import-data': 'Runs a queued content import (Smart Importer or content package).',
		'bulk-translate': 'Translates the selected entries in batches.'
	};

	function openDetails(job: QueueJob) {
		selectedJob = job;
		detailsOpen = true;
	}

	/** ISO fallback for the native `title` tooltip — locale-independent, so no hydration drift. */
	function isoTitle(value: string | Date | null | undefined): string | undefined {
		if (!value) return undefined;
		const date = typeof value === 'string' ? new Date(value) : value;
		return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
	}

	const pageSize = $derived(data.pagination.limit);
	const currentPage = $derived(Math.floor(data.pagination.offset / Math.max(1, pageSize)) + 1);
	const pagesCount = $derived(Math.max(1, Math.ceil(data.totalCount / Math.max(1, pageSize))));

	async function handleClearCompleted() {
		showConfirm({
			title: 'Clear Completed Jobs',
			body: 'Remove completed jobs from the queue history? Running and failed jobs are kept.',
			onConfirm: async () => {
				isClearing = true;
				try {
					const result = await clearCompleted({});
					if (result.success) {
						toast.success('Completed jobs cleared.');
						await refreshAll();
					}
				} catch (e: unknown) {
					toast.error(
						e instanceof Error ? e.message || String(e) : 'Failed to clear completed jobs.'
					);
				} finally {
					isClearing = false;
				}
			}
		});
	}

	function handleDeleteJob(jobId: string) {
		showConfirm({
			title: 'Delete Job',
			body: 'Are you sure you want to delete this job? This cannot be undone.',
			onConfirm: async () => {
				isDeleting = true;
				try {
					const result = await deleteJob(jobId);
					if (result.success) {
						toast.success('Job deleted.');
						await refreshAll();
					}
				} catch (e: unknown) {
					toast.error(e instanceof Error ? e.message || String(e) : 'Failed to delete job.');
				} finally {
					isDeleting = false;
				}
			}
		});
	}

	const statusBadgeProps: Record<
		string,
		{ variant?: 'primary' | 'error'; preset?: 'tonal'; color?: string }
	> = {
		pending: { preset: 'tonal', color: 'surface' },
		running: { variant: 'primary' },
		completed: { variant: 'primary' },
		failed: { variant: 'error' }
	};

	const statusIcons: Record<string, string> = {
		pending: 'mdi:clock-outline',
		running: 'mdi:loading animate-spin',
		completed: 'mdi:check-circle-outline',
		failed: 'mdi:alert-circle-outline'
	};

	function formatDate(date: string | Date | null | undefined) {
		if (!date) return 'N/A';
		try {
			const d = typeof date === 'string' ? new Date(date) : date;
			return formatRelativeDate(d);
		} catch (_e) {
			return 'Invalid Date';
		}
	}

	function getPaginationUrl(offset: number) {
		const params = new URLSearchParams(page.url.searchParams.toString());
		params.set('offset', offset.toString());
		return `?${params.toString()}`;
	}

	function getFilterUrl(status: string | undefined = undefined) {
		const params = new URLSearchParams(page.url.searchParams.toString());
		if (status) {
			params.set('status', status);
		} else {
			params.delete('status');
		}
		params.set('offset', '0');
		return `?${params.toString()}`;
	}

	function getLimitUrl(limit: number) {
		const params = new URLSearchParams(page.url.searchParams.toString());
		params.set('limit', limit.toString());
		params.set('offset', '0');
		return `?${params.toString()}`;
	}
</script>

<AdminPageShell
	title={queue_title()}
	icon="mdi:tray-full"
	description="Monitor and manage background job processing"
	showBackButton={true}
	backUrl="/config"
	fullHeight
>
	{#snippet actions()}
		<Button
			variant="ghost"
			onclick={() => refreshAll()}
			size="sm"
			leadingIcon="mdi:refresh"
			data-testid="queue-refresh"
			aria-label={queue_refresh_aria()}
		>
			{button_refresh()}
		</Button>
	{/snippet}

	<div data-testid="queue-page" class="contents">
		<!-- First-run orientation: what the queue is, why periodic rows exist, what a row means. -->
		<details
			class="shrink-0 rounded border border-tertiary-500/30 bg-tertiary-500/10 p-4 dark:border-primary-500/30 dark:bg-primary-500/10"
			open
			data-testid="queue-how-it-works"
		>
			<summary class="cursor-pointer text-sm font-semibold text-surface-900 dark:text-surface-100">
				How the queue works
			</summary>
			<div class="mt-3 space-y-2 text-xs text-surface-600 dark:text-surface-400">
				<p>
					Every background task is one row in the <code class="font-mono">svelty_jobs</code> table. A
					poller claims pending rows within 10 seconds, runs the handler and writes the outcome back —
					that is all “completed” means. A tick with nothing to do still records a row (usually 0–5 ms),
					which is why short rows usually mean “nothing to do”, not “work done”.
				</p>
				<ul class="list-disc space-y-1 ps-5">
					<li>
						<strong>publish-scheduled</strong> — every minute: publishes entries whose scheduled time
						has passed.
					</li>
					<li>
						<strong>session-cleanup</strong> — every five minutes: removes expired sessions/tokens and
						sweeps the in-memory session store.
					</li>
					<li>
						<strong>process-media · webhook-delivery · import-data · bulk-translate</strong> — created
						by real work (uploads, webhooks, imports, translations), not by a timer.
					</li>
				</ul>
				<p>
					Click any row for the payload, attempts, timings and last error. Failed jobs retry with
					exponential backoff (3 attempts by default); completed history is pruned after 7 days.
				</p>
			</div>
		</details>

		<div
			class="grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5"
			in:adminFade={{ delay: 100 }}
			data-testid="queue-stats"
		>
			<a
				aria-label={queue_view_all_aria()}
				href={getFilterUrl()}
				class="block no-underline text-inherit"
				data-testid="queue-stat-total"
				data-preload="hover"
			>
				<AdminCard
					class="p-4 border border-(--admin-border-default) bg-(--admin-bg-card,var(--color-surface-50)) dark:bg-surface-900/20 backdrop-blur-md shadow-xs hover:border-tertiary-500 dark:hover:border-primary-500 transition-colors"
				>
					<div class="flex items-center gap-3">
						<div class="p-2 rounded bg-surface-200 dark:bg-surface-700">
							<iconify-icon icon="mdi:format-list-bulleted" class="text-2xl"></iconify-icon>
						</div>
						<div>
							<p class="text-xs opacity-60 uppercase font-bold tracking-wider">{queue_total()}</p>
							<p class="text-2xl font-bold" data-testid="queue-stat-total-value">
								{data.stats.total}
							</p>
						</div>
					</div>
				</AdminCard>
			</a>

			<a
				aria-label={queue_view_pending_aria()}
				href={getFilterUrl('pending')}
				class="block no-underline text-inherit"
				data-testid="queue-stat-pending"
				data-preload="hover"
			>
				<AdminCard
					class="p-4 border border-(--admin-border-default) bg-(--admin-bg-card,var(--color-surface-50)) dark:bg-surface-900/20 backdrop-blur-md shadow-xs hover:border-surface-500 transition-colors"
				>
					<div class="flex items-center gap-3">
						<div class="p-2 rounded bg-surface-500/10 text-surface-600 dark:text-surface-400">
							<iconify-icon icon="mdi:clock-outline" class="text-2xl"></iconify-icon>
						</div>
						<div>
							<p class="text-xs opacity-60 uppercase font-bold tracking-wider">{queue_pending()}</p>
							<p class="text-2xl font-bold">{data.stats.pending}</p>
						</div>
					</div>
				</AdminCard>
			</a>

			<a
				aria-label={queue_view_running_aria()}
				href={getFilterUrl('running')}
				class="block no-underline text-inherit"
				data-testid="queue-stat-running"
				data-preload="hover"
			>
				<AdminCard
					class="p-4 border border-(--admin-border-default) bg-(--admin-bg-card,var(--color-surface-50)) dark:bg-surface-900/20 backdrop-blur-md shadow-xs hover:border-tertiary-500 dark:hover:border-primary-500 transition-colors"
				>
					<div class="flex items-center gap-3">
						<div class="p-2 rounded bg-primary-500/10 text-primary-500 dark:text-primary-400">
							<iconify-icon icon="mdi:loading" class="text-2xl"></iconify-icon>
						</div>
						<div>
							<p class="text-xs opacity-60 uppercase font-bold tracking-wider">{queue_running()}</p>
							<p class="text-2xl font-bold">{data.stats.running}</p>
						</div>
					</div>
				</AdminCard>
			</a>

			<a
				aria-label={queue_view_completed_aria()}
				href={getFilterUrl('completed')}
				class="block no-underline text-inherit"
				data-testid="queue-stat-completed"
				data-preload="hover"
			>
				<AdminCard
					class="p-4 border border-(--admin-border-default) bg-(--admin-bg-card,var(--color-surface-50)) dark:bg-surface-900/20 backdrop-blur-md shadow-xs hover:border-success-500 transition-colors"
				>
					<div class="flex items-center gap-3">
						<div class="p-2 rounded bg-success-500/10 text-success-500 dark:text-success-400">
							<iconify-icon icon="mdi:check-circle-outline" class="text-2xl"></iconify-icon>
						</div>
						<div>
							<p class="text-xs opacity-60 uppercase font-bold tracking-wider">
								{queue_completed()}
							</p>
							<p class="text-2xl font-bold">{data.stats.completed}</p>
						</div>
					</div>
				</AdminCard>
			</a>

			<a
				aria-label={queue_view_failed_aria()}
				href={getFilterUrl('failed')}
				class="block no-underline text-inherit"
				data-testid="queue-stat-failed"
				data-preload="hover"
			>
				<AdminCard
					class="p-4 border border-(--admin-border-default) bg-(--admin-bg-card,var(--color-surface-50)) dark:bg-surface-900/20 backdrop-blur-md shadow-xs hover:border-error-500 transition-colors"
				>
					<div class="flex items-center gap-3">
						<div class="p-2 rounded bg-error-500/10 text-error-500 dark:text-error-400">
							<iconify-icon icon="mdi:alert-circle-outline" class="text-2xl"></iconify-icon>
						</div>
						<div>
							<p class="text-xs opacity-60 uppercase font-bold tracking-wider">{queue_failed()}</p>
							<p class="text-2xl font-bold">{data.stats.failed}</p>
						</div>
					</div>
				</AdminCard>
			</a>
		</div>

		<div class="flex shrink-0 flex-wrap items-center justify-between gap-4">
			<div class="flex items-center gap-2">
				<h2 class="text-lg font-bold">{queue_recent()}</h2>
				{#if page.url.searchParams.has('status')}
					<Badge variant="primary" size="sm" class="uppercase" data-testid="queue-filter-badge">
						{queue_filter()}
						{page.url.searchParams.get('status')}
					</Badge>
					<Button variant="ghost" size="sm" href={getFilterUrl()} data-testid="queue-clear-filter"
						>{queue_clear_filter()}</Button
					>
				{/if}
			</div>

			<div class="flex items-center gap-2">
				<Button
					variant="ghost"
					disabled={isClearing}
					onclick={handleClearCompleted}
					size="sm"
					leadingIcon="mdi:broom"
					data-testid="queue-clear-completed"
				>
					{queue_clear_completed()}
				</Button>
			</div>
		</div>

		<!-- Single scroll container: the shell owns the page, this card fills the rest and
		     SmartTableShell scrolls the body (sticky header + pinned pagination). -->
		<div in:adminFade class="flex min-h-0 flex-1 flex-col">
			<AdminCard
				class="my-2 flex h-full min-h-0 w-full flex-col sm:my-3"
				data-testid="queue-jobs-table"
			>
				<SmartTableShell
					empty={data.jobs.length === 0}
					emptyTitle={queue_empty()}
					emptyDescription="Jobs appear here once a background task is queued."
					emptyIcon="mdi:tray-off"
					showPagination={data.totalCount > 0}
					{currentPage}
					rowsPerPage={pageSize}
					{pagesCount}
					totalItems={data.totalCount}
					rowsPerPageOptions={[10, 25, 50, 100]}
					onUpdatePage={(next) => goto(getPaginationUrl((next - 1) * pageSize))}
					onUpdateRowsPerPage={(rows) => goto(getLimitUrl(rows))}
				>
					<table class={SMART_TABLE}>
						<thead class={SMART_TABLE_THEAD}>
							<tr
								class="border-b border-surface-500/30 text-xs uppercase tracking-wide dark:border-surface-600"
							>
								<th class={SMART_TABLE_TH}>{queue_job_id()}</th>
								<th class={SMART_TABLE_TH}>{queue_task_type()}</th>
								<th class={SMART_TABLE_TH}>{queue_status()}</th>
								<th class={SMART_TABLE_TH}>{queue_attempts()}</th>
								<th class={SMART_TABLE_TH}>{queue_next_run()}</th>
								<th class={SMART_TABLE_TH}>{queue_created()}</th>
								<th class={SMART_TABLE_TH}>{queue_actions()}</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-surface-200/30 dark:divide-surface-700/30">
							{#each data.jobs as job (job._id)}
								<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
								<tr
									class="{SMART_TABLE_ROW_HOVER} cursor-pointer"
									data-testid="queue-job-row"
									onclick={(event) => {
										// Row = mouse shortcut; the eye button below is the accessible trigger.
										if ((event.target as HTMLElement).closest('button, a')) return;
										openDetails(job);
									}}
								>
									<td class={SMART_TABLE_TD}>
										<span
											class="font-mono text-xs text-tertiary-500 dark:text-primary-500"
											title={job._id}>{job._id.slice(0, 8)}...</span
										>
									</td>
									<td class={SMART_TABLE_TD}>
										<span class="font-medium">{job.taskType}</span>
									</td>
									<td class={SMART_TABLE_TD}>
										<div class="flex items-center justify-center gap-2">
											<Badge
												{...statusBadgeProps[job.status]}
												size="sm"
												class="uppercase flex items-center gap-1"
											>
												<iconify-icon icon={statusIcons[job.status]}></iconify-icon>
												{job.status}
											</Badge>
											{#if job.lastError}
												<iconify-icon
													icon="mdi:information-outline"
													class="text-error-500 cursor-help"
													title={job.lastError}
												></iconify-icon>
											{/if}
										</div>
									</td>
									<td class={SMART_TABLE_TD}>
										{job.attempts} / {job.maxAttempts}
									</td>
									<td class={SMART_TABLE_TD}>
										{formatDate(job.nextRunAt)}
									</td>
									<td class="{SMART_TABLE_TD} text-(--admin-text-muted)">
										{formatDate(job.createdAt)}
									</td>
									<td class={SMART_TABLE_TD}>
										<div class="flex items-center justify-center gap-1">
											<Button
												variant="ghost"
												title="Job details"
												onclick={() => openDetails(job)}
												size="sm"
												data-testid="queue-job-details"
												aria-label={`Job details for ${job.taskType} ${job._id}`}
											>
												<iconify-icon icon="mdi:eye-outline"></iconify-icon>
											</Button>

											{#if job.status === 'failed'}
												<Button
													variant="primary"
													title={queue_retry_title()}
													disabled={isRetrying}
													onclick={async () => {
														isRetrying = true;
														try {
															const result = await retryJob(job._id);
															if (result.success) {
																toast.success('Job rescheduled.');
																await refreshAll();
															}
														} catch (e: unknown) {
															toast.error(
																e instanceof Error ? e.message || String(e) : 'Failed to retry job.'
															);
														} finally {
															isRetrying = false;
														}
													}}
													size="sm"
												>
													<iconify-icon icon="mdi:replay"></iconify-icon>
												</Button>
											{/if}

											<Button
												variant="error"
												title={queue_delete_title()}
												disabled={isDeleting}
												onclick={() => handleDeleteJob(job._id)}
												size="sm"
												data-testid="queue-job-delete"
												aria-label={queue_delete_aria({ id: job._id })}
											>
												<iconify-icon icon="mdi:trash-can-outline"></iconify-icon>
											</Button>
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</SmartTableShell>
			</AdminCard>
		</div>
	</div>

	<!-- Row details: what the task type does, the raw payload and the last error. -->
	<Modal
		bind:open={detailsOpen}
		title="Job details"
		size="lg"
		data-testid="queue-job-details-modal"
	>
		{#if selectedJob}
			<div class="space-y-5">
				<div class="flex flex-wrap items-center gap-2">
					<Badge
						{...statusBadgeProps[selectedJob.status]}
						size="sm"
						class="uppercase flex items-center gap-1"
					>
						<iconify-icon icon={statusIcons[selectedJob.status]}></iconify-icon>
						{selectedJob.status}
					</Badge>
					<span class="font-mono text-sm">{selectedJob.taskType}</span>
				</div>

				<p class="text-xs text-surface-500">
					{taskDescriptions[selectedJob.taskType] ??
						'A job dispatched by a plugin. The payload below is what the handler received.'}
				</p>

				<dl class="grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[9rem_1fr]">
					<dt class="text-surface-500">Job ID</dt>
					<dd class="font-mono text-xs break-all">{selectedJob._id}</dd>
					<dt class="text-surface-500">Attempts</dt>
					<dd>{selectedJob.attempts} / {selectedJob.maxAttempts}</dd>
					<dt class="text-surface-500">Created</dt>
					<dd title={isoTitle(selectedJob.createdAt)}>{formatDate(selectedJob.createdAt)}</dd>
					<dt class="text-surface-500">Last update</dt>
					<dd title={isoTitle(selectedJob.updatedAt)}>{formatDate(selectedJob.updatedAt)}</dd>
					<dt class="text-surface-500">Next run</dt>
					<dd title={isoTitle(selectedJob.nextRunAt)}>{formatDate(selectedJob.nextRunAt)}</dd>
					{#if selectedJob.tenantId}
						<dt class="text-surface-500">Tenant</dt>
						<dd class="font-mono text-xs">{selectedJob.tenantId}</dd>
					{/if}
				</dl>

				{#if selectedJob.lastError}
					<div class="space-y-1">
						<h4 class="text-xs font-semibold uppercase tracking-wide text-error-500">Last error</h4>
						<pre
							class="overflow-x-auto whitespace-pre-wrap rounded-lg border border-error-500/30 bg-error-500/10 p-3 font-mono text-xs text-error-500">{selectedJob.lastError}</pre>
					</div>
				{/if}

				<div class="space-y-1">
					<h4 class="text-xs font-semibold uppercase tracking-wide text-surface-500">Payload</h4>
					<pre
						class="max-h-64 overflow-auto rounded-lg border border-surface-500/30 bg-surface-900 p-3 font-mono text-xs text-surface-100">{JSON.stringify(
							selectedJob.payload ?? {},
							null,
							2
						)}</pre>
				</div>
			</div>
		{/if}

		{#snippet footer()}
			<div class="flex justify-end">
				<Button variant="secondary" onclick={() => (detailsOpen = false)}>Close</Button>
			</div>
		{/snippet}
	</Modal>
</AdminPageShell>
