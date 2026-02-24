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
	import { collections, setCollection, setTargetWidget } from '@src/stores/collection-store.svelte';
	import { toaster } from '@src/stores/store.svelte';
	import { widgets } from '@src/stores/widget-store.svelte.ts';
	import { asAny, getGuiFields } from '@utils/utils';

	// Components
	import WidgetSidebar from './widget-sidebar.svelte';
	import BuzzFormCanvas from './buzz-form-canvas.svelte';
	import FieldInspector from './field-inspector.svelte';

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
				setCollection({ ...collections.active, fields: [...fields, newField] });
			}

			// Auto-select the new field (index = new length - 1)
			handleSelectField(newField, fields.length);
			toaster.success({ description: `Added ${key} field to canvas` });
		}
	}

	function handleNodeUpdate(updatedItems: any[]) {
		if (collections.active) {
			setCollection({
				...collections.active,
				fields: updatedItems.map((item, index) => ({ ...item, id: index + 1 }))
			});
		}
	}

	function handleSelectField(field: any, index?: number) {
		selectedFieldId = field.id;
		const idx = typeof index === 'number' ? index : fields.findIndex((f: any) => f.id === field.id || f.db_fieldName === field.db_fieldName);
		setTargetWidget({ ...field, __fieldIndex: idx >= 0 ? idx : undefined });
	}

	function handleDeleteField() {
		if (selectedFieldId !== undefined && collections.active) {
			const newFields = fields.filter((f) => f.id !== selectedFieldId);
			setCollection({
				...collections.active,
				fields: newFields.map((f, i) => ({ ...f, id: i + 1 }))
			});
			selectedFieldId = undefined;
			setTargetWidget({ permissions: {} });
			toaster.info({ description: 'Field removed from canvas' });
		}
	}

	// Responsive: on small/medium screens sidebars become slide-over drawers
	let showWidgetDrawer = $state(false);
	let showInspectorDrawer = $state(false);
</script>

<div
	class="relative flex min-h-[320px] flex-col overflow-hidden rounded-2xl border border-surface-200-800 bg-white dark:bg-surface-900 shadow-xl lg:h-[calc(100vh-180px)] lg:flex-row"
>
	<!-- Desktop: Left sidebar always visible -->
	<div class="hidden shrink-0 lg:block lg:w-72">
		<WidgetSidebar onAddWidget={handleAddWidget} />
	</div>

	<!-- Mobile/Tablet: Widget drawer -->
	{#if showWidgetDrawer}
		<div
			class="fixed inset-0 z-40 bg-black/40 lg:hidden"
			role="button"
			tabindex="-1"
			aria-label="Close widgets"
			onclick={() => (showWidgetDrawer = false)}
			onkeydown={(e) => e.key === 'Escape' && (showWidgetDrawer = false)}
		></div>
		<div
			class="fixed left-0 top-0 z-50 h-full w-[min(100vw,18rem)] border-r border-surface-200-800 bg-surface-50-950 shadow-xl lg:hidden"
			role="dialog"
			aria-label="Widget palette"
		>
			<div class="flex h-12 items-center justify-between border-b border-surface-200-800 px-4">
				<span class="font-semibold">Widgets</span>
				<button type="button" class="btn-icon preset-ghost-surface-500" aria-label="Close" onclick={() => (showWidgetDrawer = false)}>
					<iconify-icon icon="mdi:close" width="24"></iconify-icon>
				</button>
			</div>
			<div class="h-[calc(100%-3rem)] overflow-y-auto">
				<WidgetSidebar
					onAddWidget={(key) => {
						handleAddWidget(key);
						showWidgetDrawer = false;
					}}
				/>
			</div>
		</div>
	{/if}

	<!-- Center: Canvas + mobile toolbar -->
	<div class="flex min-h-0 flex-1 flex-col">
		<!-- Mobile/Tablet: toolbar to open sidebars -->
		<div class="flex shrink-0 items-center gap-2 border-b border-surface-200-800 bg-surface-50-950 px-3 py-2 lg:hidden">
			<button type="button" class="btn btn-sm preset-outlined-surface-500 flex items-center gap-2" onclick={() => (showWidgetDrawer = true)}>
				<iconify-icon icon="mdi:widgets" width="18"></iconify-icon>
				<span>Widgets</span>
			</button>
			<button type="button" class="btn btn-sm preset-outlined-surface-500 flex items-center gap-2" onclick={() => (showInspectorDrawer = true)}>
				<iconify-icon icon="mdi:cog" width="18"></iconify-icon>
				<span>Properties</span>
			</button>
		</div>
		<BuzzFormCanvas {fields} {selectedFieldId} onNodeUpdate={handleNodeUpdate} onSelectField={handleSelectField} />
	</div>

	<!-- Desktop: Right inspector always visible; flex + min-h-0 so content can scroll -->
	<div class="hidden min-h-0 shrink-0 flex-col lg:flex lg:w-80">
		<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
			<FieldInspector onDelete={handleDeleteField} />
		</div>
	</div>

	<!-- Mobile/Tablet: Inspector drawer -->
	{#if showInspectorDrawer}
		<div
			class="fixed inset-0 z-40 bg-black/40 lg:hidden"
			role="button"
			tabindex="-1"
			aria-label="Close properties"
			onclick={() => (showInspectorDrawer = false)}
			onkeydown={(e) => e.key === 'Escape' && (showInspectorDrawer = false)}
		></div>
		<div
			class="fixed right-0 top-0 z-50 h-full w-[min(100vw,20rem)] border-l border-surface-200-800 bg-surface-50-950 shadow-xl lg:hidden"
			role="dialog"
			aria-label="Field properties"
		>
			<div class="flex h-12 items-center justify-between border-b border-surface-200-800 px-4">
				<span class="font-semibold">Properties</span>
				<button type="button" class="btn-icon preset-ghost-surface-500" aria-label="Close" onclick={() => (showInspectorDrawer = false)}>
					<iconify-icon icon="mdi:close" width="24"></iconify-icon>
				</button>
			</div>
			<div class="h-[calc(100%-3rem)] min-h-0 overflow-y-auto">
				<FieldInspector onDelete={handleDeleteField} />
			</div>
		</div>
	{/if}
</div>
