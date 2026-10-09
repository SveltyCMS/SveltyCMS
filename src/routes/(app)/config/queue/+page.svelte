<!--
@file src/routes/(app)/config/queue/+page.svelte
@description Queue Observability Dashboard UI.
-->

<script lang="ts">
	import { refreshAll } from '$app/navigation';
	import { page } from '$app/state';
	import { clearCompleted, deleteJob, retryJob } from './queue.remote';
	import { toast } from '@src/stores/toast.svelte.ts';
	import { showConfirm } from '@utils/modal.svelte';
	import { formatRelativeDate } from '@utils/date';
	import { fade, fly } from 'svelte/transition';
	import Badge from '@components/ui/badge.svelte';
	import Button from '@components/ui/button.svelte';
	import AdminPageShell from '@components/admin-page-shell.svelte';
	import AdminCard from '@components/admin-card.svelte';
	import {
		button_next,
		button_previous,
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
		queue_showing_part1,
		queue_showing_part2,
		queue_showing_part3,
		queue_showing_jobs,
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

	let isRetrying = $state(false);
	let isDeleting = $state(false);
	let isClearing = $state(false);

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

	function formatDate(date: string | Date | undefined) {
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
</script>

<AdminPageShell
	title={queue_title()}
	icon="mdi:tray-full"
	description="Monitor and manage background job processing"
	showBackButton={true}
	backUrl="/config"
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
		<div
			class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4"
			in:fly={{ y: 20, delay: 100 }}
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
					class="p-4 border border-surface-500/30 dark:border-surface-500/40 bg-white dark:bg-surface-900/20 backdrop-blur-md shadow-xs hover:border-tertiary-500 dark:hover:border-primary-500 transition-colors"
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
					class="p-4 border border-surface-500/30 dark:border-surface-500/40 bg-white dark:bg-surface-900/20 backdrop-blur-md shadow-xs hover:border-surface-500 transition-colors"
				>
					<div class="flex items-center gap-3">
						<div class="p-2 rounded preset-tonal-surface">
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
					class="p-4 border border-surface-500/30 dark:border-surface-500/40 bg-white dark:bg-surface-900/20 backdrop-blur-md shadow-xs hover:border-tertiary-500 dark:hover:border-primary-500 transition-colors"
				>
					<div class="flex items-center gap-3">
						<div class="p-2 rounded preset-tonal-primary">
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
					class="p-4 border border-surface-500/30 dark:border-surface-500/40 bg-white dark:bg-surface-900/20 backdrop-blur-md shadow-xs hover:border-success-500 transition-colors"
				>
					<div class="flex items-center gap-3">
						<div class="p-2 rounded preset-tonal-success">
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
					class="p-4 border border-surface-500/30 dark:border-surface-500/40 bg-white dark:bg-surface-900/20 backdrop-blur-md shadow-xs hover:border-error-500 transition-colors"
				>
					<div class="flex items-center gap-3">
						<div class="p-2 rounded preset-tonal-error">
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

		<div class="flex flex-wrap items-center justify-between gap-4">
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

		<div in:fade>
			<AdminCard
				class="p-0 border border-surface-500/30 dark:border-surface-500/40 bg-white dark:bg-surface-900/20 backdrop-blur-md shadow-xs overflow-hidden"
				data-testid="queue-jobs-table"
			>
				<div class="overflow-x-auto w-full">
					<table class="w-full text-sm border-collapse whitespace-nowrap">
						<thead>
							<tr
								class="border-b border-surface-500/30 dark:border-surface-500/40 text-start text-xs uppercase tracking-wider text-surface-400"
							>
								<th class="px-4 py-3 font-semibold">{queue_job_id()}</th>
								<th class="px-4 py-3 font-semibold">{queue_task_type()}</th>
								<th class="px-4 py-3 font-semibold">{queue_status()}</th>
								<th class="px-4 py-3 font-semibold">{queue_attempts()}</th>
								<th class="px-4 py-3 font-semibold">{queue_next_run()}</th>
								<th class="px-4 py-3 font-semibold">{queue_created()}</th>
								<th class="px-4 py-3 font-semibold text-end">{queue_actions()}</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-surface-100 dark:divide-surface-800/60">
							{#each data.jobs as job (job._id)}
								<tr
									class="text-surface-600 dark:text-surface-400 hover:bg-surface-500/40 dark:hover:bg-surface-900/20"
								>
									<td class="px-4 py-3">
										<span class="font-mono text-xs opacity-60" title={job._id}
											>{job._id.slice(0, 8)}...</span
										>
									</td>
									<td class="px-4 py-3">
										<span class="font-medium">{job.taskType}</span>
									</td>
									<td class="px-4 py-3">
										<div class="flex items-center gap-2">
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
									<td class="px-4 py-3 text-sm">
										{job.attempts} / {job.maxAttempts}
									</td>
									<td class="px-4 py-3 text-sm">
										{formatDate(job.nextRunAt)}
									</td>
									<td class="px-4 py-3 text-surface-500 dark:text-surface-400 text-xs">
										{formatDate(job.createdAt)}
									</td>
									<td class="px-4 py-3 text-end">
										<div class="flex items-center justify-end gap-1">
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
							{:else}
								<tr>
									<td
										colspan="7"
										class="px-4 py-12 text-center opacity-40"
										data-testid="queue-empty"
									>
										<iconify-icon icon="mdi:tray-off" class="text-4xl mb-2"></iconify-icon>
										<p>{queue_empty()}</p>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>

				{#if data.totalCount > data.pagination.limit}
					<div
						class="p-4 bg-surface-500/10 dark:bg-surface-900 border-t border-surface-500/30 dark:border-surface-500/40 flex items-center justify-between"
					>
						<p class="text-xs opacity-60">
							{queue_showing_part1()}
							{data.pagination.offset + 1}
							{queue_showing_part2()}{' '}
							{Math.min(data.pagination.offset + data.pagination.limit, data.totalCount)}{' '}
							{queue_showing_part3()}
							{data.totalCount}
							{queue_showing_jobs()}
						</p>
						<div class="flex gap-2">
							<Button
								variant="ghost"
								size="sm"
								href={getPaginationUrl(Math.max(0, data.pagination.offset - data.pagination.limit))}
								disabled={data.pagination.offset === 0}
							>
								{button_previous()}
							</Button>
							<Button
								variant="ghost"
								size="sm"
								href={getPaginationUrl(data.pagination.offset + data.pagination.limit)}
								disabled={data.pagination.offset + data.pagination.limit >= data.totalCount}
							>
								{button_next()}
							</Button>
						</div>
					</div>
				{/if}
			</AdminCard>
		</div>
	</div>
</AdminPageShell>
