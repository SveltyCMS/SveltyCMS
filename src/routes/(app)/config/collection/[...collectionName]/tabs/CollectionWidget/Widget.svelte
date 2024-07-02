<script lang="ts">
	import { getGuiFields } from '@src/utils/utils';

	// Stores
	import { page } from '$app/stores';
	import { collectionValue, tabSet, targetWidget } from '@stores/store';

	// Componets
	import widgets from '@src/components/widgets';
	import VerticalList from '@components/VerticalList.svelte';
	import ModalWidgetForm from './ModalWidgetForm.svelte';
	import ModalSelectWidget from '@src/routes/(app)/collection/[...collectionName]/ModalSelectWidget.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Event dispatcher
	import { createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher();

	// Skeleton
	import { getModalStore } from '@skeletonlabs/skeleton';
	import type { ModalSettings, ModalComponent } from '@skeletonlabs/skeleton';
	const modalStore = getModalStore();

	// Extract the collection name from the URL
	const collectionName = $page.params.collectionName;

	//fields
	let fields = $collectionValue.fields.map((field, index) => {
		return {
			id: index + 1, // Add the id property first
			...field // Copy all existing properties
		};
	});

	// Collection headers
	const headers = ['Id', 'Icon', 'Name', 'DBName', 'Widget'];

	// svelte-dnd-action
	const flipDurationMs = 300;

	const handleDndConsider = (e: any) => {
		fields = e.detail.items;
	};

	const handleDndFinalize = (e: any) => {
		fields = e.detail.items;
	};

	// Modal 2 to Edit a selected widget
	function modalWidgetForm(selectedWidget: any): void {
		// console.log(selectedWidget);
		if (selectedWidget.permissions === undefined) {
			selectedWidget.permissions = {};
		}
		targetWidget.set(selectedWidget);
		const c: ModalComponent = { ref: ModalWidgetForm };
		const modal: ModalSettings = {
			type: 'component',
			component: c,
			title: 'Define your Widget',
			body: 'Setup your widget and then press Save.',
			value: selectedWidget, // Pass the selected widget as the initial value
			response: (r: any) => {
				if (!r) return;
				// Find the index of the existing widget based on its ID
				const existingIndex = fields.findIndex((widget) => widget.id === r.id);

				if (existingIndex !== -1) {
					// If the existing widget is found, update its properties
					fields = [
						...fields.slice(0, existingIndex), // Copy widgets before the updated one
						{ ...r }, // Update the existing widget
						...fields.slice(existingIndex + 1) // Copy widgets after the updated one
					];
					collectionValue.update((c) => {
						c.fields = fields;
						return c;
					});
				} else {
					// If the existing widget is not found, add it as a new widget
					const newField = {
						id: fields.length + 1,
						...r
					};
					fields = [...fields, newField];
					collectionValue.update((c) => {
						c.fields = fields;
						return c;
					});
				}
			}
		};
		modalStore.trigger(modal);
	}

	// Modal 1 to choose a widget
	function modalSelectWidget(selected: any): void {
		const c: ModalComponent = { ref: ModalSelectWidget };
		const modal: ModalSettings = {
			type: 'component',
			component: c,
			title: 'Select a Widget',
			body: 'Select your widget and then press submit.',
			value: selected, // Pass the selected widget as the initial value
			response: (r: any) => {
				if (!r) return;
				const { selectedWidget } = r;
				const widget = { widget: { key: selectedWidget }, permissions: {} };
				targetWidget.set(widget);
				modalWidgetForm(widget); // Use selectedWidget directly
			}
		};
		modalStore.trigger(modal);
	}

	// Function to save data by sending a POST request
	async function handleCollectionSave() {
		fields = fields.map((field) => {
			const GuiFields = getGuiFields({ key: field.widget.Name }, widgets[field.widget.Name].GuiSchema);
			for (const [property, value] of Object.entries(field)) {
				if (typeof value !== 'object' && property !== 'id') {
					GuiFields[property] = field[property];
				}
			}
			field.widget.GuiFields = GuiFields;
			return field;
		});

		// Update the collection fields
		collectionValue.update((c) => {
			c.fields = fields;
			return c;
		});

		dispatch('save');
	}

	$: {
		fields = $collectionValue.fields.map((field, index) => {
			return {
				id: index + 1, // Add the id property first
				...field // Copy all existing properties
			};
		});
	}
</script>

<div class="flex flex-col">
	<div class="variant-outline-tertiary rounded-t-md p-2 text-center dark:variant-outline-primary">
		<p>
			{m.collection_widgetfield_addrequired()} <span class="text-tertiary-500 dark:text-primary-500">{collectionName}</span> Collection inputs.
		</p>
		<p class="mb-2">{m.collection_widgetfield_drag()}</p>
	</div>
	<div style="max-height: 55vh !important;">
		<VerticalList items={fields} {headers} {flipDurationMs} {handleDndConsider} {handleDndFinalize}>
			{#each fields as field (field.id)}
				<div
					class="border-blue variant-outline-surface my-2 grid w-full grid-cols-6 items-center rounded-md border p-1 text-left hover:variant-filled-surface dark:text-white"
				>
					<div class="variant-ghost-tertiary badge h-10 w-10 rounded-full dark:variant-ghost-primary">
						{field.id}
					</div>

					<iconify-icon icon={field.icon} width="24" class="text-tertiary-500" />
					<div class="font-bold dark:text-primary-500">{field.label}</div>
					<div class=" ">{field?.db_fieldName ? field.db_fieldName : '-'}</div>
					<div class=" ">{field.widget?.key}</div>

					<button type="button" class="variant-ghost-primary btn-icon ml-auto" on:click={() => modalWidgetForm(field)}>
						<iconify-icon icon="ic:baseline-edit" width="24" class="dark:text-white" />
					</button>
				</div>
			{/each}
		</VerticalList>
	</div>
	<div>
		<div class="mt-2 flex items-center justify-center gap-3">
			<button on:click={modalSelectWidget} class="variant-filled-tertiary btn">{m.collection_widgetfield_addFields()} </button>
		</div>
		<div class=" flex items-center justify-between">
			<button type="button" on:click={() => ($tabSet = 1)} class="variant-filled-secondary btn mt-2 justify-end">{m.button_previous()}</button>
			<button
				type="button"
				on:click={handleCollectionSave}
				class="variant-filled-tertiary btn mt-2 justify-end dark:variant-filled-primary dark:text-black">{m.button_save()}</button
			>
		</div>
	</div>
</div>
