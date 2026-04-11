<!--
@file src/routes/(app)/config/queue/+page.svelte
@description Queue Observability Dashboard UI.
-->

<script lang="ts">
import { enhance } from "$app/forms";
import { invalidateAll } from "$app/navigation";
import { page } from "$app/stores";
import PageTitle from "@src/components/page-title.svelte";
import { toast } from "@src/stores/toast.svelte.ts";
import { formatDistanceToNow } from "date-fns";

let { data } = $props();

let isRetrying = $state(false);
let isDeleting = $state(false);
let isClearing = $state(false);

const statusColors: Record<string, string> = {
	pending: "preset-tonal-surface",
	running: "preset-filled-primary-500",
	completed: "preset-filled-success-500",
	failed: "preset-filled-error-500",
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
		return formatDistanceToNow(d, { addSuffix: true });
	} catch (_e) {
		return "Invalid Date";
	}
}

function getPaginationUrl(offset: number) {
	const params = new URLSearchParams($page.url.searchParams);
	params.set("offset", offset.toString());
	return `?${params.toString()}`;
}

function getFilterUrl(status?: string) {
	const params = new URLSearchParams($page.url.searchParams);
	if (status) {
		params.set("status", status);
	} else {
		params.delete("status");
	}
	params.set("offset", "0"); // Reset to first page
	return `?${params.toString()}`;
}
</script>

<PageTitle name="Background Queue" icon="mdi:queue-play-next" showBackButton={true} backUrl="/config" />

<div class="wrapper p-4 space-y-6">
	<!-- Statistics Cards -->
	<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
		<a href={getFilterUrl()} class="card p-4 bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 hover:border-primary-500 transition-colors">
			<div class="flex items-center gap-3">
				<div class="p-2 rounded-lg bg-surface-200 dark:bg-surface-700">
					<iconify-icon icon="mdi:format-list-bulleted" class="text-2xl"></iconify-icon>
				</div>
				<div>
					<p class="text-xs opacity-60 uppercase font-bold tracking-wider">Total</p>
					<p class="text-2xl font-bold">{data.stats.total}</p>
				</div>
			</div>
		</a>

		<a href={getFilterUrl('pending')} class="card p-4 bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 hover:border-surface-500 transition-colors">
			<div class="flex items-center gap-3">
				<div class="p-2 rounded-lg preset-tonal-surface">
					<iconify-icon icon="mdi:clock-outline" class="text-2xl"></iconify-icon>
				</div>
				<div>
					<p class="text-xs opacity-60 uppercase font-bold tracking-wider">Pending</p>
					<p class="text-2xl font-bold">{data.stats.pending}</p>
				</div>
			</div>
		</a>

		<a href={getFilterUrl('running')} class="card p-4 bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 hover:border-primary-500 transition-colors">
			<div class="flex items-center gap-3">
				<div class="p-2 rounded-lg preset-tonal-primary">
					<iconify-icon icon="mdi:loading" class="text-2xl"></iconify-icon>
				</div>
				<div>
					<p class="text-xs opacity-60 uppercase font-bold tracking-wider">Running</p>
					<p class="text-2xl font-bold">{data.stats.running}</p>
				</div>
			</div>
		</a>

		<a href={getFilterUrl('completed')} class="card p-4 bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 hover:border-success-500 transition-colors">
			<div class="flex items-center gap-3">
				<div class="p-2 rounded-lg preset-tonal-success">
					<iconify-icon icon="mdi:check-circle-outline" class="text-2xl"></iconify-icon>
				</div>
				<div>
					<p class="text-xs opacity-60 uppercase font-bold tracking-wider">Completed</p>
					<p class="text-2xl font-bold">{data.stats.completed}</p>
				</div>
			</div>
		</a>

		<a href={getFilterUrl('failed')} class="card p-4 bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 hover:border-error-500 transition-colors">
			<div class="flex items-center gap-3">
				<div class="p-2 rounded-lg preset-tonal-error">
					<iconify-icon icon="mdi:alert-circle-outline" class="text-2xl"></iconify-icon>
				</div>
				<div>
					<p class="text-xs opacity-60 uppercase font-bold tracking-wider">Failed</p>
					<p class="text-2xl font-bold">{data.stats.failed}</p>
				</div>
			</div>
		</a>
	</div>

	<!-- Actions Bar -->
	<div class="flex flex-wrap items-center justify-between gap-4">
		<div class="flex items-center gap-2">
			<h2 class="h3 font-bold">Recent Jobs</h2>
			{#if $page.url.searchParams.has('status')}
				<span class="badge preset-filled-primary-500 uppercase text-[10px]">
					Filter: {$page.url.searchParams.get('status')}
				</span>
				<a href={getFilterUrl()} class="btn btn-sm variant-ghost-surface">Clear Filter</a>
			{/if}
		</div>

		<div class="flex items-center gap-2">
			<form method="POST" action="?/clearCompleted" use:enhance={() => {
				isClearing = true;
				return async ({ result }) => {
					isClearing = false;
					if (result.type === 'success') {
						toast.success('Completed jobs cleared.');
						invalidateAll();
					}
				};
			}}>
				<button class="btn btn-sm variant-ghost-surface" disabled={isClearing}>
					<iconify-icon icon="mdi:broom"></iconify-icon>
					<span>Clear Completed</span>
				</button>
			</form>

			<button class="btn btn-sm variant-ghost-primary" onclick={() => invalidateAll()}>
				<iconify-icon icon="mdi:refresh"></iconify-icon>
				<span>Refresh</span>
			</button>
		</div>
	</div>

	<!-- Jobs Table -->
	<div class="card bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 overflow-hidden">
		<div class="overflow-x-auto">
			<table class="table table-hover w-full whitespace-nowrap">
				<thead>
					<tr class="bg-surface-200 dark:bg-surface-900">
						<th class="p-3 text-left">Job ID</th>
						<th class="p-3 text-left">Task Type</th>
						<th class="p-3 text-left">Status</th>
						<th class="p-3 text-left">Attempts</th>
						<th class="p-3 text-left">Next Run</th>
						<th class="p-3 text-left">Created</th>
						<th class="p-3 text-right">Actions</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-surface-200 dark:divide-surface-700">
					{#each data.jobs as job (job._id)}
						<tr>
							<td class="p-3">
								<span class="font-mono text-xs opacity-60" title={job._id}>{job._id.slice(0, 8)}...</span>
							</td>
							<td class="p-3">
								<span class="font-medium">{job.taskType}</span>
							</td>
							<td class="p-3">
								<div class="flex items-center gap-2">
									<span class="badge {statusColors[job.status]} text-[10px] uppercase flex items-center gap-1">
										<iconify-icon icon={statusIcons[job.status]}></iconify-icon>
										{job.status}
									</span>
									{#if job.lastError}
										<iconify-icon
											icon="mdi:information-outline"
											class="text-error-500 cursor-help"
											title={job.lastError}
										></iconify-icon>
									{/if}
								</div>
							</td>
							<td class="p-3">
								<span class="text-sm">{job.attempts} / {job.maxAttempts}</span>
							</td>
							<td class="p-3 text-sm">
								{formatDate(job.nextRunAt)}
							</td>
							<td class="p-3 text-sm">
								{formatDate(job.createdAt)}
							</td>
							<td class="p-3 text-right">
								<div class="flex items-center justify-end gap-1">
									{#if job.status === 'failed'}
										<form method="POST" action="?/retryJob" use:enhance={() => {
											isRetrying = true;
											return async ({ result }) => {
												isRetrying = false;
												if (result.type === 'success') {
													toast.success('Job rescheduled.');
													invalidateAll();
												}
											};
										}}>
											<input type="hidden" name="jobId" value={job._id} />
											<button class="btn btn-sm variant-soft-primary" title="Retry Job" disabled={isRetrying}>
												<iconify-icon icon="mdi:replay"></iconify-icon>
											</button>
										</form>
									{/if}

									<form method="POST" action="?/deleteJob" use:enhance={() => {
										if (!confirm('Are you sure you want to delete this job?')) return;
										isDeleting = true;
										return async ({ result }) => {
											isDeleting = false;
											if (result.type === 'success') {
												toast.success('Job deleted.');
												invalidateAll();
											}
										};
									}}>
										<input type="hidden" name="jobId" value={job._id} />
										<button class="btn btn-sm variant-soft-error" title="Delete Job" disabled={isDeleting}>
											<iconify-icon icon="mdi:trash-can-outline"></iconify-icon>
										</button>
									</form>
								</div>
							</td>
						</tr>
					{:else}
						<tr>
							<td colspan="7" class="p-12 text-center opacity-40">
								<iconify-icon icon="mdi:tray-off" class="text-4xl mb-2"></iconify-icon>
								<p>No jobs found matching the current filters.</p>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<!-- Pagination -->
		{#if data.totalCount > data.pagination.limit}
			<div class="p-4 bg-surface-50 dark:bg-surface-900 border-t border-surface-200 dark:border-surface-700 flex items-center justify-between">
				<p class="text-xs opacity-60">
					Showing {data.pagination.offset + 1} to {Math.min(data.pagination.offset + data.pagination.limit, data.totalCount)} of {data.totalCount} jobs
				</p>
				<div class="flex gap-2">
					<a
						href={getPaginationUrl(Math.max(0, data.pagination.offset - data.pagination.limit))}
						class="btn btn-sm variant-ghost-surface"
						class:disabled={data.pagination.offset === 0}
					>
						Previous
					</a>
					<a
						href={getPaginationUrl(data.pagination.offset + data.pagination.limit)}
						class="btn btn-sm variant-ghost-surface"
						class:disabled={data.pagination.offset + data.pagination.limit >= data.totalCount}
					>
						Next
					</a>
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	.wrapper {
		max-width: 1200px;
		margin: 0 auto;
	}

	.disabled {
		pointer-events: none;
		opacity: 0.5;
	}
</style>
