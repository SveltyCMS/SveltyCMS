<script lang="ts">
	// Props
	/** Exposes parent props to this component. */
	export let parent: any;

	// Stores
	import { getModalStore } from '@skeletonlabs/skeleton';
	const modalStore = getModalStore();

	// Form Data
	const formData = {
		selectedWidget: null
	};

	// We've created a custom submit function to pass the response and close the modal.
	function onFormSubmit(): void {
		if ($modalStore[0].response) $modalStore[0].response(formData);
		modalStore.close();
	}

	// Base Classes
	const cBase = 'card p-4 w-modal shadow-xl space-y-4 bg-white';
	const cHeader = 'text-2xl font-bold';
	const cForm = 'border border-surface-500 p-4 space-y-4 rounded-container-token';
	import type { AutocompleteOption, PopupSettings } from '@skeletonlabs/skeleton';
	export let addField: boolean = false;
	import widgets from '@components/widgets';
	import InputSwitch from '../../../../routes/(app)/builder/InputSwitch.svelte';
	import { asAny } from '@utils/utils';

	// let selected_widget: keyof typeof widgets | null = null;
	let widget_keys = Object.keys(widgets) as unknown as keyof typeof widgets;
	let guiSchema: (typeof widgets)[typeof widget_keys]['GuiSchema'];
	$: if ($modalStore[0]?.value) {
		guiSchema = widgets[$modalStore[0].value]?.GuiSchema;
	}

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

	let field = { widget: { key: $modalStore[0].value as unknown as keyof typeof widgets, GuiFields: {} } };
</script>

<!-- @component This example creates a simple form modal. -->

{#if $modalStore[0]}
	<div class="modal-example-form {cBase}">
		<header class={`text-center text-primary-500 ${cHeader}`}>
			{$modalStore[0]?.title ?? '(title missing)'}
		</header>
		<article>{$modalStore[0].body ?? '(body missing)'}</article>
		<!-- Enable for debugging: -->
		<form class="modal-form {cForm}">
			<!-- update to use GuiSchema -->
			{#if $modalStore[0].value}
				<div class="mb-2 border-y text-center text-primary-500">
					<div class="text-xl text-primary-500">
						<span class="font-bold">{$modalStore[0].value}</span> Widget Input Options
					</div>
					<div class="text-xs text-error-500">* Required</div>
				</div>
				<div class="options-table">
					{#each Object.entries(guiSchema) as [property, value]}
						<InputSwitch bind:value={field.widget.GuiFields[property]} widget={asAny(value).widget} key={property} />
					{/each}
				</div>
			{/if}
		</form>
		<!-- prettier-ignore -->
		<footer class="modal-footer {parent.regionFooter}">
        <button class="btn {parent.buttonNeutral}" on:click={parent.onClose}>{parent.buttonTextCancel}</button>
        <button class="btn {parent.buttonPositive}" on:click={onFormSubmit}>Submit Form</button>
    </footer>
	</div>
{/if}
