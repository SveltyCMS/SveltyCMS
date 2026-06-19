<!--
@file src/routes/(app)/config/queue/+page.svelte
@description Queue Observability Dashboard UI.
-->

<script lang="ts">
import { invalidateAll } from "$app/navigation";
import { page } from "$app/state";
import { clearCompleted, deleteJob, retryJob } from "./queue.remote";
import { toast } from "@src/stores/toast.svelte.ts";
import { formatRelativeDate } from "@utils/date";
import { fade, fly } from "svelte/transition";
	import Badge from '@components/ui/badge.svelte';
	import Button from '@components/ui/button.svelte';
	import AdminPageShell from '@components/admin-page-shell.svelte';
	import AdminCard from '@components/admin-card.svelte';

let { data } = $props();

let isRetrying = $state(false);
let isDeleting = $state(false);
let isClearing = $state(false);

const statusBadgeProps: Record<string, { variant?: 'primary' | 'error'; preset?: 'tonal'; color?: string }> = {
	pending: { preset: 'tonal', color: 'surface' },
	running: { variant: 'primary' },
	completed: { variant: 'primary' },
	failed: { variant: 'error' },
};

const statusIcons: Record<string, string> = {
	pending: "mdi:clock-outline",
	running: "mdi:loading animate-spin",
	completed: "mdi:check-circle-outline",
	failed: "mdi:alert-circle-outline",
};

function formatDate(date: string | Date | undefined) {
	if (!date) return "N/A";
	try {
		const d = typeof date === "string" ? new Date(date) : date;
		return formatRelativeDate(d);
	} catch (_e) {
		return "Invalid Date";
	}
}

function getPaginationUrl(offset: number) {
	const params = new URLSearchParams(page.url.searchParams);
	params.set("offset", offset.toString());
	return `?${params.toString()}`;
}

function getFilterUrl(status?: string) {
	const params = new URLSearchParams(page.url.searchParams);
	if (status) {
		params.set("status", status);
	} else {
		params.delete("status");
	}
	params.set("offset", "0");
	return `?${params.toString()}`;
}
</script>

<AdminPageShell
		title="Background Queue"
		icon="mdi:tray-full"
		description="Monitor and manage background job processing"
		showBackButton={true}
		backUrl="/config"
	>
	{#snippet actions()}
		<Button variant="ghost" onclick={() => invalidateAll()} size="sm" leadingIcon="mdi:refresh">
			Refresh
		</Button>
	{/snippet}

	<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4" in:fly={{ y: 20, delay: 100 }}>
		<a href={getFilterUrl()} class="block no-underline text-inherit">
			<AdminCard class="p-4 border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900/40 backdrop-blur-md shadow-xs hover:border-tertiary-500 dark:hover:border-primary-500 transition-colors">
				<div class="flex items-center gap-3">
					<div class="p-2 rounded bg-surface-200 dark:bg-surface-700">
						<iconify-icon icon="mdi:format-list-bulleted" class="text-2xl"></iconify-icon>
					</div>
					<div>
						<p class="text-xs opacity-60 uppercase font-bold tracking-wider">Total</p>
						<p class="text-2xl font-bold">{data.stats.total}</p>
					</div>
				</div>
			</AdminCard>
		</a>

		<a href={getFilterUrl('pending')} class="block no-underline text-inherit">
			<AdminCard class="p-4 border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900/40 backdrop-blur-md shadow-xs hover:border-surface-500 transition-colors">
				<div class="flex items-center gap-3">
					<div class="p-2 rounded preset-tonal-surface">
						<iconify-icon icon="mdi:clock-outline" class="text-2xl"></iconify-icon>
					</div>
					<div>
						<p class="text-xs opacity-60 uppercase font-bold tracking-wider">Pending</p>
						<p class="text-2xl font-bold">{data.stats.pending}</p>
					</div>
				</div>
			</AdminCard>
		</a>

		<a href={getFilterUrl('running')} class="block no-underline text-inherit">
			<AdminCard class="p-4 border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900/40 backdrop-blur-md shadow-xs hover:border-tertiary-500 dark:hover:border-primary-500 transition-colors">
				<div class="flex items-center gap-3">
					<div class="p-2 rounded preset-tonal-primary">
						<iconify-icon icon="mdi:loading" class="text-2xl"></iconify-icon>
					</div>
					<div>
						<p class="text-xs opacity-60 uppercase font-bold tracking-wider">Running</p>
						<p class="text-2xl font-bold">{data.stats.running}</p>
					</div>
				</div>
			</AdminCard>
		</a>

		<a href={getFilterUrl('completed')} class="block no-underline text-inherit">
			<AdminCard class="p-4 border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900/40 backdrop-blur-md shadow-xs hover:border-success-500 transition-colors">
				<div class="flex items-center gap-3">
					<div class="p-2 rounded preset-tonal-success">
						<iconify-icon icon="mdi:check-circle-outline" class="text-2xl"></iconify-icon>
					</div>
					<div>
						<p class="text-xs opacity-60 uppercase font-bold tracking-wider">Completed</p>
						<p class="text-2xl font-bold">{data.stats.completed}</p>
					</div>
				</div>
			</AdminCard>
		</a>

		<a href={getFilterUrl('failed')} class="block no-underline text-inherit">
			<AdminCard class="p-4 border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900/40 backdrop-blur-md shadow-xs hover:border-error-500 transition-colors">
				<div class="flex items-center gap-3">
					<div class="p-2 rounded preset-tonal-error">
						<iconify-icon icon="mdi:alert-circle-outline" class="text-2xl"></iconify-icon>
					</div>
					<div>
						<p class="text-xs opacity-60 uppercase font-bold tracking-wider">Failed</p>
						<p class="text-2xl font-bold">{data.stats.failed}</p>
					</div>
				</div>
			</AdminCard>
		</a>
	</div>

	<div class="flex flex-wrap items-center justify-between gap-4">
		<div class="flex items-center gap-2">
			<h2 class="text-lg font-bold">Recent Jobs</h2>
			{#if page.url.searchParams.has('status')}
				<Badge variant="primary" size="sm" class="uppercase">
					Filter: {page.url.searchParams.get('status')}
				</Badge>
				<Button variant="ghost" size="sm" href={getFilterUrl()}>Clear Filter</Button>
			{/if}
		</div>

		<div class="flex items-center gap-2">
			<Button variant="ghost" disabled={isClearing} onclick={async () => {
				isClearing = true;
				try {
					const result = await clearCompleted({});
					if (result.success) {
						toast.success('Completed jobs cleared.');
						invalidateAll();
					}
				} catch (e: unknown) {
					toast.error(e instanceof Error ? e.message || String(e) : 'Failed to clear completed jobs.');
				} finally {
					isClearing = false;
				}
			}} size="sm" leadingIcon="mdi:broom">
				Clear Completed
			</Button>
		</div>
	</div>

	<div in:fade>
	<AdminCard
		class="p-0 border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900/40 backdrop-blur-md shadow-xs overflow-hidden"
	>
		<div class="overflow-x-auto w-full">
			<table class="w-full text-sm border-collapse whitespace-nowrap">
				<thead>
					<tr class="border-b border-surface-200 dark:border-surface-800 text-left text-xs uppercase tracking-wider text-surface-400">
						<th class="px-4 py-3 font-semibold">Job ID</th>
						<th class="px-4 py-3 font-semibold">Task Type</th>
						<th class="px-4 py-3 font-semibold">Status</th>
						<th class="px-4 py-3 font-semibold">Attempts</th>
						<th class="px-4 py-3 font-semibold">Next Run</th>
						<th class="px-4 py-3 font-semibold">Created</th>
						<th class="px-4 py-3 font-semibold text-right">Actions</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-surface-100 dark:divide-surface-800/60">
					{#each data.jobs as job (job._id)}
						<tr class="text-surface-700 dark:text-surface-200 hover:bg-surface-50/40 dark:hover:bg-surface-900/30">
							<td class="px-4 py-3">
								<span class="font-mono text-xs opacity-60" title={job._id}>{job._id.slice(0, 8)}...</span>
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
							<td class="px-4 py-3">
								<span class="text-sm">{job.attempts} / {job.maxAttempts}</span>
							</td>
							<td class="px-4 py-3 text-sm">
								{formatDate(job.nextRunAt)}
							</td>
							<td class="px-4 py-3 text-sm">
								{formatDate(job.createdAt)}
							</td>
							<td class="px-4 py-3 text-right">
								<div class="flex items-center justify-end gap-1">
									{#if job.status === 'failed'}
										<Button variant="primary" title="Retry Job" disabled={isRetrying} onclick={async () => {
											isRetrying = true;
											try {
												const result = await retryJob(job._id);
												if (result.success) {
													toast.success('Job rescheduled.');
													invalidateAll();
												}
											} catch (e: unknown) {
												toast.error(e instanceof Error ? e.message || String(e) : 'Failed to retry job.');
											} finally {
												isRetrying = false;
											}
										}} size="sm">
											<iconify-icon icon="mdi:replay"></iconify-icon>
										</Button>
									{/if}

									<Button variant="error" title="Delete Job" disabled={isDeleting} onclick={async () => {
										if (!confirm('Are you sure you want to delete this job?')) return;
										isDeleting = true;
										try {
											const result = await deleteJob(job._id);
											if (result.success) {
												toast.success('Job deleted.');
												invalidateAll();
											}
										} catch (e: unknown) {
											toast.error(e instanceof Error ? e.message || String(e) : 'Failed to delete job.');
										} finally {
											isDeleting = false;
										}
									}} size="sm">
										<iconify-icon icon="mdi:trash-can-outline"></iconify-icon>
									</Button>
								</div>
							</td>
						</tr>
					{:else}
						<tr>
							<td colspan="7" class="px-4 py-12 text-center opacity-40">
								<iconify-icon icon="mdi:tray-off" class="text-4xl mb-2"></iconify-icon>
								<p>No jobs found matching the current filters.</p>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		{#if data.totalCount > data.pagination.limit}
			<div class="p-4 bg-surface-50 dark:bg-surface-900 border-t border-surface-200 dark:border-surface-700 flex items-center justify-between">
				<p class="text-xs opacity-60">
					Showing {data.pagination.offset + 1} to {Math.min(data.pagination.offset + data.pagination.limit, data.totalCount)} of {data.totalCount} jobs
				</p>
				<div class="flex gap-2">
					<Button
						variant="ghost"
						size="sm"
						href={getPaginationUrl(Math.max(0, data.pagination.offset - data.pagination.limit))}
						disabled={data.pagination.offset === 0}
					>
						Previous
					</Button>
					<Button
						variant="ghost"
						size="sm"
						href={getPaginationUrl(data.pagination.offset + data.pagination.limit)}
						disabled={data.pagination.offset + data.pagination.limit >= data.totalCount}
					>
						Next
					</Button>
				</div>
			</div>
		{/if}
	</AdminCard>
	</div>
</AdminPageShell>
