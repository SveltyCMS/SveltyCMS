<!--
@file src/routes/(app)/config/workflows/workflow-builder.svelte
@component Visual State Machine Editor for Content Lifecycles
 -->
<script lang="ts">
import { onMount } from "svelte";
import { toast } from "@src/stores/toast.svelte.ts";
import { fade } from "svelte/transition";
import type { WorkflowDefinition, WorkflowState, WorkflowTransition } from "@src/types/workflow-types";
	import AdminPageShell from '@components/admin-page-shell.svelte';
	import AdminCard from '@components/admin-card.svelte';
	import Button from '@components/ui/button.svelte';
	import Badge from '@components/ui/badge.svelte';
	import Checkbox from '@components/ui/checkbox.svelte';
	import Input from '@components/ui/input.svelte';
	import Select from '@components/ui/select.svelte';
	import StickyActions from '@components/ui/sticky-actions.svelte';
import {
	listWorkflowCollections,
	listWorkflowRoles,
	loadWorkflow as loadWorkflowApi,
	saveWorkflowDefinition,
} from "./workflows-api";

let states = $state<WorkflowState[]>([
	{ id: "draft", label: "Draft", color: "#94a3b8", isInitial: true },
	{ id: "review", label: "In Review", color: "#fbbf24" },
	{ id: "published", label: "Published", color: "#22c55e", isFinal: true },
]);

let transitions = $state<WorkflowTransition[]>([
	{ id: "t1", from: "draft", to: "review", label: "Submit for Review" },
	{ id: "t2", from: "review", to: "published", label: "Approve & Publish" },
	{ id: "t3", from: "review", to: "draft", label: "Reject" },
]);

let selectedNodeId = $state<string | null>(null);
let selectedTransitionId = $state<string | null>(null);
let collections = $state<any[]>([]);

const collectionOptions = $derived(
	collections.map((col) => ({ value: col._id, label: col.name || col._id }))
);
let roles = $state<any[]>([]);
let selectedCollectionId = $state<string>("");
let workflowId = $state<string | null>(null);
let workflowName = $state<string>("");
let workflowDescription = $state<string>("");

onMount(async () => {
	// Load collections + roles via workflows-api (CSRF-safe fetchApi)
	collections = await listWorkflowCollections();
	roles = await listWorkflowRoles();
});

async function loadWorkflow(collectionId: string) {
	if (!collectionId) return;
	const data = await loadWorkflowApi(collectionId);
	if (data.success && data.data) {
		const wf = data.data as WorkflowDefinition;
		workflowId = wf._id || null;
		workflowName = wf.name || "";
		workflowDescription = wf.description || "";
		states = wf.states;
		transitions = wf.transitions;
		toast.success(`Workflow loaded for ${collectionId}`);
	} else {
		workflowId = null;
		workflowName = "";
		workflowDescription = "";
	}
}

async function saveWorkflow() {
	if (!selectedCollectionId) {
		toast.error("Please select a collection first");
		return;
	}

	const definition: WorkflowDefinition = {
		_id: workflowId || undefined,
		collectionId: selectedCollectionId,
		name: workflowName || selectedCollectionId,
		description: workflowDescription || undefined,
		states: $state.snapshot(states),
		transitions: $state.snapshot(transitions)
	};

	const data = await saveWorkflowDefinition(definition);
	if (data.success && data.data) {
		workflowId = data.data._id || null;
		toast.success("Workflow saved successfully");
	} else {
		toast.error(data.message || "Failed to save workflow");
	}
}

function addState() {
	const id = `state_${globalThis.crypto.randomUUID().substring(0, 8)}`;
	states.push({ id, label: "New State", color: "#3b82f6" });
}

function addTransition() {
	if (states.length < 2) return;
	const id = `trans_${globalThis.crypto.randomUUID().substring(0, 8)}`;
	transitions.push({
		id,
		from: states[0].id,
		to: states[1].id,
		label: "New Transition",
	});
}

function removeState(id: string) {
	states = states.filter((s) => s.id !== id);
	transitions = transitions.filter((t) => t.from !== id && t.to !== id);
}

function removeTransition(id: string) {
	transitions = transitions.filter((t) => t.id !== id);
}

function selectTransition(id: string) {
    selectedTransitionId = id;
    selectedNodeId = null;
}

function selectNode(id: string) {
    selectedNodeId = id;
    selectedTransitionId = null;
}
</script>

<AdminPageShell
	title="Workflow Engine"
	icon="mdi:sitemap"
	description="Visual Lifecycle Management (FSM)"
	fullHeight
	spaceY="4"
>
	{#snippet actions()}
		<Button variant="surface" onclick={addState} data-testid="workflow-add-state">+ Add State</Button>
		<Button variant="surface" onclick={addTransition} data-testid="workflow-add-transition">+ Add Transition</Button>
		<StickyActions>
			<Button variant="tertiary" onclick={saveWorkflow} class="dark:" data-testid="workflow-save">Save Workflow</Button>
		</StickyActions>
	{/snippet}

	<AdminCard class="flex flex-wrap items-center justify-between gap-4 border border-surface-200 bg-white p-4 shadow-sm dark:border-surface-800 dark:bg-surface-900" data-testid="workflow-toolbar">
		<div data-testid="workflow-collection-select">
			<Select
				bind:value={selectedCollectionId}
				label="Target Collection"
				options={collectionOptions}
				placeholder="Select Collection..."
				size="sm"
				onchange={() => loadWorkflow(selectedCollectionId)}
				class="min-w-48"
			/>
		</div>
		<Input
			bind:value={workflowName}
			label="Workflow Name"
			placeholder="e.g. Blog Review Flow"
			class="min-w-48"
		/>
		<Input
			bind:value={workflowDescription}
			label="Description"
			placeholder="Optional description"
			class="min-w-48"
		/>
		{#if workflowId}
			<span class="text-xs opacity-50" data-testid="workflow-id">id: {workflowId}</span>
		{/if}
	</AdminCard>

	<div class="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-4" data-testid="workflow-builder">
		<!-- Canvas Area -->
		<div class="relative overflow-hidden rounded-2xl border-2 border-dashed border-surface-200 bg-surface-100 p-12 lg:col-span-3 dark:border-surface-800 dark:bg-surface-900/50" data-testid="workflow-canvas">
			<div class="flex flex-wrap items-start justify-center gap-12">
				{#each states as state (state.id)}
					<div
						role="button"
						tabindex="0"
						data-testid={`workflow-state-${state.id}`}
						class="relative w-48 rounded border-2 bg-white p-4 shadow-lg transition-all dark:bg-surface-800
                            {selectedNodeId === state.id ? 'border-primary-500 ring-4 ring-primary-500/10 scale-105' : 'border-surface-200 dark:border-surface-700'}"
						onclick={() => selectNode(state.id)}
						onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') selectNode(state.id); }}
					>
						{#if state.isInitial}
							<span class="absolute -top-3 inset-s-1/2 -translate-x-1/2 rounded-full bg-primary-500 px-2 py-0.5 text-[8px] font-bold uppercase text-white">Initial</span>
						{/if}
						<div class="mb-2 flex items-center justify-between">
							<div class="h-3 w-3 rounded-full" style:background-color={state.color}></div>
							<button class="text-error-500 opacity-0 group-hover:opacity-100" onclick={() => removeState(state.id)}>×</button>
						</div>
						<Input
							bind:value={state.label}
							inputClass="border-none bg-transparent text-sm font-bold shadow-none focus-visible:ring-0"
						/>

						<!-- Outgoing Transitions -->
						<div class="mt-4 space-y-1">
							{#each transitions.filter(t => t.from === state.id) as trans (trans.id)}
								<button
                                    class="flex w-full items-center justify-between rounded border bg-surface-50 p-1.5 text-start text-[10px] dark:bg-surface-900
                                           {selectedTransitionId === trans.id ? 'border-primary-500 ring-1 ring-primary-500/50' : 'border-surface-200/50 hover:border-surface-400'}"
                                    onclick={(e) => { e.stopPropagation(); selectTransition(trans.id); }}
                                >
									<span class="truncate pe-2">➔ {states.find(s => s.id === trans.to)?.label}</span>
									<span class="text-[8px] opacity-40">{trans.label}</span>
								</button>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		</div>

		<!-- Properties Inspector -->
		<AdminCard
			class="overflow-y-auto border border-surface-200 bg-white p-6 shadow-sm dark:border-surface-800 dark:bg-surface-900"
		>
			<h3 class="mb-6 text-xs font-bold uppercase tracking-widest opacity-40">Properties</h3>

			{#if selectedNodeId}
				{const node = states.find(s => s.id === selectedNodeId)}
				{#if node}
					<div class="space-y-6" in:fade>
                        <Badge variant="primary" size="sm">State: {node.id}</Badge>
						<Input id="state-name" bind:value={node.label} label="Display Label" />
						<Input
							id="accent-color"
							type="color"
							bind:value={node.color}
							label="Accent Color"
							inputClass="h-10 cursor-pointer border-none p-0"
						/>
						<div class="flex flex-col gap-3">
							<Checkbox
								bind:checked={node.isInitial}
								label="Initial State"
								size="sm"
								onchange={(checked) => {
									if (checked) states.forEach((s) => { if (s.id !== node.id) s.isInitial = false; });
								}}
							/>
							<Checkbox bind:checked={node.isFinal} label="Final State" size="sm" />
						</div>
                        <Button variant="error" onclick={() => { removeState(node.id); selectedNodeId = null; }} size="sm" class="mt-4 w-full">Delete State</Button>
					</div>
				{/if}
			{:else if selectedTransitionId}
                {const trans = transitions.find(t => t.id === selectedTransitionId)}
                {#if trans}
                    <div class="space-y-6" in:fade>
                        <Badge variant="secondary" size="sm">Transition: {trans.id}</Badge>
                        <Input id="trans-label" bind:value={trans.label} label="Button Label" />
						<Select
							bind:value={trans.from}
							label="From State"
							size="sm"
							options={states.map((s) => ({ value: s.id, label: s.label }))}
						/>
						<Select
							bind:value={trans.to}
							label="To State"
							size="sm"
							options={states.map((s) => ({ value: s.id, label: s.label }))}
						/>
						<Select
							bind:value={trans.requiredRole}
							label="Required Role (RBAC)"
							size="sm"
							description="User must have this role to trigger this transition."
							options={[
								{ value: '', label: 'No Role (Anyone)' },
								{ value: 'admin', label: 'Administrator' },
								...roles.map((role) => ({ value: role._id, label: role.name || role._id })),
							]}
						/>
                        <Button variant="error" onclick={() => { removeTransition(trans.id); selectedTransitionId = null; }} size="sm" class="mt-4 w-full">Delete Transition</Button>
                    </div>
                {/if}
			{:else}
				<div class="flex h-full flex-col items-center justify-center text-center italic opacity-30">
					<iconify-icon icon="mdi:gesture-tap" width="48" class="mb-4"></iconify-icon>
					<p class="text-sm font-medium">Select a state or transition on the canvas to edit its properties</p>
				</div>
			{/if}
		</AdminCard>
	</div>
</AdminPageShell>
