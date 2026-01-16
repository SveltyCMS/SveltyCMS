<!-- 
@files src/routes/(app)/config/collectionbuilder/[...contentTypes]/tabs/CollectionWidget/ModalSelectWidget.svelte
@component
**This component displays a modal for selecting a widget**
-->

<script lang="ts">
	// Modern widget system
	import { activeWidgets, widgetFunctions, widgetStoreActions } from '@stores/widgetStore.svelte';
	import { logger } from '@utils/logger';
	import { widgetFunctions as widgets } from '@stores/widgetStore.svelte';
	import { onMount } from 'svelte';
	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton Stores
	import { modalState } from '@utils/modalState.svelte';

	// Props
	interface Props {
		/** Exposes parent props to this component. */
		parent?: any;
		existingCategory?: any;
		title?: string;
		body?: string;
		response?: (r: any) => void;
	}

	const { existingCategory = { name: '', icon: '' }, title, body, response }: Props = $props();

	// Define the search term variable
	let searchTerm: string = $state('');

	// Get available widgets from the modern store
	const availableWidgets = $derived($widgetFunctions || {});
	const activeWidgetList = $derived($activeWidgets || []);

	// Get only active widgets for the collection builder
	const widget_keys = $derived(Object.keys(availableWidgets).filter((key) => activeWidgetList.includes(key)));

	// Define the selected widget variable
	const selected: string | null = $state(null);

	// Initialize widgets on mount
	onMount(async () => {
		await widgetStoreActions.initializeWidgets();
	});

	// We've created a custom submit function to pass the response and close the modal.
	// We've created a custom submit function to pass the response and close the modal.
	function onFormSubmit(selected: any): void {
		if (selected !== null) {
			if (response) {
				// Set the selected widget in the form data and update the modalStore
				response({ selectedWidget: selected });
			}
			// close the modal
			modalState.close();
		} else {
			logger.error('No widget selected');
		}
	}

	// Base Classes
	const cForm = 'border border-surface-500 p-4 space-y-4 rounded-xl';
</script>

<div class="space-y-4">
	<header class="text-2xl font-bold text-center text-tertiary-500 dark:text-primary-500">
		{title ?? '(title missing)'}
	</header>
	<article class="hidden text-center sm:block">{body ?? '(body missing)'}</article>
	<!-- Enable for debugging: -->
	<form class={cForm}>
		<div class="mb-3 border-b text-center text-primary-500">Choose your Widget</div>
		<input type="text" placeholder="Search ..." class="input mb-3 w-full" bind:value={searchTerm} />

		<div class="grid grid-cols-1 items-center justify-center gap-2 sm:grid-cols-2 md:grid-cols-3 md:gap-3">
			{#each widget_keys.filter((item) => item !== null) as item}
				{#if item && $widgets[item]?.GuiSchema}
					{#if item.toLowerCase().includes(searchTerm.toLowerCase())}
						<!-- Tooltip migration -->
						<div class="relative block group">
							<button
								onclick={() => {
									onFormSubmit(item);
								}}
								aria-label={item}
								data-testid="widget-select-{item}"
								class="preset-outlined-warning-500 btn relative flex items-center justify-start gap-1 w-full {selected === item
									? 'bg-primary-500'
									: ' preset-outlined-warning-500 hover:preset-ghost-warning-500'}"
							>
								<iconify-icon icon={$widgets[item]?.Icon} width="22" class="mr-1 text-tertiary-500"></iconify-icon>
								<span class="text-surface-700 dark:text-white">{item}</span>

								<!-- helpericon -->
								<iconify-icon icon="material-symbols:info" width="20" class="absolute right-2 top-2 text-primary-500"></iconify-icon>
							</button>
							<!-- Hover Tooltip -->
							<div
								class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-xs p-2 rounded bg-surface-800 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50"
							>
								{$widgets[item]?.Description}
								<div class="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-surface-800"></div>
							</div>
						</div>
					{/if}
				{/if}
			{/each}
		</div>
	</form>

	<footer class="flex {existingCategory.name ? 'justify-between' : 'justify-end'} pt-4 border-t border-surface-500/20">
		<div class="flex gap-2">
			<button class="preset-outlined-secondary-500 btn" onclick={() => modalState.close()}>{m.button_cancel()}</button>
		</div>
	</footer>
</div>
