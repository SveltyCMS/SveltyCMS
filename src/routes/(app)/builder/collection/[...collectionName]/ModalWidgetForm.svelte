<script lang="ts">
	// Props
	/** Exposes parent props to this component. */
	export let parent: any;

	// Stores
	import { getModalStore } from '@skeletonlabs/skeleton';
	const modalStore = getModalStore();

	// Form Data
	const formData = {
		name: 'Jane Doe',
		tel: '214-555-1234',
		email: 'jdoe@email.com'
	};

	// We've created a custom submit function to pass the response and close the modal.
	function onFormSubmit(): void {
		if ($modalStore[0].response) $modalStore[0].response(formData);
		modalStore.close();
	}

	// Base Classes
	const cBase = 'card p-4 w-modal shadow-xl space-y-4';
	const cHeader = 'text-2xl font-bold';
	const cForm = 'border border-surface-500 p-4 space-y-4 rounded-container-token';

	import * as widgets from '@src/components/widgets/index';

	import { Autocomplete, popup } from '@skeletonlabs/skeleton';
	import type { AutocompleteOption, PopupSettings } from '@skeletonlabs/skeleton';

	// ------------widget builder ---------------
	// create an array to store the input values for each widget
	let inputPopupWidget = [''];
	//console.log(inputPopupWidget);

	let popupSettings: PopupSettings = {
		event: 'focus-click',
		closeQuery: '',
		target: 'popupAutocomplete',
		placement: 'bottom'
	};

	const widgetList = Object.values(widgets);
	const widgetOptions: AutocompleteOption[] = Object.keys(widgetList[0]).map((widget) => {
		return {
			label: widget,
			value: widget
		};
	});

	let selectedWidget = '';
	let selectedWidgetoptions = {};

	// create a function to handle the selection of a widget and update the input value in the array
	function onPopupWidgetSelect(event: CustomEvent<AutocompleteOption>) {
		inputPopupWidget = event.detail.label;
		selectedWidget = event.detail.value;
		selectedWidgetOptions = {};
	}
</script>

<!-- @component This example creates a simple form modal. -->

{#if $modalStore[0]}
	<div class="modal-example-form {cBase}">
		<header class={cHeader}>{$modalStore[0].title ?? '(title missing)'}</header>
		<article>{$modalStore[0].body ?? '(body missing)'}</article>
		<!-- Enable for debugging: -->
		<form class="modal-form {cForm}">
			<label class="label">
				<span>Name</span>

				<input
					class="autocomplete input"
					type="search"
					name="autocomplete-search"
					bind:value={inputPopupWidget}
					use:popup={popupSettings}
					placeholder="Select Widget..."
				/>
				<div data-popup="popupAutocomplete" class="w-full bg-surface-500 text-white">
					<Autocomplete
						bind:input={inputPopupWidget}
						options={widgetOptions}
						on:selection={onPopupWidgetSelect}
					/>
				</div>

				{#if selectedWidget}
					<div class="mb-2 border-y text-center text-primary-500">
						<div class="text-xl text-primary-500">
							<span class="font-bold">{selectedWidget}</span> Widget Input Options
						</div>
						<div class="text-xs text-error-500">* Required</div>
					</div>
					<div class="options-table">
						{#each Object.keys(widgetList[0][selectedWidget]({})).filter((key) => key !== 'widget' && key !== 'display' && key !== 'schema') as option}
							{#if option === 'label'}
								<label for={option}>{option}: <span class="text-error-500">*</span></label>
								<input
									type="text"
									required
									name={option}
									id={option}
									placeholder={`Enter ${option}`}
									class="variant-filled-surface"
									bind:value={selectedWidgetoptions}
								/>
							{:else}
								<label for={option}>{option}:</label>

								{#if option === 'minlength' || option === 'maxlength' || option === 'count'}
									<input
										type="number"
										name={option}
										id={option}
										placeholder={`Enter ${option}`}
										class="variant-filled-surface"
										bind:value={selectedWidgetoptions[option]}
									/>
								{:else if option === 'required' || option === 'readonly' || option === 'disabled' || option === 'localization'}
									<input
										type="checkbox"
										name={option}
										id={option}
										class="variant-filled-surface"
										bind:value={selectedWidgetoptions[option]}
									/>
								{:else}
									<input
										type="text"
										name={option}
										id={option}
										placeholder={`Enter ${option}`}
										class="variant-filled-surface"
										bind:value={selectedWidgetoptions[option]}
									/>
								{/if}
							{/if}
						{/each}
					</div>
				{/if}
			</label>
		</form>
		<!-- prettier-ignore -->
		<footer class="modal-footer {parent.regionFooter}">
        <button class="btn {parent.buttonNeutral}" on:click={parent.onClose}>{parent.buttonTextCancel}</button>
        <button class="btn {parent.buttonPositive}" on:click={onFormSubmit}>Submit Form</button>
    </footer>
	</div>
{/if}
