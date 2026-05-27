<!--
@files src/routes/(app)/config/automations/+page.svelte
@component
**Automation Flows — List Page**
Displays all configured automation flows with status badges, trigger info,
and CRUD actions. Enterprise-grade workflow management GUI.

### Features
- Grid view of all automation flows
- Create / Edit / Delete / Duplicate / Toggle / Test actions
- Real-time status badges (active, paused, errored)
- Last triggered timestamp and execution count
-->

<script lang="ts">
	import PageTitle from '@src/components/page-title.svelte';
	import type { AutomationFlow } from '@src/services/automation/types';
	import { AUTOMATION_EVENTS, OPERATION_TYPES } from '@src/services/automation/types';
	import { toast } from '@src/stores/toast.svelte.ts';
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import { goto } from '$app/navigation';

	let flows: AutomationFlow[] = $state([]);
	let isLoading = $state(true);
	let searchQuery = $state('');
	let selectedIds = $state<string[]>([]);

	let filteredFlows = $derived(
		flows.filter((f) => f.name.toLowerCase().includes(searchQuery.toLowerCase()) || f.description?.toLowerCase().includes(searchQuery.toLowerCase()))
	);

	let allSelected = $derived(filteredFlows.length > 0 && selectedIds.length === filteredFlows.length);
	let someSelected = $derived(selectedIds.length > 0 && !allSelected);

	async function loadFlows() {
		isLoading = true;
		try {
			const res = await fetch('/api/automations');
			const result = await res.json();
			if (result.success) {
				flows = result.data;
			} else {
				toast.error(result.error || 'Failed to load automations');
			}
		} catch (_err) {
			toast.error('Error loading automations');
		} finally {
			isLoading = false;
		}
	}

	async function toggleFlow(flow: AutomationFlow) {
		try {
			const res = await fetch(`/api/automations/${flow.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ active: !flow.active })
			});
			const result = await res.json();
			if (result.success) {
				flow.active = !flow.active;
				toast.success(`${flow.name} ${flow.active ? 'activated' : 'paused'}`);
			}
		} catch (_err) {
			toast.error('Failed to toggle automation');
		}
	}

	async function deleteFlow(flow: AutomationFlow) {
		if (!confirm(`Delete "${flow.name}"? This cannot be undone.`)) {
			return;
		}

		try {
			const res = await fetch(`/api/automations/${flow.id}`, {
				method: 'DELETE'
			});
			const result = await res.json();
			if (result.success) {
				flows = flows.filter((f) => f.id !== flow.id);
				toast.success('Automation deleted');
			}
		} catch (_err) {
			toast.error('Failed to delete automation');
		}
	}

	async function duplicateFlow(flow: AutomationFlow) {
		try {
			const res = await fetch('/api/automations', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: `${flow.name} (Copy)`,
					description: flow.description,
					active: false,
					trigger: flow.trigger,
					operations: flow.operations
				})
			});
			const result = await res.json();
			if (result.success) {
				flows = [...flows, result.data];
				toast.success('Automation duplicated');
			}
		} catch (_err) {
			toast.error('Failed to duplicate');
		}
	}

	async function bulkToggle(active: boolean) {
		if (selectedIds.length === 0) return;
		const count = selectedIds.length;
		toast.info(`Updating ${count} automations...`);

		try {
			await Promise.all(
				selectedIds.map((id) =>
					fetch(`/api/automations/${id}`, {
						method: 'PATCH',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ active })
					})
				)
			);
			flows = flows.map((f) => (selectedIds.includes(f.id) ? { ...f, active } : f));
			toast.success(`${count} automations ${active ? 'activated' : 'paused'}`);
			selectedIds = [];
		} catch (_err) {
			toast.error('Failed to update some automations');
		}
	}

	async function bulkDelete() {
		if (selectedIds.length === 0) return;
		if (!confirm(`Delete ${selectedIds.length} automations? This cannot be undone.`)) return;

		const count = selectedIds.length;
		try {
			await Promise.all(
				selectedIds.map((id) =>
					fetch(`/api/automations/${id}`, {
						method: 'DELETE'
					})
				)
			);
			flows = flows.filter((f) => !selectedIds.includes(f.id));
			toast.success(`${count} automations deleted`);
			selectedIds = [];
		} catch (_err) {
			toast.error('Failed to delete some automations');
		}
	}

	function toggleSelectAll() {
		if (allSelected) {
			selectedIds = [];
		} else {
			selectedIds = filteredFlows.map((f) => f.id);
		}
	}

	function toggleSelect(id: string) {
		if (selectedIds.includes(id)) {
			selectedIds = selectedIds.filter((i) => i !== id);
		} else {
			selectedIds = [...selectedIds, id];
		}
	}

	async function testFlow(flow: AutomationFlow) {
		toast.info(`Testing "${flow.name}"...`);
		try {
			const res = await fetch(`/api/automations/${flow.id}/test`, {
				method: 'POST'
			});
			const result = await res.json();
			if (result.success) {
				const s = result.data;
				toast[s.status === 'success' ? 'success' : 'warning'](`Test ${s.status}: ${s.operationResults.length} operations in ${s.duration}ms`);
			} else {
				toast.error(result.error || 'Test failed');
			}
		} catch (_err) {
			toast.error('Test execution error');
		}
	}

	function createNew() {
		goto('/config/automations/new');
	}

	function editFlow(flow: AutomationFlow) {
		goto(`/config/automations/${flow.id}`);
	}

	function getTriggerLabel(flow: AutomationFlow): string {
		if (flow.trigger.type === 'event') {
			const events = flow.trigger.events || [];
			if (events.length === 0) {
				return 'No events';
			}
			if (events.length === 1) {
				const meta = AUTOMATION_EVENTS.find((e) => e.event === events[0]);
				return meta?.label || events[0];
			}
			return `${events.length} events`;
		}
		if (flow.trigger.type === 'schedule') {
			return flow.trigger.cronLabel || flow.trigger.cron || 'Schedule';
		}
		return 'Manual';
	}

	function getTriggerIcon(flow: AutomationFlow): string {
		if (flow.trigger.type === 'event') {
			const events = flow.trigger.events || [];
			if (events.length === 1) {
				const meta = AUTOMATION_EVENTS.find((e) => e.event === events[0]);
				return meta?.icon || 'mdi:flash-outline';
			}
			return 'mdi:flash-outline';
		}
		if (flow.trigger.type === 'schedule') {
			return 'mdi:clock-outline';
		}
		return 'mdi:gesture-tap';
	}

	function getOperationsSummary(flow: AutomationFlow): string {
		if (flow.operations.length === 0) {
			return 'No operations';
		}
		return flow.operations
			.map((op) => {
				const meta = OPERATION_TYPES.find((t) => t.type === op.type);
				return meta?.label || op.type;
			})
			.join(' → ');
	}

	function timeAgo(dateStr?: string): string {
		if (!dateStr) {
			return 'Never';
		}
		const diff = Date.now() - new Date(dateStr).getTime();
		if (diff < 60_000) {
			return 'Just now';
		}
		if (diff < 3_600_000) {
			return `${Math.floor(diff / 60_000)}m ago`;
		}
		if (diff < 86_400_000) {
			return `${Math.floor(diff / 3_600_000)}h ago`;
		}
		return `${Math.floor(diff / 86_400_000)}d ago`;
	}

	onMount(loadFlows);
</script>

<PageTitle name="Automations" icon="mdi:robot-outline" showBackButton={true} backUrl="/config" />

<div class="wrapper p-4">
	<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
		<div class="flex-1 min-w-0">
			<h2 class="h2 font-bold">Workflow Automations</h2>
			<p class="text-surface-600 dark:text-surface-200 truncate">
				Automate actions when content changes — send emails, call webhooks, update fields.
			</p>
		</div>
		<div class="flex items-center gap-2">
			<button class="preset-filled-primary-500 btn" onclick={createNew}>
				<iconify-icon icon="mdi:plus"></iconify-icon>
				<span>New Automation</span>
			</button>
		</div>
	</div>

	<!-- Search & Bulk Actions -->
	<div
		class="flex flex-col md:flex-row items-center gap-4 mb-6 bg-surface-100 dark:bg-surface-800 p-3 rounded-lg border border-surface-200 dark:border-surface-700"
	>
		<div class="relative flex-1 w-full">
			<iconify-icon icon="mdi:magnify" class="absolute left-3 top-1/2 -translate-y-1/2 opacity-40"></iconify-icon>
			<input type="text" class="input pl-10 w-full" placeholder="Search automations..." bind:value={searchQuery} />
		</div>

		<div class="flex items-center gap-2 w-full md:w-auto">
			<label
				class="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-surface-200 dark:hover:bg-surface-700 rounded transition-colors mr-auto"
			>
				<input type="checkbox" class="checkbox" checked={allSelected} indeterminate={someSelected} onchange={toggleSelectAll} />
				<span class="text-xs font-medium uppercase opacity-60">Select All</span>
			</label>

			{#if selectedIds.length > 0}
				<div class="flex items-center gap-1" transition:slide={{ axis: 'x' }}>
					<span class="text-xs font-bold mr-2">{selectedIds.length} Selected</span>
					<button class="btn btn-sm preset-tonal-surface" onclick={() => bulkToggle(true)} title="Activate Selected">
						<iconify-icon icon="mdi:play" class="text-success-600"></iconify-icon>
					</button>
					<button class="btn btn-sm preset-tonal-surface" onclick={() => bulkToggle(false)} title="Pause Selected">
						<iconify-icon icon="mdi:pause" class="text-warning-600"></iconify-icon>
					</button>
					<button class="btn btn-sm preset-tonal-error" onclick={bulkDelete} title="Delete Selected">
						<iconify-icon icon="mdi:trash-can-outline"></iconify-icon>
					</button>
				</div>
			{/if}
		</div>
	</div>

	{#if isLoading}
		<div class="flex flex-col items-center justify-center py-20 grayscale opacity-50">
			<iconify-icon icon="mdi:robot-outline" class="text-6xl animate-pulse"></iconify-icon>
			<p class="mt-4">Loading automations...</p>
		</div>
	{:else if flows.length === 0}
		<div class="preset-tonal-surface p-12 text-center rounded-lg border-2 border-dashed border-surface-300 dark:border-surface-700">
			<iconify-icon icon="mdi:robot-off-outline" width="64" height="64" class="text-terary-500 dark:text-primary-500"></iconify-icon>
			<h3 class="h3 font-bold">No Automations Yet</h3>
			<p class="mb-2 opacity-60">Create your first automation to start streamlining workflows.</p>
			<p class="mb-6 text-sm opacity-40">Example: Send an email when a new article is published.</p>
			<button class="btn preset-filled-primary-500" onclick={createNew}>
				<iconify-icon icon="mdi:plus"></iconify-icon>
				Get Started
			</button>
		</div>
	{:else}
		<div class="grid gap-4">
			{#each filteredFlows as flow (flow.id)}
				<div
					class="card p-4 bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 hover:border-primary-500 transition-all duration-200 rounded-lg flex items-center gap-4"
					class:opacity-50={!flow.active}
					transition:slide
				>
					<!-- Checkbox -->
					<div class="shrink-0">
						<input type="checkbox" class="checkbox" checked={selectedIds.includes(flow.id)} onchange={() => toggleSelect(flow.id)} />
					</div>

					<div class="flex flex-col md:flex-row items-start md:items-center gap-4 flex-1 min-w-0">
						<!-- Icon & Status -->
						<div class="flex items-center gap-3 flex-1 min-w-0">
							<div
								class="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
								class:bg-primary-100={flow.active}
								class:dark:bg-primary-900={flow.active}
								class:bg-surface-200={!flow.active}
								class:dark:bg-surface-700={!flow.active}
							>
								<iconify-icon
									icon={getTriggerIcon(flow)}
									class="text-xl"
									class:text-primary-600={flow.active}
									class:dark:text-primary-400={flow.active}
								></iconify-icon>
							</div>

							<div class="flex-1 min-w-0">
								<div class="flex items-center gap-2 mb-0.5">
									<button class="font-bold text-lg truncate hover:text-primary-600 transition-colors text-left" onclick={() => editFlow(flow)}>
										{flow.name}
									</button>
									{#if flow.active}
										<span class="badge preset-filled-success-500 text-[10px] uppercase">Active</span>
									{:else}
										<span class="badge preset-tonal-surface text-[10px] uppercase">Paused</span>
									{/if}
									{#if (flow.failureCount ?? 0) > 0}
										<span class="badge preset-filled-error-500 text-[10px]">{flow.failureCount} errors</span>
									{/if}
								</div>

								{#if flow.description}
									<p class="text-xs opacity-60 truncate mb-1">{flow.description}</p>
								{/if}

								<!-- Trigger & Operations Summary -->
								<div class="flex flex-wrap items-center gap-2 text-xs">
									<span class="badge preset-tonal-primary">
										<iconify-icon icon={getTriggerIcon(flow)} class="text-sm"></iconify-icon>
										{getTriggerLabel(flow)}
									</span>
									<iconify-icon icon="mdi:arrow-right" class="text-sm opacity-40"></iconify-icon>
									<span class="badge preset-tonal-secondary truncate max-w-[300px]"> {getOperationsSummary(flow)} </span>
								</div>
							</div>
						</div>

						<!-- Stats & Actions -->
						<div
							class="flex items-center gap-4 w-full md:w-auto mt-2 md:mt-0 pt-4 md:pt-0 border-t md:border-t-0 border-surface-200 dark:border-surface-700"
						>
							<!-- Stats -->
							<div class="hidden lg:flex items-center gap-4 text-xs opacity-60 mr-4">
								<span title="Total runs">
									<iconify-icon icon="mdi:play-circle-outline"></iconify-icon>
									{flow.triggerCount ?? 0}
								</span>
								<span title="Last triggered">
									<iconify-icon icon="mdi:clock-outline"></iconify-icon>
									{timeAgo(flow.lastTriggered)}
								</span>
							</div>

							<!-- Action buttons -->
							<div class="flex items-center gap-1">
								<button class="btn btn-sm preset-tonal-surface" onclick={() => testFlow(flow)} title="Test Run" aria-label="Test Automation">
									<iconify-icon icon="mdi:play-outline"></iconify-icon>
								</button>
								<button
									class="btn btn-sm preset-tonal-surface"
									onclick={() => toggleFlow(flow)}
									title={flow.active ? 'Pause' : 'Activate'}
									aria-label="Toggle Active"
								>
									<iconify-icon icon={flow.active ? 'mdi:pause' : 'mdi:play'}></iconify-icon>
								</button>
								<button class="btn btn-sm preset-tonal-surface" onclick={() => editFlow(flow)} title="Edit" aria-label="Edit Automation">
									<iconify-icon icon="mdi:pencil-outline"></iconify-icon>
								</button>
								<button
									class="btn btn-sm preset-tonal-surface"
									onclick={() => duplicateFlow(flow)}
									title="Duplicate"
									aria-label="Duplicate Automation"
								>
									<iconify-icon icon="mdi:content-copy"></iconify-icon>
								</button>
								<button class="btn btn-sm preset-tonal-error" onclick={() => deleteFlow(flow)} title="Delete" aria-label="Delete Automation">
									<iconify-icon icon="mdi:trash-can-outline"></iconify-icon>
								</button>
							</div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.wrapper {
		max-width: 1100px;
		margin: 0 auto;
	}
</style>
