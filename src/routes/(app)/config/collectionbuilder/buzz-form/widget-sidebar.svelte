<!-- 
@files src/routes/(app)/config/collectionbuilder/BuzzForm/WidgetSidebar.svelte
@component
**This component handles the Widget Sidebar**

### Props
- `onAddWidget` {Function} - Callback function to handle widget addition

### Features
- Widget Palette
- Widget Search
- Widget Categories
- Widget Drag and Drop

-->

<script lang="ts">
	import { widgets } from '@src/stores/widget-store.svelte.ts';
	import { onMount } from 'svelte';

	// Props
	interface Props {
		onAddWidget: (widgetKey: string) => void;
	}
	const { onAddWidget }: Props = $props();

	let searchTerm = $state('');

	// Get available widgets
	const availableWidgets = $derived(widgets.widgetFunctions || {});

	onMount(async () => {
		await widgets.initialize();
	});

	// Categories for organization
	const categories = ['Core', 'Custom', 'Marketplace'];

	// Local state for dragging (palette items)
	// We need stable IDs for dndzone
	let paletteItems = $derived(
		categories.flatMap((cat) => {
			const keys = cat === 'Core' ? widgets.coreWidgets : cat === 'Custom' ? widgets.customWidgets : widgets.marketplaceWidgets;
			return keys
				.filter((key) => !searchTerm || key.toLowerCase().includes(searchTerm.toLowerCase()))
				.map((key) => ({
					id: `palette-${key}`,
					key,
					label: key,
					icon: availableWidgets[key]?.Icon || 'mdi:puzzle',
					description: availableWidgets[key]?.Description || '',
					category: cat
				}));
		})
	);

	// Palette drag handling (we don't actually want to reorder the palette, just allow dragging FROM it)
	// For "drag from palette" we use a trick: handledndfinalize doesn't remove the item if we clone it or handle it specially.
	// Actually, easier for v1 to just have click-to-add with a nice UI, and add drag later if needed,
	// but user asked for modern UX.
</script>

<div class="flex h-full min-w-0 flex-col border-r border-surface-200-800 bg-surface-50-950 p-4 w-full lg:w-72">
	<div class="mb-4 shrink-0">
		<h2 class="text-lg font-bold">Widgets</h2>
		<p class="text-xs text-surface-500">Pick a widget to add to your collection</p>
	</div>

	<!-- Search -->
	<div class="relative mb-4 shrink-0">
		<iconify-icon icon="mdi:magnify" width="18" class="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400"></iconify-icon>
		<input type="text" placeholder="Search widgets..." class="input pl-10 h-10 w-full text-sm rounded-lg" bind:value={searchTerm} />
	</div>

	<!-- Widget List -->
	<div class="min-h-0 flex-1 overflow-y-auto space-y-6">
		{#each categories as cat (cat)}
			{@const catItems = paletteItems.filter((i) => i.category === cat)}
			{#if catItems.length > 0}
				<div>
					<h3 class="mb-2 text-[10px] font-bold uppercase tracking-widest text-surface-400">{cat}</h3>
					<div class="grid grid-cols-2 gap-2">
						{#each catItems as item (item.id)}
							<button
								onclick={() => onAddWidget(item.key)}
								class="group flex min-h-[4rem] flex-col items-center justify-center rounded-xl border border-surface-200-800 bg-surface-100-900 p-3 transition-all hover:border-primary-500 hover:bg-surface-200-800 touch-manipulation"
							>
								<div
									class="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-surface-200-800 text-surface-500 group-hover:bg-primary-500 group-hover:text-white"
								>
									<iconify-icon icon={item.icon} width="24"></iconify-icon>
								</div>
								<span class="text-center text-[10px] font-medium leading-tight">{item.label}</span>
							</button>
						{/each}
					</div>
				</div>
			{/if}
		{/each}
	</div>
</div>
