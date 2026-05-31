<!--
@files src/routes/(app)/config/automations/+page.svelte
@component
**Automation Management Page**
Lists all configured workflow automations with status, trigger, and operation summaries.
-->

<script lang="ts">
import type { AutomationFlow } from "@src/services/background/automation/types";
import { AUTOMATION_EVENTS } from "@src/services/background/automation/types";
import { toast } from "@src/stores/toast.svelte.ts";
import { onMount } from "svelte";
import { fade, fly, slide } from "svelte/transition";

let flows: AutomationFlow[] = $state([]);
let isLoading = $state(true);
let searchQuery = $state("");
let selectedIds: string[] = $state([]);

let filteredFlows = $derived(
	flows.filter(f =>
		f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
		f.description?.toLowerCase().includes(searchQuery.toLowerCase())
	)
);

let allSelected = $derived(filteredFlows.length > 0 && selectedIds.length === filteredFlows.length);
let someSelected = $derived(selectedIds.length > 0 && selectedIds.length < filteredFlows.length);

async function loadFlows() {
	isLoading = true;
	try {
		const res = await fetch("/api/automations");
		const result = await res.json();
		if (result.success) {
			flows = result.data ?? [];
		} else {
			toast.error(result.error || "Failed to load automations");
		}
	} catch (_err) {
		toast.error("Error loading automations");
	} finally {
		isLoading = false;
	}
}

async function toggleFlow(flow: AutomationFlow) {
	try {
		const res = await fetch(`/api/automations/${flow.id}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ active: !flow.active }),
		});
		const result = await res.json();
		if (result.success) {
			toast.success(`Automation ${!flow.active ? "activated" : "paused"}`);
			await loadFlows();
		}
	} catch (_err) {
		toast.error("Error toggling automation");
	}
}

async function deleteFlow(flow: AutomationFlow) {
	if (!confirm(`Are you sure you want to delete "${flow.name}"?`)) return;
	try {
		const res = await fetch(`/api/automations/${flow.id}`, { method: "DELETE" });
		const result = await res.json();
		if (result.success) {
			toast.success("Automation deleted");
			await loadFlows();
		}
	} catch (_err) {
		toast.error("Error deleting automation");
	}
}


async function testFlow(flow: AutomationFlow) {
	toast.info(`Executing test run for "${flow.name}"...`);
	try {
		const res = await fetch(`/api/automations/${flow.id}/test`, { method: "POST" });
		const result = await res.json();
		if (result.success && result.data.status === "success") {
			toast.success(`Test successful (${result.data.duration}ms)`);
		} else {
			toast.error(result.error || "Test failed");
		}
	} catch (_err) {
		toast.error("Error testing automation");
	}
}

function getTriggerIcon(flow: AutomationFlow) {
	if (flow.trigger.type === 'event') {
		const firstEvent = flow.trigger.events?.[0];
		return AUTOMATION_EVENTS.find(e => e.event === firstEvent)?.icon || 'mdi:flash';
	}
	return flow.trigger.type === 'schedule' ? 'mdi:clock-outline' : 'mdi:gesture-tap';
}

function getTriggerLabel(flow: AutomationFlow) {
	if (flow.trigger.type === 'event') {
		const count = flow.trigger.events?.length || 0;
		return count === 1 ? flow.trigger.events?.[0] : `${count} Events`;
	}
	return flow.trigger.type === 'schedule' ? 'Schedule' : 'Manual';
}

function getOperationsSummary(flow: AutomationFlow) {
	if (!flow.operations.length) return "No operations";
	const types = flow.operations.map(op => op.type);
	const uniqueTypes = [...new Set(types)];
	if (uniqueTypes.length === 1) return `${flow.operations.length} ${uniqueTypes[0]} ops`;
	return `${flow.operations.length} operations`;
}

function toggleSelect(id: string) {
	if (selectedIds.includes(id)) {
		selectedIds = selectedIds.filter(i => i !== id);
	} else {
		selectedIds = [...selectedIds, id];
	}
}

function toggleSelectAll() {
	if (allSelected) {
		selectedIds = [];
	} else {
		selectedIds = filteredFlows.map(f => f.id);
	}
}

async function bulkToggle(active: boolean) {
	toast.info(`${active ? 'Activating' : 'Pausing'} ${selectedIds.length} automations...`);
	// Simple sequential for now, can be optimized later
	for (const id of selectedIds) {
		await fetch(`/api/automations/${id}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ active }),
		});
	}
	toast.success("Bulk update complete");
	selectedIds = [];
	await loadFlows();
}

async function bulkDelete() {
	if (!confirm(`Delete ${selectedIds.length} automations?`)) return;
	for (const id of selectedIds) {
		await fetch(`/api/automations/${id}`, { method: "DELETE" });
	}
	toast.success("Bulk delete complete");
	selectedIds = [];
	await loadFlows();
}

function timeAgo(dateStr: string | undefined) {
	if (!dateStr) return "Never";
	const date = new Date(dateStr);
	const now = new Date();
	const diff = (now.getTime() - date.getTime()) / 1000;
	if (diff < 60) return "Just now";
	if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
	if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
	return date.toLocaleDateString();
}

onMount(loadFlows);
</script>

<div class="absolute inset-0 p-6 space-y-8 bg-surface-50/50 dark:bg-surface-950/50 overflow-y-auto">
	<!-- Header -->
	<div class="flex items-center justify-between" in:fade>
		<div>
			<h1 class="text-3xl font-bold flex items-center gap-3">
				<iconify-icon icon="mdi:robot-outline" class="text-primary-500"></iconify-icon>
				Workflow Automations
			</h1>
			<p class="text-sm opacity-50 font-medium">Automate actions when content changes &mdash; send emails, call webhooks, update fields</p>
		</div>
		<div class="flex items-center gap-2">
			<a class="btn preset-filled-primary-500" href="/config/automations/new" data-sveltekit-preload-data="hover">
				<iconify-icon icon="mdi:plus"></iconify-icon>
				<span>New Automation</span>
			</a>
		</div>
	</div>

	<!-- Search & Bulk Actions -->
	<div
		class="card p-6 border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900/50 backdrop-blur-md shadow-sm space-y-4"
		in:fly={{ y: 20, delay: 100 }}
	>
		<div class="flex flex-col md:flex-row items-center gap-4">
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
	</div>

	{#if isLoading}
		<div class="card p-6 border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900/50 backdrop-blur-md shadow-sm">
			<div class="flex flex-col items-center justify-center py-20 grayscale opacity-50">
				<iconify-icon icon="mdi:robot-outline" class="text-6xl animate-pulse"></iconify-icon>
				<p class="mt-4">Loading automations...</p>
			</div>
		</div>
	{:else if flows.length === 0}
		<div class="card p-12 text-center border-2 border-dashed border-surface-300 dark:border-surface-700 bg-white dark:bg-surface-900/50 backdrop-blur-md shadow-sm" in:fade>
			<iconify-icon icon="mdi:robot-off-outline" width="64" height="64" class="text-primary-500"></iconify-icon>
			<h3 class="h3 font-bold">No Automations Yet</h3>
			<p class="mb-2 opacity-60">Create your first automation to start streamlining workflows.</p>
			<p class="mb-6 text-sm opacity-40">Example: Send an email when a new article is published.</p>
			<a class="btn preset-filled-primary-500" href="/config/automations/new" data-sveltekit-preload-data="hover">
				<iconify-icon icon="mdi:plus"></iconify-icon>
				Get Started
			</a>
		</div>
	{:else}
		<div class="card p-6 border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900/50 backdrop-blur-md shadow-sm space-y-4" in:fade>
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
										class:dark:text-primary-500={flow.active}
									></iconify-icon>
								</div>

								<div class="flex-1 min-w-0">
									<div class="flex items-center gap-2 mb-0.5">
										<a class="font-bold text-lg truncate hover:text-primary-600 transition-colors text-left" href={`/config/automations/${flow.id}`} data-sveltekit-preload-data="hover">
											{flow.name}
										</a>
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
										<span class="badge preset-tonal-secondary truncate max-w-75"> {getOperationsSummary(flow)} </span>
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
									<a class="btn btn-sm preset-tonal-surface flex items-center justify-center" href={`/config/automations/${flow.id}`} title="Edit" aria-label="Edit Automation" data-sveltekit-preload-data="hover">
										<iconify-icon icon="mdi:pencil-outline"></iconify-icon>
									</a>
									<a
										class="btn btn-sm preset-tonal-surface flex items-center justify-center"
										href={`/config/automations/${flow.id}?duplicate=true`}
										title="Duplicate"
										aria-label="Duplicate Automation"
										data-sveltekit-preload-data="hover"
									>
										<iconify-icon icon="mdi:content-copy"></iconify-icon>
									</a>
									<button class="btn btn-sm preset-tonal-error" onclick={() => deleteFlow(flow)} title="Delete" aria-label="Delete Automation">
										<iconify-icon icon="mdi:trash-can-outline"></iconify-icon>
									</button>
								</div>
							</div>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>
