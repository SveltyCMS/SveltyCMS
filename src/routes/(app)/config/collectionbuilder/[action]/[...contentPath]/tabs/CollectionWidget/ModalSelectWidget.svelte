<!-- 
@files src/routes/(app)/config/collectionbuilder/[...contentTypes]/tabs/CollectionWidget/ModalSelectWidget.svelte
@component
**This component displays a modal for selecting a widget**
-->

<script lang="ts">
	import CircleQuestionMark from '@lucide/svelte/icons/circle-question-mark';
	import Search from '@lucide/svelte/icons/search';
	import X from '@lucide/svelte/icons/x';

	// Using iconify-icon web component
	// Modern widget system
	import { widgets } from '@stores/widgetStore.svelte.ts';
	import { logger } from '@utils/logger';
	import { onMount } from 'svelte';

	// Skeleton Stores
	import { modalState } from '@utils/modalState.svelte';

	// Props
	interface Props {
		/** Exposes parent props to this component. */
		parent: any;
	}
	const { parent }: Props = $props();

	// Define the search term variable
	let searchTerm: string = $state('');

	// Get available widgets from the modern store
	const availableWidgets = $derived(widgets.widgetFunctions || {});

	// Initialize widgets on mount
	onMount(async () => {
		await widgets.initialize();
	});

	// We've created a custom submit function to pass the response and close the modal.
	function onFormSubmit(selected: any): void {
		if (selected !== null) {
			// close the modal and pass response
			modalState.close({ selectedWidget: selected });
		} else {
			logger.error('No widget selected');
		}
	}

	// Base Classes
	const cBase = 'card p-6 w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl bg-white dark:bg-surface-800';
	const cHeader = 'text-3xl font-bold text-center mb-6 text-surface-900 dark:text-white';

	// Tooltip not needed with new card design showing description
</script>

{#if modalState.active}
	<div class={cBase}>
		<header class="flex items-center justify-between border-b border-surface-200 pb-4 dark:text-surface-50">
			<h2 class={cHeader}>
				{modalState.active?.props?.title || 'Select Widget'}
			</h2>
			<button class="btn-icon preset-outlined-surface-500" onclick={parent.onClose} aria-label="Close modal">
				<X size={24} />
			</button>
		</header>

		<!-- Search -->
		<div class="relative my-4">
			<Search size={24} class="absolute left-4 top-1/2 -translate-y-1/2 text-surface-400" />
			<input type="text" placeholder="Search widgets..." class="input h-12 w-full pl-12 text-lg" bind:value={searchTerm} />
		</div>

		<!-- Grid -->
		<div class="flex-1 overflow-y-auto p-6">
			{#each ['Core', 'Custom', 'Marketplace'] as category}
				{@const categoryKeys =
					category === 'Core'
						? widgets.coreWidgets
						: category === 'Custom'
							? widgets.customWidgets
							: category === 'Marketplace'
								? widgets.marketplaceWidgets
								: []}

				{@const filteredKeys = categoryKeys.filter((key) => !searchTerm || key.toLowerCase().includes(searchTerm.toLowerCase()))}

				{#if filteredKeys.length > 0}
					<div class="mb-8 last:mb-0">
						<h3 class="mb-4 text-xl font-bold uppercase tracking-wider text-surface-500 dark:text-surface-50">
							{category} Widgets
						</h3>
						<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
							{#each filteredKeys as item}
								{#if item && (availableWidgets[item] as any)?.GuiSchema}
									<button
										onclick={() => onFormSubmit(item)}
										class="group relative flex flex-col gap-3 rounded-xl border border-surface-200 bg-surface-50 p-5 text-left transition-all hover:-translate-y-1 hover:border-primary-500 hover:shadow-lg dark:text-surface-50 dark:bg-surface-800 dark:hover:border-primary-500"
										aria-label={item}
									>
										<div class="flex items-start justify-between w-full">
											<div
												class="flex h-12 w-12 items-center justify-center rounded-lg bg-surface-200 text-surface-600 transition-colors group-hover:bg-primary-500 group-hover:text-white dark:bg-surface-700 dark:text-surface-300"
											>
												{#if availableWidgets[item?.Icon as keyof typeof iconsData] as any}<Icon
														icon={availableWidgets[item?.Icon as keyof typeof iconsData] as any}
														size={28}
													/>{/if}
											</div>
											<!-- Optional: Add specific badges here if metadata existed -->
										</div>

										<div>
											<h3 class="text-lg font-bold text-surface-900 group-hover:text-primary-500 dark:text-white dark:group-hover:text-primary-400">
												{item}
											</h3>
											<p class="mt-1 line-clamp-2 text-xs text-surface-500 dark:text-surface-50">
												{availableWidgets[item]?.Description || 'No description available'}
											</p>
										</div>
									</button>
								{/if}
							{/each}
						</div>
					</div>
				{/if}
			{/each}

			<!-- Empty State -->
			{#if [...widgets.coreWidgets, ...widgets.customWidgets, ...widgets.marketplaceWidgets].filter((key) => key
					.toLowerCase()
					.includes(searchTerm.toLowerCase())).length === 0}
				<div class="flex flex-col items-center justify-center py-20 opacity-50">
					<CircleQuestionMark size={24} />
					<p class="text-xl">No widgets found for "{searchTerm}"</p>
				</div>
			{/if}
		</div>
	</div>
{/if}
