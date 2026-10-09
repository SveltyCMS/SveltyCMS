<!--
@files src/routes/(app)/config/collectionbuilder/[...contentTypes]/tabs/CollectionWidget/ModalSelectWidget.svelte
@component
**This component displays a modal for selecting a widget**
-->

<script lang="ts">
	// Using iconify-icon web component
	// Modern widget system
	import { widgets } from '@src/stores/widget-store.svelte.ts';
	import {
		widget_select_category_suffix,
		widget_select_no_match,
		widget_select_search_aria,
		widget_select_search_placeholder
	} from '@src/paraglide/messages';
	import { logger } from '@utils/logger';
	// Native UI Components Stores
	import { modalState } from '@utils/modal.svelte';
	import { onMount } from 'svelte';

	// Props
	interface Props {
		/** Exposes parent props to this component. */
		parent?: any;
		/** Close handler injected by DialogManager. */
		close?: (result?: any) => void;
	}
	const { close }: Props = $props();

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
			if (close) {
				close({ selectedWidget: selected });
			} else {
				modalState.close({ selectedWidget: selected });
			}
		} else {
			logger.error('No widget selected');
		}
	}

	// Base Classes
	const cBase = 'flex flex-col w-full h-full';
</script>

{#if modalState.active}
	<div class={cBase}>
		<!-- Search -->
		<div class="relative mb-6 mt-2">
			<iconify-icon
				icon="mdi:magnify"
				width="24"
				class="absolute inset-s-4 top-1/2 -translate-y-1/2 text-surface-400"
			></iconify-icon>
			<input
				type="text"
				aria-label={widget_select_search_aria()}
				data-testid="select-widget-search"
				placeholder={widget_select_search_placeholder()}
				class="input h-12 w-full ps-12 text-lg"
				bind:value={searchTerm}
			/>
		</div>

		<!-- Grid -->
		<div data-testid="select-widget-grid">
			{#each ['Core', 'Custom', 'Marketplace'] as category (category)}
				{const categoryKeys =
					category === 'Core'
						? widgets.coreWidgets
						: category === 'Custom'
							? widgets.customWidgets
							: category === 'Marketplace'
								? widgets.marketplaceWidgets
								: []}

				{const filteredKeys = categoryKeys.filter(
					(key) => !searchTerm || key.toLowerCase().includes(searchTerm.toLowerCase())
				)}

				{#if filteredKeys.length > 0}
					<div class="mb-8 last:mb-0">
						<h3
							class="mb-4 text-xl font-bold uppercase tracking-wider text-surface-500 dark:text-surface-50"
						>
							{widget_select_category_suffix({ category })}
						</h3>
						<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
							{#each filteredKeys as item (item)}
								{#if item && (availableWidgets[item] as any)?.GuiSchema}
									<button
										type="button"
										onclick={() => onFormSubmit(item)}
										class="group relative flex flex-col gap-3 rounded-xl border border-surface-500/30 bg-white p-5 text-start shadow-xs transition-all hover:-translate-y-1 hover:border-tertiary-500 hover:shadow-lg dark:border-surface-500/40 dark:bg-surface-800 dark:hover:border-primary-500"
										aria-label={`Select ${item} widget`}
										data-testid={`select-widget-${String(item).toLowerCase()}`}
									>
										<div class="flex items-start justify-between w-full">
											<div
												class="flex h-12 w-12 items-center justify-center rounded-lg bg-tertiary-500/10 text-tertiary-600 transition-colors group-hover:bg-tertiary-500 dark:group-hover:bg-primary-500 group-hover:text-white dark:bg-surface-700 dark:text-primary-400"
											>
												<iconify-icon icon={availableWidgets[item]?.Icon || 'mdi:puzzle'} width="28"
												></iconify-icon>
											</div>
											<!-- Optional: Add specific badges here if metadata existed -->
										</div>

										<div>
											<h3
												class="text-lg font-bold text-surface-900 group-hover:text-tertiary-600 dark:text-white dark:group-hover:text-primary-400"
											>
												{item}
											</h3>
											<p class="mt-1 line-clamp-2 text-xs text-surface-500 dark:text-surface-400">
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
			{#if [...widgets.coreWidgets, ...widgets.customWidgets, ...widgets.marketplaceWidgets].filter( (key) => key
						.toLowerCase()
						.includes(searchTerm.toLowerCase()) ).length === 0}
				<div class="flex flex-col items-center justify-center py-20 opacity-50">
					<iconify-icon icon="mdi:help-circle" width="24"></iconify-icon>
					<p class="text-xl">{widget_select_no_match({ term: searchTerm })}</p>
				</div>
			{/if}
		</div>
	</div>
{/if}
