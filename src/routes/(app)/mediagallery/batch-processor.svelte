<!-- 
@file src/routes/(app)/mediagallery/batch-processor.svelte
@component Batch Image Transformation Engine
 -->
<script lang="ts">
import { toast } from "@src/stores/toast.svelte.ts";
import { logger } from "@utils/logger";
import { slide } from "svelte/transition";
import type { SvelteSet } from "svelte/reactivity";

interface Props {
	selectedIds: SvelteSet<string>;
	onClose: () => void;
}

let { selectedIds, onClose }: Props = $props();

let operation = $state<"filter" | "resize" | "watermark">("filter");
let filterPreset = $state("vivid");
let width = $state(1200);
let isProcessing = $state(false);

const presets = [
	{ id: "vivid", label: "Vivid" },
	{ id: "bw", label: "B&W" },
	{ id: "sepia", label: "Sepia" },
	{ id: "dramatic", label: "Dramatic" },
];

async function runBatch() {
	isProcessing = true;

	const ids = Array.from(selectedIds);

	try {
		const response = await fetch("/api/media/batch-process", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				ids,
				operation,
				params: operation === "filter" ? { filterPreset } : { width },
			}),
		});

		if (response.ok) {
			toast.success(`Successfully processed ${ids.length} images.`);
			onClose();
		} else {
			throw new Error("Batch processing failed");
		}
	} catch (err) {
		logger.error("Batch error", err);
		toast.error("Batch processing encountered an error.");
	} finally {
		isProcessing = false;
	}
}
</script>

<div class="fixed inset-x-0 bottom-0 z-50 p-4 pointer-events-none">
	<div 
		class="mx-auto max-w-4xl bg-surface-100 dark:bg-surface-800 rounded-2xl shadow-2xl border border-primary-500/30 p-6 pointer-events-auto"
		transition:slide={{ axis: 'y', duration: 300 }}
	>
		<div class="flex items-center justify-between mb-6">
			<div class="flex items-center gap-3">
				<div class="flex h-10 w-10 items-center justify-center rounded-full bg-primary-500 text-white font-bold shadow-lg">
					{selectedIds.size}
				</div>
				<div>
					<h3 class="text-lg font-bold">Batch Processor</h3>
					<p class="text-xs opacity-50 uppercase tracking-widest font-mono">Sharp.js Multi-Asset Engine</p>
				</div>
			</div>
			<button class="btn-icon preset-tonal-surface" onclick={onClose} aria-label="Close">
				<iconify-icon icon="mdi:close" width="20"></iconify-icon>
			</button>
		</div>

		<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
			<!-- Step 1: Operation -->
			<div class="space-y-3">
				<span class="block text-[10px] font-bold uppercase tracking-widest opacity-60">1. Select Action</span>
				<div class="flex flex-col gap-2">
					<button 
						class="btn btn-sm justify-start gap-2 {operation === 'filter' ? 'preset-filled-primary-500' : 'preset-tonal-surface'}"
						onclick={() => operation = 'filter'}
					>
						<iconify-icon icon="mdi:auto-fix" width="18"></iconify-icon>
						Apply Filter
					</button>
					<button 
						class="btn btn-sm justify-start gap-2 {operation === 'resize' ? 'preset-filled-primary-500' : 'preset-tonal-surface'}"
						onclick={() => operation = 'resize'}
					>
						<iconify-icon icon="mdi:resize" width="18"></iconify-icon>
						Batch Resize
					</button>
				</div>
			</div>

			<!-- Step 2: Params -->
			<div class="space-y-3 border-x border-surface-200 dark:border-surface-700 px-6">
				<label for="batch-filter" class="label text-[10px] font-bold uppercase tracking-widest opacity-60">2. Configure</label>
				{#if operation === 'filter'}
					<select id="batch-filter" bind:value={filterPreset} class="select select-sm">
						{#each presets as p}
							<option value={p.id}>{p.label}</option>
						{/each}
					</select>
				{:else}
					<div class="input-group input-group-sm">
						<span class="input-group-shim">Width</span>
						<input id="batch-width" type="number" bind:value={width} class="input" />
						<span class="input-group-shim">px</span>
					</div>
				{/if}
			</div>

			<!-- Step 3: Run -->
			<div class="flex flex-col justify-end">
				<button 
					class="btn preset-filled-primary-500 w-full gap-2 shadow-xl"
					onclick={runBatch}
					disabled={isProcessing}
				>
					{#if isProcessing}
						<iconify-icon icon="mdi:loading" width="20" class="animate-spin"></iconify-icon>
						Processing...
					{:else}
						<iconify-icon icon="mdi:play-circle" width="20"></iconify-icon>
						Run {selectedIds.size} Assets
					{/if}
				</button>
			</div>
		</div>
	</div>
</div>
