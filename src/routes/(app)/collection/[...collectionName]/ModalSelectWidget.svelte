<script lang="ts">
	import widgets from '@components/widgets';

	// Props
	/** Exposes parent props to this component. */
	export let parent: any;
	export let existingCategory: any = { name: '', icon: '' };

	// Stores
	import { getModalStore, popup, type PopupSettings } from '@skeletonlabs/skeleton';
	const modalStore = getModalStore();

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Define the search term variable
	let searchTerm: string = '';

	// get all the widgets
	type WidgetType = keyof typeof widgets | null;

	// Get the keys of the widgets object
	let widget_keys = Object.keys(widgets) as WidgetType[];

	// Define the selected widget variable
	let selected: WidgetType = null;

	// Define the form data object
	let formData: {
		selectedWidget: WidgetType;
	} = {
		selectedWidget: selected ?? null
	};

	// We've created a custom submit function to pass the response and close the modal.
	function onFormSubmit(): void {
		if ($modalStore[0].response) {
			// Set the selected widget in the form data and update the modalStore
			$modalStore[0].response({ selectedWidget: selected });
		}
		// console.log('modalStore:', $modalStore[0].response);
		// close the modal
		modalStore.close();
	}

	// Base Classes
	const cBase = 'card p-4 w-screen h-screen shadow-xl space-y-4 bg-white';
	const cHeader = 'text-2xl font-bold';
	const cForm = 'border border-surface-500 p-4 space-y-4 rounded-container-token';

	// Call tooltip
	function getIconTooltip(item: WidgetType): PopupSettings {
		return {
			event: 'hover',
			target: item as string
		};
	}
</script>

{#if $modalStore[0]}
	<div class="modal-example-form {cBase}">
		<header class={`text-center text-primary-500 ${cHeader}`}>
			{$modalStore[0]?.title ?? '(title missing)'}
		</header>
		<article class="hidden text-center sm:block">{$modalStore[0].body ?? '(body missing)'}</article>
		<!-- Enable for debugging: -->
		<form class="modal-form {cForm}">
			<div class="mb-3 border-b text-center text-primary-500">Choose your Widget</div>
			<input type="text" placeholder="Search ..." class="input mb-3 w-full" bind:value={searchTerm} />

			<div class="grid grid-cols-1 items-center justify-center gap-2 sm:grid-cols-2 md:grid-cols-3 md:gap-3">
				{#each widget_keys.filter((item) => item !== null) as item}
					{#if item}
						{#if item.toLowerCase().includes(searchTerm.toLowerCase())}
							<button
								class="variant-outline-warning btn relative flex items-center justify-start gap-1 {selected === item
									? 'bg-primary-500'
									: ' variant-outline-warning hover:variant-ghost-warning'}"
								on:click={() => {
									selected = item;
									onFormSubmit();
								}}
							>
								<iconify-icon icon={widgets[item]?.Icon} width="22" class="mr-1 text-tertiary-500" />
								<span class="text-surface-700 dark:text-white">{item}</span>

								<!-- helpericon -->
								<iconify-icon
									icon="material-symbols:info"
									width="20"
									use:popup={getIconTooltip(item)}
									class="absolute -right-1.5 -top-1.5 text-primary-500"
								/>
							</button>
							<!-- IconTooltip -->
							<div class="card variant-filled-secondary z-50 max-w-sm p-4" data-popup={item}>
								<p>{widgets[item]?.Description}</p>
								<div class="variant-filled-secondary arrow" />
							</div>
						{/if}
					{/if}
				{/each}
			</div>
		</form>

		<footer class="modal-footer flex {existingCategory.name ? 'justify-between' : 'justify-end'} {parent.regionFooter}">
			<div class="flex gap-2">
				<button class="variant-outline-secondary btn" on:click={parent.onClose}>{m.modalcategory_cancel()}</button>
				<!-- <button class="btn {parent.buttonPositive}" on:click={onFormSubmit}>{m.modalcategory_save()}</button> -->
			</div>
		</footer>
	</div>
{/if}
