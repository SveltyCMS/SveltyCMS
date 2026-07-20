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
import { SvelteSet } from "svelte/reactivity";
	import Button from '@components/ui/button.svelte';

interface Props {
	filteredFiles?: (MediaBase | MediaImage)[];
	gridSize?: "tiny" | "small" | "medium" | "large";
	isSelectionMode?: boolean;
	selectedFiles: SvelteSet<string>;
	publishedMediaIds?: SvelteSet<string>;
	onEditImage?: (file: MediaImage) => void;
	onOpenFileDetails?: (file: MediaBase | MediaImage) => void;
}

let {
	filteredFiles = [],
	gridSize = "medium",
	isSelectionMode = false,
	selectedFiles = $bindable(),
	publishedMediaIds = $bindable(new SvelteSet<string>()),
	onEditImage = () => {},
	onOpenFileDetails = () => {},
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
			class="absolute top-0 inset-s-0 w-full grid gap-4 p-4"
			style:transform="translateY({startRow * itemHeight}px)"
			style:grid-template-columns="repeat({itemsPerRow}, 1fr)"
		>
			{#each visibleItems as file (file._id || file.filename)}
				{const isSelected = selectedFiles.has(file._id?.toString() || file.filename)}

				<div
					role="button"
					tabindex="0"
					class="group relative flex flex-col overflow-hidden rounded-lg border bg-white shadow-sm transition-all duration-200 dark:bg-surface-900
                        hover:z-10 hover:-translate-y-1 hover:shadow-lg focus:ring-4 focus:ring-primary-500 text-start cursor-pointer
                        {isSelected ? 'border-primary-500 ring-2 ring-primary-500/20' : 'border-surface-200 dark:border-surface-800'}"
					style:height="{itemHeight - 32}px"
					onclick={() => isSelectionMode ? toggleSelection(file) : onOpenFileDetails(file)}
					onkeydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							if (isSelectionMode) {
								toggleSelection(file);
							} else {
								onOpenFileDetails(file);
							}
						}
					}}
					aria-label="{file.filename}, {isSelected ? 'selected' : 'not selected'}"
				>
					<!-- Selection Overlay -->
					{#if isSelectionMode || isSelected}
						<div class="absolute inset-s-2 top-2 z-20">
							<div class="h-6 w-6 rounded-full bg-white shadow-md flex items-center justify-center">
								<input aria-label="Input"
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
							<img src={file.url} alt="" class="h-full w-full object-cover" loading="lazy" crossorigin="anonymous" />
						{:else}
							<div class="h-full w-full flex items-center justify-center opacity-30">
								<iconify-icon icon="mdi:file-document-outline" width={48}></iconify-icon>
							</div>
						{/if}

						<!-- Action Dock (Hover) -->
						<div class="absolute inset-e-2 top-2 z-30 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
							<Button variant="ghost"
								onclick={(e: MouseEvent) => { e.stopPropagation(); onEditImage(file as MediaImage); }}
								aria-label="Edit {file.filename}"
							 class="p-0! min-w-0 bg-white/90 dark:bg-surface-800/90 shadow-sm">
								<iconify-icon icon="mdi:pencil" width={16}></iconify-icon>
							</Button>
						</div>
					</div>

					<!-- Footer -->
					<div class="p-2 border-t border-surface-100 dark:border-surface-800">
						<div class="truncate text-[10px] font-bold uppercase tracking-tighter opacity-60 mb-0.5">{file.filename}</div>
						<div class="text-[9px] font-mono opacity-40">{formatBytes((file as MediaImage).size)}</div>
					</div>
				</div>
			{/each}
		</div>
	</div>
</div>
