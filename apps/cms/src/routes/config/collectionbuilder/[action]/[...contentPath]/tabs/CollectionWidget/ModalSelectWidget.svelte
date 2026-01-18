<!-- 
@files src/routes/(app)/config/collectionbuilder/[...contentTypes]/tabs/CollectionWidget/ModalSelectWidget.svelte
@component
**This component displays a modal for selecting a widget**
-->

<script lang="ts">
	// Modern widget system
	import { widgets } from '@cms/stores/widgetStore.svelte';
	import { logger } from '@shared/utils/logger';
	import { onMount } from 'svelte';

	// Skeleton Stores
	import { modalState } from '@shared/utils/modalState.svelte';

	// Props
	interface Props {
		/** Exposes parent props to this component. */
		parent?: any;
	}
	const { parent: _parent }: Props = $props();

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
		console.log('[ModalSelectWidget] Widget selected:', selected);
		if (selected !== null) {
			// close the modal and pass response
			console.log('[ModalSelectWidget] Closing modal with selectedWidget:', selected);
			modalState.close({ selectedWidget: selected });
		} else {
			logger.error('No widget selected');
		}
	}

	// Base Classes
	const cBase = 'card p-6 w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl bg-white dark:bg-surface-800';
</script>

{#if modalState.active}
	<div class={cBase}>
		<!-- Search -->
		<div class="relative mb-6">
			<iconify-icon icon="mdi:magnify" width="24" class="absolute left-4 top-1/2 -translate-y-1/2 text-surface-400"></iconify-icon>
			<input type="text" placeholder="Search widgets..." class="input h-12 w-full pl-12 text-lg" bind:value={searchTerm} />
		</div>

		<!-- Grid -->
		<div class="flex-1 overflow-y-auto">
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
						<h3 class="mb-2 text-center text-xl font-bold uppercase tracking-wider text-tertiary-500 dark:text-primary-500">
							{category} Widgets
						</h3>
						<div class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
							{#each filteredKeys as item}
								{#if item && (availableWidgets[item] as any)?.GuiSchema}
									<button
										onclick={() => onFormSubmit(item)}
										class="group relative flex flex-col gap-3 rounded-xl border-2 border-surface-200 bg-surface-50 p-5 text-left transition-all hover:-translate-y-1 hover:border-tertiary-500 hover:shadow-lg dark:border-surface-400 dark:text-surface-50 dark:bg-surface-800 dark:hover:border-primary-500"
										aria-label={item}
									>
										<!-- Icon and Title inline -->
										<div class="flex items-center gap-3">
											<div
												class="flex items-center justify-center text-tertiary-500 transition-colors group-hover:text-white dark:text-primary-400 dark:group-hover:text-white"
											>
												<iconify-icon icon={availableWidgets[item]?.Icon} width="24"></iconify-icon>
											</div>
											<h3 class="text-lg font-bold text-surface-900 group-hover:text-tertiary-500 dark:text-white dark:group-hover:text-primary-400">
												{item}
											</h3>
										</div>

										<!-- Description -->
										<p class="line-clamp-2 text-xs text-surface-500 dark:text-surface-50">
											{availableWidgets[item]?.Description || 'No description available'}
										</p>
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
					<iconify-icon icon="mdi:package-variant-closed" width="64" class="mb-4"></iconify-icon>
					<p class="text-xl">No widgets found for "{searchTerm}"</p>
				</div>
			{/if}
		</div>
	</div>
{/if}
