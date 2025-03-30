<!-- 
@files src/routes/(app)/config/collectionbuilder/[...ContentTypes]/tabs/CollectionWidget.svelte
@component
**This component displays the collection widget**

@example
<CollectionWidget />

### Props
- `collection` {object} - Collection object

### Features
- Displays collection widget
-->

<script lang="ts">
	// Stores
	import { page } from '$app/state';
	import { tabSet } from '@stores/store.svelte';
	import { collectionValue } from '@src/stores/collectionStore.svelte'; // Removed targetWidget
	import { getGuiFields, asAny } from '@utils/utils';

	// Components
	import VerticalList from '@components/VerticalList.svelte';
	import * as widgets from '@src/widgets';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Modals
	import ModalWidgetForm from './CollectionWidget/ModalWidgetForm.svelte';
	import ModalSelectWidget from './CollectionWidget/ModalSelectWidget.svelte';

	let props = $props<{ handleCollectionSave: () => Promise<void> }>();

	// Extract the collection name from the URL
	const contentTypes = page.params.contentTypes;

	// State for modals
	let isSelectModalOpen = $state(false);
	let isFormModalOpen = $state(false);
	let formModalWidgetData = $state<any>({}); // Data to pass to ModalWidgetForm

	// Helper function to map fields
	function mapFieldsWithWidgets(fields: any[]) {
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
	let fields = $state(mapFieldsWithWidgets(collectionValue.value.fields as any[]));

	// Update fields when collectionValue changes
	$effect(() => {
		fields = mapFieldsWithWidgets(collectionValue.value.fields as any[]);
	});

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

	// Function to open the Select Widget modal
	function openSelectModal(): void {
		isSelectModalOpen = true;
	}

	// Function to open the Widget Form modal
	function openFormModal(widgetData: any): void {
		// Ensure permissions object exists
		if (!widgetData.permissions) {
			widgetData.permissions = {};
		}
		formModalWidgetData = widgetData; // Set the data for the form modal
		isFormModalOpen = true;
	}

	// Removed local type definition 'SelectWidgetData' to avoid conflict

	// Callback for when a widget is selected in ModalSelectWidget
	function handleSelectSubmit(data: { selectedWidget: string }): void {
		isSelectModalOpen = false; // Close select modal
		const { selectedWidget } = data;
		// Runtime check ensures it's a valid key of widgets
		if (selectedWidget && selectedWidget in widgets) {
			// Create a new widget object with the selected widget data
			const newWidget = {
				id: fields.length + 1, // Assign temporary ID (will be updated on save if needed)
				widget: { key: selectedWidget, Name: selectedWidget },
				// Use 'as any' workaround for GuiSchema access
				GuiFields: getGuiFields({ key: selectedWidget }, asAny((widgets[selectedWidget] as any)?.GuiSchema)),
				permissions: {} // Initialize empty permissions object
			};
			// Open the form modal with the new widget object
			openFormModal(newWidget);
		}
	}

	// Callback for when the widget form is submitted in ModalWidgetForm
	function handleFormSubmit(updatedWidgetData: any): void {
		isFormModalOpen = false; // Close form modal
		// Find the index of the existing widget based on its ID
		const existingIndex = fields.findIndex((widget) => widget.id === updatedWidgetData.id);

		if (existingIndex !== -1) {
			// If the existing widget is found, update its properties
			const updatedFields = [
				...fields.slice(0, existingIndex), // Copy widgets before the updated one
				{ ...updatedWidgetData }, // Update the existing widget
				...fields.slice(existingIndex + 1) // Copy widgets after the updated one
			];
			fields = updatedFields;
		} else {
			// If the existing widget is not found, add it as a new widget
			// Ensure it has a unique ID if the temporary one conflicts (unlikely here but good practice)
			const newField = {
				...updatedWidgetData,
				id: updatedWidgetData.id || fields.length + 1 // Use existing or new ID
			};
			fields = [...fields, newField];
		}
		// Update the collectionValue store immediately for reactivity
		collectionValue.update((c) => {
			if (c) {
				c.fields = fields;
			}
			return c;
		});
	}

	// Callback for when the delete button is clicked in ModalWidgetForm
	function handleFormDelete(widgetId: string | number): void {
		isFormModalOpen = false; // Close form modal
		fields = fields.filter((field: any) => field.id !== widgetId);
		// Update the collectionValue store immediately
		collectionValue.update((c) => {
			if (c) {
				c.fields = fields;
			}
			return c;
		});
	}

	// Function to save the entire collection configuration
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
			collectionValue.update((c) => {
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

<!-- Add Modal Instances -->
<ModalSelectWidget bind:open={isSelectModalOpen} onSubmit={handleSelectSubmit} onClose={() => (isSelectModalOpen = false)} />

<ModalWidgetForm
	bind:open={isFormModalOpen}
	widgetData={formModalWidgetData}
	onSubmit={handleFormSubmit}
	onDelete={handleFormDelete}
	onClose={() => (isFormModalOpen = false)}
/>

<div class="flex flex-col">
	<div class="preset-outline-tertiary dark:preset-outline-primary rounded-t-md p-2 text-center">
		<p>
			{m.collection_widgetfield_addrequired()} <span class="text-tertiary-500 dark:text-primary-500">{contentTypes}</span> Collection inputs.
		</p>
		<p class="mb-2">{m.collection_widgetfield_drag()}</p>
	</div>
	<div style="max-height: 55vh !important;">
		<VerticalList items={fields} {headers} {flipDurationMs} {handleDndConsider} {handleDndFinalize}>
			{#each fields as field (field.id)}
				<div
					class="border-blue preset-outline-surface hover:preset-filled-surface-500 my-2 grid w-full grid-cols-6 items-center rounded-md border p-1 text-left dark:text-white"
				>
					<div class="preset-tonal-tertiary badge dark:preset-tonal-primary border-primary-500 h-10 w-10 rounded-full border">
						{field.id}
					</div>

					<iconify-icon icon={field.icon} width="24" class="text-tertiary-500"></iconify-icon>
					<div class="dark:text-primary-500 font-bold">{field.label}</div>
					<div class=" ">{field?.db_fieldName ? field.db_fieldName : '-'}</div>
					<div class=" ">{field.widget?.key || field.__type || 'Unknown Widget'}</div>

					<button
						onclick={() => openFormModal(field)}
						type="button"
						aria-label={m.button_edit()}
						class="preset-tonal-primary border-primary-500 btn-icon ml-auto border"
					>
						<!-- Removed stray comment -->
						<iconify-icon icon="ic:baseline-edit" width="24" class="dark:text-white"></iconify-icon>
					</button>
				</div>
			{/each}
		</VerticalList>
	</div>
	<div>
		<div class="mt-2 flex items-center justify-center gap-3">
			<button onclick={openSelectModal} class="preset-filled-tertiary-500 btn" aria-label={m.collection_widgetfield_addFields()}>
				{m.collection_widgetfield_addFields()}
			</button>
		</div>
		<div class=" flex items-center justify-between">
			<button onclick={() => ($tabSet = 0)} type="button" aria-label={m.button_previous()} class="preset-filled-secondary-500 btn mt-2 justify-end">
				{m.button_previous()}
			</button>
			<button
				onclick={handleSave}
				type="button"
				aria-label={m.button_save()}
				class="preset-filled-tertiary-500 btn dark:preset-filled-primary-500 mt-2 justify-end dark:text-black">{m.button_save()}</button
			>
		</div>
	</div>
</div>
