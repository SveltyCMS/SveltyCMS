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
import { slide } from "svelte/transition";
	import Badge from '@components/ui/badge.svelte';
	import Button from '@components/ui/button.svelte';
	import Checkbox from '@components/ui/checkbox.svelte';
	import Input from '@components/ui/input.svelte';
	import Loader from '@components/ui/loader.svelte';
	import AdminCard from '@components/admin-card.svelte';
	import AdminPageShell from '@components/admin-page-shell.svelte';

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

<AdminPageShell
		title="Workflow Automations"
		icon="mdi:robot-outline"
		description="Automate actions when content changes — send emails, call webhooks, update fields"
		spaceY="8"
		showBackButton={true}
		backUrl="/config"
	>
	{#snippet actions()}
		<Button variant="primary" href="/config/automations/new" leadingIcon="mdi:plus" data-sveltekit-preload-data="hover">
			New Automation
		</Button>
	{/snippet}

	<!-- Search & Bulk Actions -->
	<AdminCard class="space-y-4 border border-surface-200 bg-white p-6 shadow-sm backdrop-blur-md dark:border-surface-800 dark:bg-surface-900/50">
		<div class="flex flex-col md:flex-row items-center gap-4">
			<div class="relative flex-1 w-full">
				<iconify-icon icon="mdi:magnify" class="pointer-events-none absolute inset-s-3 top-1/2 z-10 -translate-y-1/2 opacity-40"></iconify-icon>
				<Input
					type="search"
					bind:value={searchQuery}
					placeholder="Search automations..."
					aria-label="Search automations"
					class="ps-10 w-full"
				/>
			</div>

			<div class="flex items-center gap-2 w-full md:w-auto">
				<div class="flex items-center gap-2 px-3 py-2 mr-auto">
					<Checkbox
						checked={allSelected ? true : someSelected ? 'indeterminate' : false}
						onchange={toggleSelectAll}
						label="Select All"
						size="sm"
					/>
				</div>

				{#if selectedIds.length > 0}
					<div class="flex items-center gap-1" transition:slide={{ axis: 'x' }}>
						<span class="text-xs font-bold me-2">{selectedIds.length} Selected</span>
						<Button variant="surface" onclick={() => bulkToggle(true)} title="Activate Selected" aria-label="Activate selected" size="sm">
							<iconify-icon icon="mdi:play" class="text-success-600"></iconify-icon>
						</Button>
						<Button variant="surface" onclick={() => bulkToggle(false)} title="Pause Selected" aria-label="Pause selected" size="sm">
							<iconify-icon icon="mdi:pause" class="text-warning-600"></iconify-icon>
						</Button>
						<Button variant="error" onclick={bulkDelete} title="Delete Selected" aria-label="Delete selected" size="sm">
							<iconify-icon icon="mdi:trash-can-outline"></iconify-icon>
						</Button>
					</div>
				{/if}
			</div>
		</div>
	</AdminCard>

	{#if isLoading}
		<AdminCard class="border border-surface-200 bg-white p-6 shadow-sm backdrop-blur-md dark:border-surface-800 dark:bg-surface-900/50">
			<div class="flex flex-col items-center justify-center gap-4 py-20 grayscale opacity-50">
				<Loader variant="circle" width="size-16" height="size-16" ariaLabel="Loading automations" />
				<p>Loading automations...</p>
			</div>
		</AdminCard>
	{:else if flows.length === 0}
		<AdminCard class="border-2 border-dashed border-surface-300 bg-white p-12 text-center shadow-sm backdrop-blur-md dark:border-surface-700 dark:bg-surface-900/50">
			<iconify-icon icon="mdi:robot-off-outline" width="64" height="64" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
			<h3 class="h3 font-bold">No Automations Yet</h3>
			<p class="mb-2 opacity-60">Create your first automation to start streamlining workflows.</p>
			<p class="mb-6 text-sm opacity-40">Example: Send an email when a new article is published.</p>
			<Button variant="primary" href="/config/automations/new" data-sveltekit-preload-data="hover">
				<iconify-icon icon="mdi:plus"></iconify-icon>
				Get Started
			</Button>
		</AdminCard>
	{:else}
		<AdminCard class="space-y-4 border border-surface-200 bg-white p-6 shadow-sm backdrop-blur-md dark:border-surface-800 dark:bg-surface-900/50">
			<div class="grid gap-4">
				{#each filteredFlows as flow (flow.id)}
					<div class:opacity-50={!flow.active} transition:slide>
					<AdminCard
						class="flex items-center gap-4 border border-surface-200 bg-surface-100 p-4 transition-all duration-200 hover:border-tertiary-500 dark:border-primary-600 dark:bg-surface-800"
					>
						<!-- Checkbox -->
						<div class="shrink-0">
							<Checkbox
								checked={selectedIds.includes(flow.id)}
								onchange={() => toggleSelect(flow.id)}
								label={`Select ${flow.name}`}
								size="sm"
							/>
						</div>

						<div class="flex flex-col md:flex-row items-start md:items-center gap-4 flex-1 min-w-0">
							<!-- Icon & Status -->
							<div class="flex items-center gap-3 flex-1 min-w-0">
								<div
									class="shrink-0 w-10 h-10 rounded flex items-center justify-center"
									class:bg-primary-100={flow.active}
									class:dark:bg-primary-900={flow.active}
									class:bg-surface-200={!flow.active}
									class:dark:bg-surface-700={!flow.active}
								>
									<iconify-icon
										icon={getTriggerIcon(flow)}
										class="text-xl"
										class:text-tertiary-600={flow.active} class:dark:text-primary-600={flow.active}
										class:dark:text-primary-500={flow.active}
									></iconify-icon>
								</div>

								<div class="flex-1 min-w-0">
									<div class="flex items-center gap-2 mb-0.5">
										<a class="font-bold text-lg truncate hover:text-tertiary-600 dark:text-primary-600 transition-colors text-start" href={`/config/automations/${flow.id}`} data-sveltekit-preload-data="hover">
											{flow.name}
										</a>
										{#if flow.active}
											<Badge variant="success" size="sm" class="uppercase">Active</Badge>
										{:else}
											<Badge preset="tonal" color="surface" size="sm" class="uppercase">Paused</Badge>
										{/if}
										{#if (flow.failureCount ?? 0) > 0}
											<Badge variant="error" size="sm">{flow.failureCount} errors</Badge>
										{/if}
									</div>

									{#if flow.description}
										<p class="text-xs opacity-60 truncate mb-1">{flow.description}</p>
									{/if}

									<!-- Trigger & Operations Summary -->
									<div class="flex flex-wrap items-center gap-2 text-xs">
										<Badge preset="tonal" color="primary">
											<iconify-icon icon={getTriggerIcon(flow)} class="text-sm"></iconify-icon>
											{getTriggerLabel(flow)}
										</Badge>
										<iconify-icon icon="mdi:arrow-right" class="text-sm opacity-40"></iconify-icon>
										<Badge preset="tonal" color="secondary" class="truncate max-w-75"> {getOperationsSummary(flow)} </Badge>
									</div>
								</div>
							</div>

							<!-- Stats & Actions -->
							<div
								class="flex items-center gap-4 w-full md:w-auto mt-2 md:mt-0 pt-4 md:pt-0 border-t md:border-t-0 border-surface-200 dark:border-surface-700"
							>
								<!-- Stats -->
								<div class="hidden lg:flex items-center gap-4 text-xs opacity-60 me-4">
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
									<Button variant="surface" onclick={() => testFlow(flow)} title="Test Run" aria-label="Test Automation" size="sm">
										<iconify-icon icon="mdi:play-outline"></iconify-icon>
									</Button>
									<Button variant="surface"
										onclick={() => toggleFlow(flow)}
										title={flow.active ? 'Pause' : 'Activate'}
										aria-label={flow.active ? 'Pause automation' : 'Activate automation'}
									 size="sm">
										<iconify-icon icon={flow.active ? 'mdi:pause' : 'mdi:play'}></iconify-icon>
									</Button>
									<Button variant="secondary" size="sm" href={`/config/automations/${flow.id}`} title="Edit" aria-label="Edit Automation" data-sveltekit-preload-data="hover" class="p-0! min-w-0">
										<iconify-icon icon="mdi:pencil-outline"></iconify-icon>
									</Button>
									<Button
										variant="secondary"
										size="sm"
										href={`/config/automations/${flow.id}?duplicate=true`}
										title="Duplicate"
										aria-label="Duplicate Automation"
										data-sveltekit-preload-data="hover"
										class="p-0! min-w-0"
									>
										<iconify-icon icon="mdi:content-copy"></iconify-icon>
									</Button>
									<Button variant="error" onclick={() => deleteFlow(flow)} title="Delete" aria-label="Delete Automation" size="sm">
										<iconify-icon icon="mdi:trash-can-outline"></iconify-icon>
									</Button>
								</div>
							</div>
						</div>
					</AdminCard>
					</div>
				{/each}
			</div>
		</AdminCard>
	{/if}
</AdminPageShell>
