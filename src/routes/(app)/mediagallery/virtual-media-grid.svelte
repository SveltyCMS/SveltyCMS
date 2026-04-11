<!--
@file src/routes/(app)/mediagallery/VirtualMediaGrid.svelte
@component
**High-performance Virtual Grid for 10,000+ assets**
Features:
- Optimized rendering with windowing
- Keyboard selection and navigation
- Smooth scroll integration
-->

<script lang="ts">
import type { MediaBase, MediaImage } from "@utils/media/media-models";
import { formatBytes } from "@utils/utils";
import { onMount } from "svelte";
import type { SvelteSet } from "svelte/reactivity";

interface Props {
	filteredFiles?: (MediaBase | MediaImage)[];
	gridSize?: "tiny" | "small" | "medium" | "large";
	isSelectionMode?: boolean;
	selectedFiles: SvelteSet<string>;
	onEditImage?: (file: MediaImage) => void;
}

let {
	filteredFiles = [],
	gridSize = "medium",
	isSelectionMode = false,
	selectedFiles = $bindable(),
	onEditImage = () => {},
}: Props = $props();

// Virtual scrolling state
let container: HTMLDivElement | undefined = $state();
let scrollTop = $state(0);
let viewportHeight = $state(600);

const itemHeight = $derived(
	gridSize === "tiny"
		? 120
		: gridSize === "small"
			? 180
			: gridSize === "medium"
				? 280
				: 400,
);
const itemWidth = $derived(
	gridSize === "tiny"
		? 100
		: gridSize === "small"
			? 160
			: gridSize === "medium"
				? 240
				: 360,
);

let itemsPerRow = $state(4);

function updateLayout() {
	if (!container) return;
	itemsPerRow = Math.max(1, Math.floor(container.clientWidth / itemWidth));
	viewportHeight = container.clientHeight;
}

const totalRows = $derived(Math.ceil(filteredFiles.length / itemsPerRow));
const startRow = $derived(Math.max(0, Math.floor(scrollTop / itemHeight) - 1));
const endRow = $derived(
	Math.min(totalRows, startRow + Math.ceil(viewportHeight / itemHeight) + 2),
);

const visibleItems = $derived(
	filteredFiles.slice(startRow * itemsPerRow, endRow * itemsPerRow),
);

function toggleSelection(file: MediaBase | MediaImage) {
	const id = file._id?.toString() || file.filename;
	if (selectedFiles.has(id)) selectedFiles.delete(id);
	else selectedFiles.add(id);
}

onMount(() => {
	updateLayout();
	const ro = new ResizeObserver(updateLayout);
	if (container) ro.observe(container);
	return () => ro.disconnect();
});
</script>

<div 
	bind:this={container}
	class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden relative scroll-smooth"
	onscroll={(e) => scrollTop = (e.target as HTMLElement).scrollTop}
>
	<div 
		class="w-full relative" 
		style:height="{totalRows * itemHeight}px"
	>
		<div 
			class="absolute top-0 left-0 w-full grid gap-4 p-4"
			style:transform="translateY({startRow * itemHeight}px)"
			style:grid-template-columns="repeat({itemsPerRow}, 1fr)"
		>
			{#each visibleItems as file (file._id || file.filename)}
				{@const isSelected = selectedFiles.has(file._id?.toString() || file.filename)}
				
				<div 
					role="button"
					tabindex="0"
					class="group relative flex flex-col overflow-hidden rounded-2xl border bg-white dark:bg-surface-900 shadow-sm transition-all duration-200 
                        hover:z-10 hover:-translate-y-1 hover:shadow-lg focus:ring-4 focus:ring-primary-500 text-left cursor-pointer
                        {isSelected ? 'border-primary-500 ring-2 ring-primary-500/20' : 'border-surface-200 dark:border-surface-800'}"
					style:height="{itemHeight - 32}px"
					onclick={() => isSelectionMode ? toggleSelection(file) : null}
					onkeydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							if (isSelectionMode) toggleSelection(file);
						}
					}}
					aria-label="{file.filename}, {isSelected ? 'selected' : 'not selected'}"
				>
					<!-- Selection Overlay -->
					{#if isSelectionMode || isSelected}
						<div class="absolute left-2 top-2 z-20">
							<div class="h-6 w-6 rounded-full bg-white shadow-md flex items-center justify-center">
								<input 
									type="checkbox" 
									checked={isSelected}
									onchange={() => toggleSelection(file)}
									class="checkbox h-4 w-4"
									onclick={(e) => e.stopPropagation()}
								/>
							</div>
						</div>
					{/if}

					<!-- Main Preview -->
					<div class="relative flex-1 bg-surface-100 dark:bg-surface-800 overflow-hidden">
						{#if file.type === 'image'}
							<img src={file.url} alt="" class="h-full w-full object-cover" loading="lazy" />
						{:else}
							<div class="h-full w-full flex items-center justify-center opacity-30">
								<iconify-icon icon="mdi:file-document-outline" width={48}></iconify-icon>
							</div>
						{/if}
						
						<!-- Action Dock (Hover) -->
						<div class="absolute right-2 top-2 z-30 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
							<button 
								onclick={(e) => { e.stopPropagation(); onEditImage(file as MediaImage); }}
								class="btn-icon btn-icon-sm bg-white/90 dark:bg-surface-800/90 shadow-sm"
								aria-label="Edit {file.filename}"
							>
								<iconify-icon icon="mdi:pencil" width={16}></iconify-icon>
							</button>
						</div>
					</div>

					<!-- Footer -->
					<div class="p-2 border-t border-surface-100 dark:border-surface-800">
						<div class="truncate text-[10px] font-bold uppercase tracking-tighter opacity-60 mb-0.5">{file.filename}</div>
						<div class="text-[9px] font-mono opacity-40">{formatBytes(file.size)}</div>
					</div>
				</div>
			{/each}
		</div>
	</div>
</div>
