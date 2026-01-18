<!--
@file src/routes/(app)/config/collectionbuilder/[...ContentTypes]/tabs/CollectionWidget.svelte
@component
**This component displays the collection widget**
-->

<script lang="ts">
	// Stores
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { logger } from '@shared/utils/logger';
	import { collection, collections, setTargetWidget } from '@cms/stores/collectionStore.svelte';
	import { widgets } from '@cms/stores/widgetStore.svelte';
	import { untrack } from 'svelte';
	import * as m from '@shared/paraglide/messages';

	// Components
	import VerticalList from '@cms/components/VerticalList.svelte';
	import ModalSelectWidget from './CollectionWidget/ModalSelectWidget.svelte';

	// Stores & Utils
	import { modalState } from '@shared/utils/modalState.svelte';
	import { getGuiFields, asAny } from '@shared/utils/utils';

	const contentPath = $derived(page.params.contentPath);
	const action = $derived(page.params.action);

	function mapFieldsWithWidgets(fields: any[]) {
		return fields.map((field) => {
			return field;
		});
	}
	// Props
	interface Props {
		fields: any[];
		handleCollectionSave: () => void;
		onPrevious?: () => void;
	}

	const { fields: initialFields, handleCollectionSave, onPrevious }: Props = $props();

	// Use state for fields (not derived, since we need to mutate it via drag-and-drop)
	let fields = $state(mapFieldsWithWidgets(initialFields ?? []));

	// ... (rest of the logic)

	// Watch for changes in props.fields and update our state
	$effect(() => {
		if (initialFields) {
			// Only update if we're not returning from a save
			const isReturningFromSave = page.url.searchParams.get('widgetSaved') === 'true';
			if (!isReturningFromSave) {
				fields = mapFieldsWithWidgets(initialFields);
			}
		}
	});

	// ... (widgetSaved logic remains same)

	// ...

	// Handle returning from widget configuration
	$effect(() => {
		const isSaved = page.url.searchParams.get('widgetSaved') === 'true';

		if (isSaved && collections.targetWidget) {
			untrack(() => {
				console.log('[CollectionWidget] Returning from save with widget:', collections.targetWidget);

				// Get the widget from store
				const newWidget = { ...collections.targetWidget };
				const widgetType = newWidget.widget?.key || newWidget.widget?.Name || 'Unknown';

				// Check if we're editing an existing field or adding a new one
				// We can use ID or some other identifier if available, otherwise assume append for now
				// For simplicity in this flow, we'll append to the list

				const mappedWidget = {
					id: fields.length + 1,
					...newWidget,
					widget: {
						key: widgetType,
						Name: widgetType,
						...newWidget.widget
					}
				};

				// Update fields
				fields = [...fields, mappedWidget];

				// Clear the query param so we don't add it again on refresh
				const url = new URL(page.url);
				url.searchParams.delete('widgetSaved');
				goto(url.toString(), { replaceState: true, keepFocus: true, noScroll: true });

				// Clear target widget to prevent re-adding
				// setTargetWidget(null); // Keep it for now in case of issues, or clear it
			});
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

	function modalSelectWidget(): void {
		console.log('[CollectionWidget] Opening widget selection modal');
		modalState.trigger(
			ModalSelectWidget as any,
			{
				title: 'Select a Widget',
				body: 'Select your widget and then press submit.'
			},
			(r: { selectedWidget: string } | undefined) => {
				console.log('[CollectionWidget] Modal callback received:', r);
				if (!r) {
					console.log('[CollectionWidget] No response received, returning');
					return;
				}
				const { selectedWidget } = r;
				console.log('[CollectionWidget] Selected widget:', selectedWidget);
				const widgetInstance = widgets.widgetFunctions[selectedWidget];
				console.log('[CollectionWidget] Widget instance:', widgetInstance);
				if (selectedWidget && widgetInstance) {
					// Create a new widget object with the selected widget data
					const newWidget = {
						widget: { key: selectedWidget, Name: selectedWidget },
						GuiFields: getGuiFields({ key: selectedWidget }, asAny(widgetInstance.GuiSchema)),
						permissions: {} // Initialize empty permissions object
					};
					console.log('[CollectionWidget] Creating new widget:', newWidget);
					// Navigate to widget configuration page
					navigateToWidgetConfig(newWidget, 'create');
				} else {
					console.log('[CollectionWidget] Widget instance not found or no selection');
				}
			}
		);
	}

	// Navigate to widget configuration page
	function navigateToWidgetConfig(selectedWidget: any, widgetAction: 'create' | 'edit'): void {
		console.log('[CollectionWidget] Navigating to widget config:', selectedWidget);
		// Ensure permissions object exists
		if (!selectedWidget.permissions) {
			selectedWidget.permissions = {};
		}
		// Set the target widget in the store for the config page to access
		collections.setTargetWidget(selectedWidget);

		// Navigate to the widget configuration page
		goto(`/config/collectionbuilder/${action}/${contentPath}/widget/${widgetAction}`);
	}

	// Edit an existing widget field
	function editWidgetField(field: any): void {
		navigateToWidgetConfig(field, 'edit');
	}

	// Function to save data by sending a POST request
	async function handleSave() {
		try {
			const updatedFields = fields.map((field) => {
				const widgetInstance = field.widget?.Name ? widgets.widgetFunctions[field.widget.Name] : undefined;
				if (field.widget?.Name && widgetInstance) {
					const GuiFields = getGuiFields({ key: field.widget.Name }, asAny(widgetInstance.GuiSchema));
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
			if (collection?.value) {
				collection.value.fields = updatedFields;
			}

			await props.handleCollectionSave();
		} catch (error) {
			logger.error('Error saving collection:', error);
		}
	}
</script>

<div class="flex w-full flex-col">
	<div class="preset-outlined-tertiary-500 rounded-t-md p-2 text-center dark:preset-outlined-primary-500">
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
					class="border-blue preset-outlined-surface-500 my-2 grid w-full grid-cols-6 items-center rounded-md border p-1 text-left hover:preset-filled-surface-500 dark:text-white"
				>
					<div class="preset-ghost-tertiary-500 badge h-10 w-10 rounded-full dark:preset-ghost-primary-500">
						{field.id}
					</div>

					<iconify-icon icon={field.icon} width="24" class="text-tertiary-500"></iconify-icon>
					<div class="font-bold dark:text-primary-500">{field.label}</div>
					<div class=" ">{field?.db_fieldName ? field.db_fieldName : '-'}</div>
					<div class=" ">{field.widget?.key || field.__type || 'Unknown Widget'}</div>

					<button onclick={() => editWidgetField(field)} type="button" aria-label={m.button_edit()} class="preset-ghost-primary-500 btn-icon ml-auto">
						<iconify-icon icon="ic:baseline-edit" width="24" class="dark:text-white"></iconify-icon>
					</button>
				</div>
			{/each}
		</VerticalList>
	</div>
	<div>
		<div class="mt-2 flex items-center justify-center gap-3">
			<button
				onclick={() => modalSelectWidget()}
				class="preset-filled-tertiary-500 btn"
				aria-label={m.collection_widgetfield_addFields()}
				data-testid="add-field-button"
			>
				{m.collection_widgetfield_addFields()}
			</button>
		</div>
		<div class=" flex items-center justify-between">
			<button
				onclick={() => onPrevious?.()}
				type="button"
				aria-label={m.button_previous()}
				class="preset-filled-secondary-500 btn mt-2 justify-end"
				disabled={!onPrevious}
			>
				{m.button_previous()}
			</button>
			<button
				onclick={handleSave}
				type="button"
				aria-label={m.button_save()}
				class="preset-filled-tertiary-500 btn mt-2 justify-end dark:preset-filled-primary-500 dark:text-black">{m.button_save()}</button
			>
		</div>
	</div>
</div>
