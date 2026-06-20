<!-- 
@file src/routes/(app)/mediagallery/batch-processor.svelte
@component Batch Image Transformation Engine
 -->
<script lang="ts">
import { toast } from "@src/stores/toast.svelte.ts";
import { logger } from "@utils/logger";
import { slide } from "svelte/transition";
import type { SvelteSet } from "svelte/reactivity";
import AdminCard from '@components/admin-card.svelte';
import Button from '@components/ui/button.svelte';
import Input from '@components/ui/input.svelte';
import Select from '@components/ui/select.svelte';

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

const presetOptions = presets.map((p) => ({ value: p.id, label: p.label }));

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

<div class="pointer-events-none fixed inset-x-0 bottom-0 z-50 p-4">
	<div transition:slide={{ axis: 'y', duration: 300 }}>
	<AdminCard
		class="pointer-events-auto mx-auto max-w-4xl border border-tertiary-500 bg-surface-100 p-6 shadow-2xl dark:border-primary-500/30 dark:bg-surface-800"
	>
		<div class="mb-6 flex items-center justify-between">
			<div class="flex items-center gap-3">
				<div class="flex h-10 w-10 items-center justify-center rounded-full bg-tertiary-500 font-bold text-white shadow-lg dark:bg-primary-500">
					{selectedIds.size}
				</div>
				<div>
					<h3 class="text-lg font-bold">Batch Processor</h3>
					<p class="font-mono text-xs uppercase tracking-widest opacity-50">Sharp.js Multi-Asset Engine</p>
				</div>
			</div>
			<Button variant="surface" onclick={onClose} aria-label="Close" class="min-w-0 p-0!">
				<iconify-icon icon="mdi:close" width="20"></iconify-icon>
			</Button>
		</div>

		<div class="grid grid-cols-1 gap-6 md:grid-cols-3">
			<!-- Step 1: Operation -->
			<div class="space-y-3">
				<span class="block text-[10px] font-bold uppercase tracking-widest opacity-60">1. Select Action</span>
				<div class="flex flex-col gap-2">
					<Button
						variant="tertiary"
						onclick={() => operation = 'filter'}
						size="sm"
						class="justify-start gap-2 {operation === 'filter' ? ' dark: ' : ' '}"
					>
						<iconify-icon icon="mdi:auto-fix" width="18"></iconify-icon>
						Apply Filter
					</Button>
					<Button
						variant="tertiary"
						onclick={() => operation = 'resize'}
						size="sm"
						class="justify-start gap-2 {operation === 'resize' ? ' dark: ' : ' '}"
					>
						<iconify-icon icon="mdi:resize" width="18"></iconify-icon>
						Batch Resize
					</Button>
				</div>
			</div>

			<!-- Step 2: Params -->
			<div class="space-y-3 border-x border-surface-200 px-6 dark:border-surface-700">
				<span class="label text-[10px] font-bold uppercase tracking-widest opacity-60">2. Configure</span>
				{#if operation === 'filter'}
					<Select
						bind:value={filterPreset}
						options={presetOptions}
						placeholder="Filter preset"
						size="sm"
					/>
				{:else}
					<Input
						id="batch-width"
						type="number"
						bind:value={width}
						label="Width (px)"
						aria-label="Batch resize width in pixels"
					/>
				{/if}
			</div>

			<!-- Step 3: Run -->
			<div class="flex flex-col justify-end">
				<Button
					variant="tertiary"
					onclick={runBatch}
					disabled={isProcessing}
					loading={isProcessing}
					class="dark: w-full gap-2 shadow-xl"
				>
					{#if !isProcessing}
						<iconify-icon icon="mdi:play-circle" width="20"></iconify-icon>
					{/if}
					Run {selectedIds.size} Assets
				</Button>
			</div>
		</div>
	</AdminCard>
	</div>
</div>