<!--
@fil src/routes/(app)/config/collectionbuilder/[...ContentTypes]/tabs/CollectionWidget.svelte
component
**This component displays the collection widget**
-->

<script lang="ts">
	// Stores
	import { page } from '$app/state';
	import { tabSet } from '@stores/store.svelte';
	import { targetWidget, collection } from '@src/stores/collectionStore.svelte';
	import { getGuiFields, asAny } from '@utils/utils';

	// Components
	import VerticalList from '@components/VerticalList.svelte';
	import widgets from '@src/widgets';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton
	import { getModalStore } from '@skeletonlabs/skeleton';
	import type { ModalSettings, ModalComponent } from '@skeletonlabs/skeleton';
	import ModalWidgetForm from './CollectionWidget/ModalWidgetForm.svelte';
	import ModalSelectWidget from './CollectionWidget/ModalSelectWidget.svelte';
	import type { Field } from '@root/src/content/types';

	let props = $props<{ fields?: Field[]; handleCollectionSave: () => Promise<void> }>();

	const modalStore = getModalStore();

	// Extract the collection path from the URL
	const contentPath = page.params.contentPath;

	// Helper function to map fields
	function mapFieldsWithWidgets(fields: any[]) {
		if (!fields) return [];
		return fields.map((field, index) => {
			const widgetType =
				field.widget?.key || // For new widgets
				field.widget?.Name || // For existing widgets
				field.__type || // For schema-defined widgets
				field.type || // Backup type field
				Object.keys(widgets).find((key) => field[key]) || // Check if field has widget property
				'Unknown Widget'; // Fallback

			return {
				id: index + 1,
				...field,
				widget: {
					key: widgetType,
					Name: widgetType,
					...field.widget
				}
			};
		});
	}

	// Use state for fields
	let fields = $derived(mapFieldsWithWidgets(props.fields ?? []));

	// Collection headers
	const headers = ['Id', 'Icon', 'Name', 'DBName', 'Widget'];

	// svelte-dnd-action
	const flipDurationMs = 300;

	const handleDndConsider = (e: CustomEvent<{ items: any[] }>) => {
		fields = e.detail.items;
	};

	const handleDndFinalize = (e: CustomEvent<{ items: any[] }>) => {
		fields = e.detail.items;
	};

	// Modal 1 to choose a widget
	function modalSelectWidget(selected: any): void {
		const c: ModalComponent = { ref: ModalSelectWidget };
		const modal: ModalSettings = {
			type: 'component',
			component: c,
			title: 'Select a Widget',
			body: 'Select your widget and then press submit.',
			value: selected, // Pass the selected widget as the initial value
			response: (r: { selectedWidget: keyof typeof widgets } | undefined) => {
				if (!r) return;
				const { selectedWidget } = r;
				if (selectedWidget && widgets[selectedWidget]) {
					// Create a new widget object with the selected widget data
					const newWidget = {
						widget: { key: selectedWidget, Name: selectedWidget },
						GuiFields: getGuiFields({ key: selectedWidget }, asAny(widgets[selectedWidget].GuiSchema)),
						permissions: {} // Initialize empty permissions object
					};
					// Call modalWidgetForm with the new widget object
					modalWidgetForm(newWidget);
				}
			}
		};
		modalStore.trigger(modal);
	}

	// Modal 2 to Edit a selected widget
	function modalWidgetForm(selectedWidget: any): void {
		const c: ModalComponent = { ref: ModalWidgetForm };
		// Ensure permissions object exists
		if (!selectedWidget.permissions) {
			selectedWidget.permissions = {};
		}
		targetWidget.set(selectedWidget);
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
					const updatedFields = [
						...fields.slice(0, existingIndex), // Copy widgets before the updated one
						{ ...r }, // Update the existing widget
						...fields.slice(existingIndex + 1) // Copy widgets after the updated one
					];
					fields = updatedFields;
				} else {
					// If the existing widget is not found, add it as a new widget
					const newField = {
						id: fields.length + 1,
						...r
					};
					fields = [...fields, newField];
				}
				// Update the collectionValue store
				collection.update((c) => {
					if (c) {
						c.fields = fields;
					}

					console.log('updated collection', c);
					return c;
				});
			}
		};
		modalStore.trigger(modal);
	}

	// Function to save data by sending a POST request
	async function handleSave() {
		try {
			const updatedFields = fields.map((field) => {
				if (field.widget?.Name && widgets[field.widget.Name]) {
					const GuiFields = getGuiFields({ key: field.widget.Name }, asAny(widgets[field.widget.Name].GuiSchema));
					for (const [property, value] of Object.entries(field)) {
						if (typeof value !== 'object' && property !== 'id') {
							GuiFields[property] = field[property];
						}
					}
					field.widget.GuiFields = GuiFields;
				}
				return field;
			});

			// Update the collection fields
			collection.update((c) => {
				if (c) {
					c.fields = updatedFields;
				}
				return c;
			});

			await props.handleCollectionSave();
		} catch (error) {
			console.error('Error saving collection:', error);
		}
	}
</script>

<div class="flex w-full flex-col">
	<div class="variant-outline-tertiary rounded-t-md p-2 text-center dark:variant-outline-primary">
		<p>
			{m.collection_widgetfield_addrequired()}
			<span class="text-tertiary-500 dark:text-primary-500">{contentPath}</span> Collection inputs.
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

					<iconify-icon icon={field.icon} width="24" class="text-tertiary-500"></iconify-icon>
					<div class="font-bold dark:text-primary-500">{field.label}</div>
					<div class=" ">{field?.db_fieldName ? field.db_fieldName : '-'}</div>
					<div class=" ">{field.widget?.key || field.__type || 'Unknown Widget'}</div>

					<button onclick={() => modalWidgetForm(field)} type="button" aria-label={m.button_edit()} class="variant-ghost-primary btn-icon ml-auto">
						<iconify-icon icon="ic:baseline-edit" width="24" class="dark:text-white"></iconify-icon>
					</button>
				</div>
			{/each}
		</VerticalList>
	</div>
	<div>
		<div class="mt-2 flex items-center justify-center gap-3">
			<button onclick={() => modalSelectWidget(null)} class="variant-filled-tertiary btn" aria-label={m.collection_widgetfield_addFields()}>
				{m.collection_widgetfield_addFields()}
			</button>
		</div>
		<div class=" flex items-center justify-between">
			<button onclick={() => tabSet.set(0)} type="button" aria-label={m.button_previous()} class="variant-filled-secondary btn mt-2 justify-end">
				{m.button_previous()}
			</button>
			<button
				onclick={handleSave}
				type="button"
				aria-label={m.button_save()}
				class="variant-filled-tertiary btn mt-2 justify-end dark:variant-filled-primary dark:text-black">{m.button_save()}</button
			>
		</div>
	</div>
</div>
