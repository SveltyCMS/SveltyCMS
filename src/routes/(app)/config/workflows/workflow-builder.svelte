<!-- 
@file src/routes/(app)/config/workflows/workflow-builder.svelte
@component Visual State Machine Editor for Content Lifecycles
 -->
<script lang="ts">
import { onMount } from "svelte";
import { toast } from "@src/stores/toast.svelte.ts";
import { fade } from "svelte/transition";
import type { WorkflowDefinition, WorkflowState, WorkflowTransition } from "@src/types/workflow-types";

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
let roles = $state<any[]>([]);
let selectedCollectionId = $state<string>("");
let workflowId = $state<string | null>(null);

onMount(async () => {
    // Load collections
    const colRes = await fetch('/api/collections');
    const colData = await colRes.json();
    if (colData.success) collections = colData.data;

    // Load roles (using a common endpoint if available or dedicated one)
    const roleRes = await fetch('/api/user/roles'); // Assuming this endpoint exists based on standard patterns
    const roleData = await roleRes.json();
    if (roleData.success) roles = roleData.data;
});

async function loadWorkflow(collectionId: string) {
    if (!collectionId) return;
    const res = await fetch(`/api/workflows?collectionId=${collectionId}`);
    const data = await res.json();
    if (data.success && data.data) {
        const wf = data.data as WorkflowDefinition;
        workflowId = wf._id || null;
        states = wf.states;
        transitions = wf.transitions;
        toast.success(`Workflow loaded for ${collectionId}`);
    } else {
        workflowId = null;
        // Reset to default or keep current as template
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
        states: $state.snapshot(states),
        transitions: $state.snapshot(transitions)
    };

    const res = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(definition)
    });

    const data = await res.json();
    if (data.success) {
        workflowId = data.data._id;
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

<div class="flex h-full flex-col gap-6 p-6 bg-surface-50 dark:bg-surface-950">
	<div class="flex items-center justify-between bg-white dark:bg-surface-900 p-4 rounded-xl shadow-sm border border-surface-200 dark:border-surface-800">
		<div class="flex items-center gap-6">
			<div>
				<h1 class="text-2xl font-bold flex items-center gap-2">
					<iconify-icon icon="mdi:sitemap" class="text-primary-500"></iconify-icon>
					Workflow Engine
				</h1>
				<p class="text-sm opacity-50 font-medium">Visual Lifecycle Management (FSM)</p>
			</div>
            
            <div class="divider-vertical h-10 border-l border-surface-200 dark:border-surface-800"></div>

            <div class="flex flex-col gap-1">
                <label for="collection-select" class="text-[10px] font-bold uppercase opacity-50">Target Collection</label>
                <select 
                    id="collection-select"
                    bind:value={selectedCollectionId} 
                    onchange={() => loadWorkflow(selectedCollectionId)}
                    class="select select-sm py-1 font-bold bg-surface-100 dark:bg-surface-800 border-none rounded-lg"
                >
                    <option value="" disabled>Select Collection...</option>
                    {#each collections as col}
                        <option value={col._id}>{col.name || col._id}</option>
                    {/each}
                </select>
            </div>
		</div>
		<div class="flex gap-2">
			<button class="btn preset-tonal-surface" onclick={addState}>+ Add State</button>
			<button class="btn preset-tonal-surface" onclick={addTransition}>+ Add Transition</button>
			<button class="btn preset-filled-primary-500" onclick={saveWorkflow}>Save Workflow</button>
		</div>
	</div>

	<div class="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1 min-h-0">
		<!-- Canvas Area -->
		<div class="lg:col-span-3 bg-surface-100 dark:bg-surface-900/50 rounded-2xl border-2 border-dashed border-surface-200 dark:border-surface-800 relative overflow-hidden p-12">
			<div class="flex flex-wrap gap-12 justify-center items-start">
				{#each states as state (state.id)}
					<div 
						role="button"
						tabindex="0"
						class="w-48 bg-white dark:bg-surface-800 rounded-xl shadow-lg border-2 transition-all p-4 relative
                            {selectedNodeId === state.id ? 'border-primary-500 ring-4 ring-primary-500/10 scale-105' : 'border-surface-200 dark:border-surface-700'}"
						onclick={() => selectNode(state.id)}
						onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') selectNode(state.id); }}
					>
						{#if state.isInitial}
							<span class="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary-500 text-white text-[8px] px-2 py-0.5 rounded-full font-bold uppercase">Initial</span>
						{/if}
						<div class="flex items-center justify-between mb-2">
							<div class="h-3 w-3 rounded-full" style:background-color={state.color}></div>
							<button class="text-error-500 opacity-0 group-hover:opacity-100" onclick={() => removeState(state.id)}>×</button>
						</div>
						<input bind:value={state.label} class="bg-transparent border-none font-bold text-sm w-full focus:ring-0" />
						
						<!-- Outgoing Transitions -->
						<div class="mt-4 space-y-1">
							{#each transitions.filter(t => t.from === state.id) as trans}
								<button 
                                    class="text-[10px] w-full text-left bg-surface-50 dark:bg-surface-900 p-1.5 rounded flex items-center justify-between border 
                                           {selectedTransitionId === trans.id ? 'border-primary-500 ring-1 ring-primary-500/50' : 'border-surface-200/50 hover:border-surface-400'}"
                                    onclick={(e) => { e.stopPropagation(); selectTransition(trans.id); }}
                                >
									<span class="truncate pr-2">➔ {states.find(s => s.id === trans.to)?.label}</span>
									<span class="text-[8px] opacity-40">{trans.label}</span>
								</button>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		</div>

		<!-- Properties Inspector -->
		<div class="bg-white dark:bg-surface-900 rounded-2xl shadow-sm border border-surface-200 dark:border-surface-800 p-6 overflow-y-auto">
			<h3 class="text-xs font-bold uppercase tracking-widest opacity-40 mb-6">Properties</h3>
			
			{#if selectedNodeId}
				{const node = states.find(s => s.id === selectedNodeId)}
				{#if node}
					<div class="space-y-6" in:fade>
                        <div class="badge preset-filled-primary-500 text-[10px]">State: {node.id}</div>
						<div class="space-y-2">
							<label for="state-name" class="label text-xs font-bold">Display Label</label>
							<input id="state-name" bind:value={node.label} class="input input-sm" />
						</div>
						<div class="space-y-2">
							<label for="accent-color" class="label text-xs font-bold">Accent Color</label>
							<input id="accent-color" type="color" bind:value={node.color} class="w-full h-10 rounded-lg cursor-pointer border-none" />
						</div>
						<div class="flex flex-col gap-3">
							<label class="flex items-center gap-2 text-xs font-bold">
								<input type="checkbox" bind:checked={node.isInitial} class="checkbox checkbox-sm" onchange={() => { if(node.isInitial) states.forEach(s => { if(s.id !== node.id) s.isInitial = false }) }} />
								Initial State
							</label>
							<label class="flex items-center gap-2 text-xs font-bold">
								<input type="checkbox" bind:checked={node.isFinal} class="checkbox checkbox-sm" />
								Final State
							</label>
						</div>
                        <button class="btn btn-sm preset-tonal-error w-full mt-4" onclick={() => { removeState(node.id); selectedNodeId = null; }}>Delete State</button>
					</div>
				{/if}
			{:else if selectedTransitionId}
                {const trans = transitions.find(t => t.id === selectedTransitionId)}
                {#if trans}
                    <div class="space-y-6" in:fade>
                        <div class="badge preset-filled-secondary-500 text-[10px]">Transition: {trans.id}</div>
                        <div class="space-y-2">
							<label for="trans-label" class="label text-xs font-bold">Button Label</label>
							<input id="trans-label" bind:value={trans.label} class="input input-sm" />
						</div>
                        <div class="space-y-2">
							<label for="trans-from" class="label text-xs font-bold">From State</label>
							<select id="trans-from" bind:value={trans.from} class="select select-sm">
                                {#each states as s}
                                    <option value={s.id}>{s.label}</option>
                                {/each}
                            </select>
						</div>
                        <div class="space-y-2">
							<label for="trans-to" class="label text-xs font-bold">To State</label>
							<select id="trans-to" bind:value={trans.to} class="select select-sm">
                                {#each states as s}
                                    <option value={s.id}>{s.label}</option>
                                {/each}
                            </select>
						</div>
                        <div class="space-y-2">
							<label for="required-role" class="label text-xs font-bold">Required Role (RBAC)</label>
							<select id="required-role" bind:value={trans.requiredRole} class="select select-sm">
                                <option value="">No Role (Anyone)</option>
                                <option value="admin">Administrator</option>
                                {#each roles as role}
                                    <option value={role._id}>{role.name || role._id}</option>
                                {/each}
                            </select>
                            <p class="text-[10px] opacity-40 italic">User must have this role to trigger this transition.</p>
						</div>
                        <button class="btn btn-sm preset-tonal-error w-full mt-4" onclick={() => { removeTransition(trans.id); selectedTransitionId = null; }}>Delete Transition</button>
                    </div>
                {/if}
			{:else}
				<div class="h-full flex flex-col items-center justify-center text-center opacity-30 italic">
					<iconify-icon icon="mdi:gesture-tap" width="48" class="mb-4"></iconify-icon>
					<p class="text-sm font-medium">Select a state or transition on the canvas to edit its properties</p>
				</div>
			{/if}
		</div>
	</div>
</div>
