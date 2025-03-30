<!-- 
@files src/routes/(app)/config/collectionbuilder/[...contentTypes]/tabs/CollectionWidget/ModalSelectWidget.svelte
@component
**This component displays a modal for selecting a widget**
-->

<script lang="ts">
	// Components
	import widgets from '@widgets';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton
	import { Modal, popup, type PopupSettings } from '@skeletonlabs/skeleton-svelte';

	// Define the shape of the data passed on submit
	type SelectWidgetData = {
		selectedWidget: WidgetType;
	};

	// Props
	interface Props {
		open?: boolean; // Add open prop
		onSubmit: (data: SelectWidgetData) => void; // Callback prop for submit (Removed duplicate)
		onClose: () => void; // Callback prop for close
		// Remove parent and existingCategory props
	}

	let { open = $bindable(), onSubmit, onClose }: Props = $props();

	// Define the search term variable
	let searchTerm: string = $state('');

	// Define the widget type
	type WidgetType = keyof typeof widgets;

	// Get the keys of the widgets object
	const widget_keys = Object.keys(widgets) as WidgetType[];

	// Define the selected widget variable
	let selected: WidgetType | null = $state(null);

	// Log changes in an effect - Keep if useful for debugging
	$effect(() => {
		// console.log('Widget keys:', widget_keys);
		// console.log('Search term:', searchTerm);
	});

	// Submit function now calls the onSubmit prop
	function onFormSubmit(): void {
		if (selected !== null) {
			// console.log('Submitting form...');
			// console.log('Selected widget:', selected);
			// console.log('GuiSchema for selected widget:', widgets[selected]?.GuiSchema);
			onSubmit({ selectedWidget: selected });
			// Parent handles closing via bind:open
		} else {
			console.error('No widget selected');
		}
	}

	// Call tooltip - Use correct import path for popup
	function getIconTooltip(item: WidgetType): PopupSettings {
		// Corrected return statement
		return {
			event: 'hover',
			target: item as string,
			placement: 'top' // Example placement
		};
	}
</script>

<Modal
	{open}
	onOpenChange={(e: { open: boolean }) => {
		// Add type to event parameter
		if (!e.open) {
			onClose(); // Call onClose if closed externally
		}
	}}
	contentBase="card bg-surface-100-900 p-4 md:p-6 space-y-4 shadow-xl max-w-screen-lg rounded-lg"
	backdropClasses="backdrop-blur-sm"
>
	<!-- Modal Content -->
	{#snippet content()}
		<header class="border-surface-300-700 flex items-center justify-between border-b pb-4">
			<h2 class="h2">Select a Widget</h2>
			<button type="button" class="btn-icon btn-icon-sm variant-soft hover:variant-ghost" aria-label="Close modal" onclick={onClose}>
				<iconify-icon icon="mdi:close" width="20"></iconify-icon>
			</button>
		</header>

		<article class="text-center">Select your widget by clicking on it.</article>

		<div class="space-y-4">
			<input type="text" placeholder="Search widgets..." class="input w-full" bind:value={searchTerm} />

			<div class="grid max-h-96 grid-cols-1 items-center justify-center gap-2 overflow-y-auto sm:grid-cols-2 md:grid-cols-3 md:gap-3">
				<!-- Use type assertion as workaround for widget type issues -->
				{#each widget_keys.filter((item) => item !== null && widgets[item]) as item}
					{@const widget = widgets[item] as any}
					{#if widget?.GuiSchema}
						{#if item.toLowerCase().includes(searchTerm.toLowerCase())}
							<button
								type="button"
								onclick={() => {
									// console.log('Widget selected:', item);
									selected = item;
									onFormSubmit(); // Submit immediately on click
								}}
								aria-label={`Select ${item} widget`}
								class="preset-outline-warning btn hover:preset-tonal-warning border-warning-500 relative flex items-center justify-start gap-1 border"
							>
								<!-- Use widget variable with optional chaining -->
								<iconify-icon icon={widget?.Icon ?? 'mdi:help-box'} width="22" class="text-tertiary-500 mr-1"></iconify-icon>
								<span class="text-surface-700 dark:text-white">{item}</span>

								<!-- helpericon -->
								{#if widget?.Description}
									<iconify-icon
										icon="material-symbols:info-outline"
										width="18"
										use:popup={getIconTooltip(item)}
										class="text-primary-500 absolute -top-1 -right-1"
									></iconify-icon>
									<!-- IconTooltip -->
									<div class="card preset-filled-secondary-500 z-50 max-w-xs p-2 text-sm" data-popup={item}>
										<!-- Use widget variable -->
										{widget?.Description}
										<div class="preset-filled-secondary-500 arrow"></div>
									</div>
								{/if}
							</button>
						{/if}
					{/if}
				{/each}
			</div>
		</div>

		<footer class="flex justify-end pt-4">
			<button type="button" class="btn variant-soft" onclick={onClose}>{m.button_cancel()}</button>
			<!-- Submit happens on widget click, no explicit save button needed here -->
		</footer>
	{/snippet}
</Modal>
