<!-- 
@files src/routes/(app)/config/collectionbuilder/[...contentTypes]/tabs/CollectionWidget/tabsFields/Specific.svelte
@component
**This component displays specific tab fields for a widget**

Features:
- Specific tab fields

-->

<script lang="ts">
	import { collections } from '@src/stores/collection-store.svelte';
	// Components
	import { widgets } from '@src/stores/widget-store.svelte.ts';
	import { modalState } from '@utils/modal-state.svelte';
	import InputSwitch from '@src/components/system/builder/input-switch.svelte';
	import { asAny } from '@utils/utils';

	// Removed modalStore

	// Define widget keys and excluded fields for specificity
	const defaultFields = ['label', 'display', 'db_fieldName', 'required', 'translated', 'icon', 'helper', 'width', 'permissions'];

	// Reactive statements to derive widget-related data
	const currentWidgetName = $derived((collections.targetWidget as any)?.widget?.Name);
	const currentGuiSchema = $derived(currentWidgetName ? (widgets.widgetFunctions[currentWidgetName] as any)?.GuiSchema || null : null);
	const specificFields = $derived(currentGuiSchema ? Object.keys(currentGuiSchema).filter((key) => !defaultFields.includes(key)) : []);

	/** Updates the target widget property */
	function handleUpdate(detail: { value: any }, property: string) {
		const currentWidget = collections.targetWidget;
		currentWidget[property] = detail.value;
		collections.setTargetWidget(currentWidget);
	}
</script>

{#if modalState.active && currentGuiSchema && specificFields.length > 0}
	{#each specificFields as property (property)}
		<InputSwitch
			value={collections.targetWidget[property]}
			onupdate={(e: { value: any }) => handleUpdate(e, property)}
			widget={asAny((currentGuiSchema as any)[property]?.widget)}
			key={property}
		/>
	{/each}
{:else if modalState.active && currentWidgetName}
	<div class="text-center text-sm text-gray-500">No specific options for this widget type</div>
{/if}
