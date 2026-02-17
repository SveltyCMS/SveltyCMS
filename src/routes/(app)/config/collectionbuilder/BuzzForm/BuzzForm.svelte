<!-- 
@files src/routes/(app)/config/collectionbuilder/BuzzForm/BuzzForm.svelte
@component
**This component handles the BuzzForms**

### Props
- `fields` {any[]} - Array of fields
- `selectedFieldId` {number | string | undefined} - ID of the selected field
- `onNodeUpdate` {Function} - Callback function to handle node updates
- `onSelectField` {Function} - Callback function to handle field selection
- `onDelete` {Function} - Callback function to handle field deletion

### Features
- Drag and drop support for reassigning collections
-->

<script lang="ts">
	import { collections, setTargetWidget } from '@src/stores/collectionStore.svelte';
	import { toaster } from '@src/stores/store.svelte';
	import { widgets } from '@stores/widgetStore.svelte.ts';
	import { asAny, getGuiFields } from '@utils/utils';
	import BuzzFormCanvas from './BuzzFormCanvas.svelte';
	import FieldInspector from './FieldInspector.svelte';
	import WidgetSidebar from './WidgetSidebar.svelte';

	let selectedFieldId = $state<number | string | undefined>(undefined);

	// Sync fields with collection store
	const fields = $derived((collections.active?.fields as any[]) || []);

	function handleAddWidget(key: string) {
		const widgetInstance = asAny<any>(widgets.widgetFunctions)[key];
		if (widgetInstance) {
			const newId = fields.length + 1;
			const newField = {
				id: newId,
				label: `New ${key}`,
				db_fieldName: `field_${newId}_${key.toLowerCase()}`,
				widget: { key, Name: key } as any,
				icon: widgetInstance.Icon || 'mdi:widgets',
				GuiFields: getGuiFields({ key }, asAny(widgetInstance.GuiSchema)),
				permissions: {},
				required: false
			};

			if (collections.active) {
				collections.active.fields = [...fields, newField];
			}

			// Auto-select the new field
			handleSelectField(newField);
			toaster.success({ description: `Added ${key} field to canvas` });
		}
	}

	function handleNodeUpdate(updatedItems: any[]) {
		if (collections.active) {
			// Update IDs to match new order (optional but cleaner)
			collections.active.fields = updatedItems.map((item, index) => ({
				...item,
				id: index + 1
			}));
		}
	}

	function handleSelectField(field: any) {
		selectedFieldId = field.id;
		setTargetWidget(field);
	}

	function handleDeleteField() {
		if (selectedFieldId !== undefined && collections.active) {
			const newFields = fields.filter((f) => f.id !== selectedFieldId);
			collections.active.fields = newFields.map((f, i) => ({ ...f, id: i + 1 }));
			selectedFieldId = undefined;
			setTargetWidget({ permissions: {} });
			toaster.info({ description: 'Field removed from canvas' });
		}
	}
</script>

<div class="flex h-[calc(100vh-180px)] overflow-hidden rounded-2xl border border-surface-200-800 bg-white dark:bg-surface-900 shadow-xl">
	<!-- Left: Widget Palette -->
	<WidgetSidebar onAddWidget={handleAddWidget} />

	<!-- Center: Design Canvas -->
	<BuzzFormCanvas {fields} {selectedFieldId} onNodeUpdate={handleNodeUpdate} onSelectField={handleSelectField} />

	<!-- Right: Property Inspector -->
	<FieldInspector onDelete={handleDeleteField} />
</div>
