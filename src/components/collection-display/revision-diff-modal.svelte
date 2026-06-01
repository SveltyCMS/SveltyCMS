<!--
@file src/components/collection-display/revision-diff-modal.svelte
@component Smart Diff Modal for Revision Comparison (Hardened)
 -->
<script lang="ts">
import { computeFieldDiff } from "@src/utils/diff-utils";
import { fade, slide } from "svelte/transition";
import type { FieldInstance } from "@src/content/types";

interface Props {
    oldData: Record<string, unknown>;
    newData: Record<string, unknown>;
    fields?: FieldInstance[];
    oldLabel?: string;
    newLabel?: string;
    close?: () => void;
}

const { oldData, newData, fields = [], oldLabel = "Previous", newLabel = "Current", close }: Props = $props();

let showOnlyChanged = $state(true);
const diffs = $derived(computeFieldDiff(oldData, newData, fields));
const filteredDiffs = $derived(showOnlyChanged ? diffs.filter(d => d.type !== 'unchanged') : diffs);

// Stats summary
const stats = $derived({
    added: diffs.filter(d => d.type === 'added').length,
    modified: diffs.filter(d => d.type === 'modified').length,
    removed: diffs.filter(d => d.type === 'removed').length,
    unchanged: diffs.filter(d => d.type === 'unchanged').length
});

function formatValue(val: unknown): string {
    if (val === null || val === undefined) return 'None';
    if (typeof val === 'object') return JSON.stringify(val, null, 2);
    return String(val);
}

// Keyboard dismiss (D4)
function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') close?.();
}
</script>

<svelte:window onkeydown={onKeydown} />

<div 
    class="flex flex-col h-[80vh] w-full max-w-5xl bg-white dark:bg-surface-900 rounded-2xl shadow-2xl border border-surface-200 dark:border-surface-800 overflow-hidden" 
    in:fade
    role="dialog"
    aria-modal="true"
    aria-labelledby="diff-modal-title"
>
    <!-- Header -->
    <div class="p-6 border-b border-surface-200 dark:border-surface-800 flex items-center justify-between bg-surface-50/50 dark:bg-surface-950/20">
        <div>
            <h2 id="diff-modal-title" class="text-xl font-bold flex items-center gap-2">
                <iconify-icon icon="mdi:compare" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
                Smart Diff Analysis
            </h2>
            <!-- Diff Statistics Summary (D7) -->
            <div class="flex gap-3 mt-1 items-center">
                <span class="text-[10px] font-bold opacity-50 uppercase tracking-wider">Analysis:</span>
                <div class="flex gap-2 items-center">
                    {#if stats.added > 0}
                        <span class="badge preset-filled-success-500 text-[9px] px-1.5 py-0.5">+{stats.added}</span>
                    {/if}
                    {#if stats.modified > 0}
                        <span class="badge preset-filled-warning-500 text-[9px] px-1.5 py-0.5">~{stats.modified}</span>
                    {/if}
                    {#if stats.removed > 0}
                        <span class="badge preset-filled-error-500 text-[9px] px-1.5 py-0.5">-{stats.removed}</span>
                    {/if}
                    <span class="text-[9px] opacity-40 font-medium italic">{stats.unchanged} unchanged</span>
                </div>
            </div>
        </div>
        <div class="flex items-center gap-4">
            <label class="flex items-center gap-2 cursor-pointer bg-surface-200 dark:bg-surface-800 px-3 py-1.5 rounded-full transition-colors hover:bg-surface-300 dark:hover:bg-surface-700">
                <input type="checkbox" bind:checked={showOnlyChanged} class="checkbox checkbox-sm" />
                <span class="text-xs font-bold">Show Only Changes</span>
            </label>
            <button class="btn btn-sm variant-soft-surface" onclick={close} aria-label="Close dialog">Close</button>
        </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto p-6 space-y-4">
        {#if filteredDiffs.length === 0}
            <div class="h-full flex flex-col items-center justify-center opacity-40 italic">
                <iconify-icon icon="mdi:check-circle-outline" width="48" class="mb-2 text-success-500"></iconify-icon>
                <p>No differences detected between these versions.</p>
            </div>
        {:else}
            <div class="grid grid-cols-1 gap-4">
                {#each filteredDiffs as diff (diff.fieldName)}
                    <div class="group border border-surface-200 dark:border-surface-800 rounded-xl overflow-hidden transition-all hover:border-tertiary-500 dark:border-primary-500/50" in:slide>
                        <!-- Field Header -->
                        <div class="px-4 py-2 bg-surface-50 dark:bg-surface-950 flex items-center justify-between border-b border-surface-200 dark:border-surface-800">
                            <div class="flex flex-col">
                                <span class="text-xs font-bold opacity-40 uppercase tracking-tighter">{diff.fieldName}</span>
                                <span class="font-mono text-sm font-bold text-tertiary-600 dark:text-primary-600 dark:text-primary-500">{diff.label}</span>
                            </div>
                            <span class="badge 
                                {diff.type === 'added' ? 'preset-filled-success-500' : 
                                 diff.type === 'removed' ? 'preset-filled-error-500' : 
                                 diff.type === 'modified' ? 'preset-filled-warning-500' : 
                                 'preset-tonal-surface'} text-[10px] uppercase font-bold">
                                {diff.type}
                            </span>
                        </div>

                        <!-- Diff Content -->
                        <div class="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-surface-200 dark:divide-surface-800">
                            <!-- Left: Old Value -->
                            <div class="p-4 bg-surface-50/30 dark:bg-surface-900/30">
                                <p class="text-[10px] uppercase font-bold opacity-30 mb-2">{oldLabel}</p>
                                <pre class="text-xs font-mono whitespace-pre-wrap break-all 
                                    {diff.type === 'removed' || diff.type === 'modified' ? 'text-error-600 dark:text-error-500' : 'opacity-40'}">
                                    {formatValue(diff.oldValue)}
                                </pre>
                            </div>
                            <!-- Right: New Value -->
                            <div class="p-4 bg-tertiary-500 dark:bg-primary-500/5 dark:bg-primary-500/5">
                                <p class="text-[10px] uppercase font-bold opacity-30 mb-2">{newLabel}</p>
                                <pre class="text-xs font-mono whitespace-pre-wrap break-all 
                                    {diff.type === 'added' || diff.type === 'modified' ? 'text-success-600 dark:text-success-400' : 'opacity-40'}">
                                    {formatValue(diff.newValue)}
                                </pre>
                            </div>
                        </div>
                    </div>
                {/each}
            </div>
        {/if}
    </div>

    <!-- Footer -->
    <div class="p-4 bg-surface-100 dark:bg-surface-950 border-t border-surface-200 dark:border-surface-800 flex justify-between items-center">
        <div class="flex gap-4 text-[10px] font-bold opacity-50 uppercase">
            <span class="flex items-center gap-1"><div class="h-2 w-2 rounded-full bg-success-500"></div> Added</span>
            <span class="flex items-center gap-1"><div class="h-2 w-2 rounded-full bg-error-500"></div> Removed</span>
            <span class="flex items-center gap-1"><div class="h-2 w-2 rounded-full bg-warning-500"></div> Modified</span>
        </div>
        <p class="text-[10px] font-medium opacity-40 italic">Smart Diff v1.1 — Forensic Content Analysis</p>
    </div>
</div>
