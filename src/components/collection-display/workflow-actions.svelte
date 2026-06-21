<!--
@file src/components/collection-display/workflow-actions.svelte
@component Workflow Transition Controls for Content Entries
 -->
<script lang="ts">
import { onMount } from "svelte";
import { toast } from "@src/stores/toast.svelte.ts";
import { fade, slide } from "svelte/transition";
import type { WorkflowDefinition, WorkflowInstance } from "@src/types/workflow-types";
	import Button from '@components/ui/button.svelte';

interface Props {
    collectionId: string;
    entryId: string;
}

const { collectionId, entryId }: Props = $props();

let workflow = $state<WorkflowDefinition | null>(null);
let instance = $state<WorkflowInstance | null>(null);
let loading = $state(true);
let comment = $state("");
let showComment = $state(false);
let selectedTargetStateId = $state("");

onMount(async () => {
    try {
        const [wfRes, instRes] = await Promise.all([
            fetch(`/api/workflows?collectionId=${collectionId}`),
            fetch(`/api/workflows?entryId=${entryId}`)
        ]);

        const wfData = await wfRes.json();
        const instData = await instRes.json();

        if (wfData.success) workflow = wfData.data;
        if (instData.success) instance = instData.data;
    } catch (err) {
        console.error("Failed to load workflow data:", err);
    } finally {
        loading = false;
    }
});

async function triggerTransition(targetStateId: string) {
    loading = true;
    try {
        const res = await fetch('/api/workflows', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                entryId,
                targetStateId,
                comment
            })
        });

        const data = await res.json();
        if (data.success) {
            instance = data.data;
            toast.success("State transitioned successfully");
            showComment = false;
            comment = "";
        } else {
            toast.error(data.message || "Transition failed");
        }
    } catch (err) {
        toast.error("Network error during transition");
    } finally {
        loading = false;
    }
}

const currentState = $derived.by(() => {
	const currentInstance = instance;
	if (!currentInstance || !workflow) return null;
	return workflow.states.find((s) => s.id === currentInstance.currentState) || null;
});

const availableTransitions = $derived.by(() => {
	const currentInstance = instance;
	if (!currentInstance || !workflow) return [];
	return workflow.transitions.filter((t) => t.from === currentInstance.currentState);
});
</script>

{#if !loading && workflow}
    <div class="card p-4 border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 shadow-sm space-y-4" in:fade>
        <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
                <iconify-icon icon="mdi:state-machine" class="text-tertiary-500 dark:text-primary-500 text-xl"></iconify-icon>
                <h3 class="text-sm font-bold uppercase tracking-wider opacity-50">Workflow Status</h3>
            </div>
            {#if currentState}
                <div class="badge flex items-center gap-2 px-3 py-1 font-bold text-xs" style:background-color="{currentState.color}20" style:color={currentState.color} style:border="1px solid {currentState.color}40">
                    <div class="h-2 w-2 rounded-full" style:background-color={currentState.color}></div>
                    {currentState.label}
                </div>
            {/if}
        </div>

        {#if !instance}
             <div class="p-4 rounded bg-surface-50 dark:bg-surface-950 text-center border-2 border-dashed border-surface-200 dark:border-surface-800">
                <p class="text-xs italic opacity-40 mb-2">No active workflow instance for this entry.</p>
                <Button variant="tertiary" onclick={() => triggerTransition(workflow?.states.find(s => s.isInitial)?.id || '')} size="sm" class="dark:">
                                    Start Workflow
                </Button>
             </div>
        {:else}
            <div class="space-y-3">
                <div class="flex flex-wrap gap-2">
                    {#each availableTransitions as trans}
                        <Button variant="primary"
                            onclick={() => { selectedTargetStateId = trans.to; showComment = true; }}
                            aria-label={trans.label}
                            size="sm"
                            class="text-xs">
                            {trans.label} ➔
                        </Button>
                    {/each}

                    {#if availableTransitions.length === 0}
                        <p class="text-xs italic opacity-40">This entry has reached a final state or no transitions are available.</p>
                    {/if}
                </div>

                {#if showComment}
                    <div class="space-y-3 pt-3 border-t border-surface-200 dark:border-surface-800" transition:slide>
                        <textarea
                            bind:value={comment}
                            placeholder="Add a comment (optional)..."
                            class="textarea text-xs bg-surface-50 dark:bg-surface-950 border-none rounded focus:ring-primary-500"
                            rows="2"
                         aria-label="Textarea"></textarea>
                        <div class="flex justify-end gap-2">
                                <Button variant="ghost" onclick={() => showComment = false} size="sm" class="text-[10px]">Cancel</Button>
                                <Button variant="tertiary" onclick={() => triggerTransition(selectedTargetStateId)} size="sm" class="text-[10px]">Confirm Move</Button>
                        </div>
                    </div>
                {/if}
            </div>

            <!-- History Summary -->
            {#if instance && instance.history.length > 0}
                <div class="pt-2 border-t border-surface-200 dark:border-surface-800">
                    <p class="text-[10px] font-bold opacity-30 uppercase mb-2">Recent History</p>
                    <div class="space-y-2">
                        {#if instance && instance.history}
                            {#each instance.history.slice(-3).reverse() as log}
                                <div class="text-[10px] flex items-center justify-between opacity-60">
                                    <span>{workflow.states.find(s => s.id === log.fromState)?.label} ➔ {workflow.states.find(s => s.id === log.toState)?.label}</span>
                                    <span>{new Date(log.timestamp).toLocaleDateString()}</span>
                                </div>
                            {/each}
                        {/if}
                    </div>
                </div>
            {/if}
        {/if}
    </div>
{/if}
