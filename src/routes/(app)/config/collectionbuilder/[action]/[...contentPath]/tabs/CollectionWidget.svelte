<!--
@fil src/routes/(app)/config/collectionbuilder/[...ContentTypes]/tabs/CollectionWidget.svelte
component
**This component displays the collection widget**
-->

<script lang="ts">
	// Stores
	import { page } from '$app/state';
	import { logger } from '@utils/logger';
	import { collections } from '@src/stores/collectionStore.svelte';
	import { app } from '@stores/store.svelte';
	import { asAny, getGuiFields } from '@utils/utils';
	// Components
	import VerticalList from '@components/VerticalList.svelte';
	import { widgets } from '@stores/widgetStore.svelte';
	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton

	import type { ModalComponent, ModalSettings } from '@skeletonlabs/skeleton';
	import { getModalStore } from '@skeletonlabs/skeleton';
	import ModalSelectWidget from './CollectionWidget/ModalSelectWidget.svelte';
	// import ModalWidgetForm from './CollectionWidget/ModalWidgetForm.svelte'; // Replaced by WidgetEditor
	import WidgetEditor from './CollectionWidget/WidgetEditor.svelte';

	const props = $props();

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
				Object.keys(widgets.widgetFunctions).find((key) => field[key]) || // Check if field has widget property
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

	// Use state for fields (not derived, since we need to mutate it via drag-and-drop)
	let fields = $state(mapFieldsWithWidgets(props.fields ?? []));

	// Watch for changes in props.fields and update our state
	$effect(() => {
		if (props.fields) {
			fields = mapFieldsWithWidgets(props.fields);
		}
	});

	// Collection headers
	const headers = ['Id', 'Icon', 'Name', 'DBName', 'Widget'];

	// svelte-dnd-action
	const flipDurationMs = 300;

	const handleDndConsider = (e: CustomEvent) => {
		fields = e.detail.items;
	};

	const handleDndFinalize = (e: CustomEvent) => {
		fields = e.detail.items;
	};

	// Logic to toggle between List and Editor
	let editingWidget = $state<any>(null);

	// Modal 1 to choose a widget (Kept as modal or could be replaced too, keeping modal for now as it's a selector)
	function modalSelectWidget(selected: any): void {
		const c: ModalComponent = { ref: ModalSelectWidget };
		const modal: ModalSettings = {
			type: 'component',
			component: c,
			title: 'Select a Widget',
			body: 'Select your widget and then press submit.',
			value: selected,
			response: (r: { selectedWidget: string } | undefined) => {
				if (!r) return;
				const { selectedWidget } = r;
				const widgetInstance = widgets.widgetFunctions[selectedWidget];
				if (selectedWidget && widgetInstance) {
					// Create a new widget object
					const newWidget = {
						id: fields.length + 1, // Generate ID here for new widget
						widget: { key: selectedWidget, Name: selectedWidget },
						GuiFields: getGuiFields({ key: selectedWidget }, asAny((widgetInstance as any).GuiSchema)),
						permissions: {},
						label: 'New Field'
					};
					// Switch to Editor Mode
					editingWidget = newWidget;
				}
			}
		};
		modalStore.trigger(modal);
	}

	function startEditing(widget: any) {
		// Ensure permissions object exists
		if (!widget.permissions) {
			widget.permissions = {};
		}
		editingWidget = widget;
	}

	function handleEditorSave(updatedWidget: any) {
		// Update the list
		const existingIndex = fields.findIndex((w) => w.id === updatedWidget.id);
		if (existingIndex !== -1) {
			const updatedFields = [...fields];
			updatedFields[existingIndex] = updatedWidget;
			fields = updatedFields;
		} else {
			fields = [...fields, updatedWidget];
		}

		// Update global store
		if (collections.active) {
			collections.active.fields = fields;
		}

		// Close editor
		editingWidget = null;
	}

	function handleEditorCancel() {
		editingWidget = null;
	}

	// Function to save data by sending a POST request
	async function handleSave() {
		try {
			const updatedFields = fields.map((field) => {
				const widgetInstance = field.widget?.Name ? widgets.widgetFunctions[field.widget.Name] : undefined;
				if (field.widget?.Name && widgetInstance) {
					const GuiFields = getGuiFields({ key: field.widget.Name }, asAny((widgetInstance as any).GuiSchema));
					for (const [property, value] of Object.entries(field)) {
						if (typeof value !== 'object' && property !== 'id') {
							GuiFields[property] = field[property];
						}
					}
					field.widget.GuiFields = GuiFields;
				}
				return field;
			});

			if (collections.active) {
				collections.active.fields = updatedFields;
			}

			await props.handleCollectionSave();
		} catch (error) {
			logger.error('Error saving collection:', error);
		}
	}
</script>

<div class="flex w-full flex-col h-full">
	{#if editingWidget}
		<!-- Editor Mode -->
		<WidgetEditor widgetData={editingWidget} onSave={handleEditorSave} onCancel={handleEditorCancel} />
	{:else}
		<!-- List Mode -->
		<div class="variant-outline-tertiary rounded-t-md p-2 text-center dark:variant-outline-primary">
			<p>
				{m.collection_widgetfield_addrequired()}
				<span class="text-tertiary-500 dark:text-primary-500">{contentPath}</span> Collection inputs.
			</p>
			<p class="mb-2">{m.collection_widgetfield_drag()}</p>
		</div>
		<div style="max-height: 55vh !important; overflow-y: auto;">
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

						<button onclick={() => startEditing(field)} type="button" aria-label={m.button_edit()} class="variant-ghost-primary btn-icon ml-auto">
							<iconify-icon icon="ic:baseline-edit" width="24" class="dark:text-white"></iconify-icon>
						</button>
					</div>
				{/each}
			</VerticalList>
		</div>
		<div>
			<div class="mt-2 flex items-center justify-center gap-3">
				<button
					onclick={() => modalSelectWidget(null)}
					class="variant-filled-tertiary btn"
					aria-label={m.collection_widgetfield_addFields()}
					data-testid="add-field-button"
				>
					{m.collection_widgetfield_addFields()}
				</button>
			</div>
			<div class=" flex items-center justify-between">
				<button
					onclick={() => (app.tabSetState = 0)}
					type="button"
					aria-label={m.button_previous()}
					class="variant-filled-secondary btn mt-2 justify-end"
				>
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
	{/if}
</div>
