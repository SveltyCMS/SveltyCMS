<!-- 
@files src/routes/(app)/config/collectionbuilder/[...contentTypes]/tabs/CollectionWidget/tabsFields/Specific.svelte
@component
**This component displays specific tab fields for a widget**

Features:
- Specific tab fields

-->

<script lang="ts">
	import { asAny } from '@utils/utils';

	// Components
	import { widgetFunctions } from '@stores/widgetStore.svelte';
	import InputSwitch from '@components/system/builder/InputSwitch.svelte';

	// Skeleton Stores
	// Skeleton Stores
	import { targetWidget } from '@src/stores/collectionStore.svelte';

	// Define widget keys and excluded fields for specificity
	const defaultFields = ['label', 'display', 'db_fieldName', 'required', 'translated', 'icon', 'helper', 'width', 'permissions'];

	// Reactive statements to derive widget-related data
	const currentWidgetName = $derived((targetWidget.value?.widget as any)?.Name);
	const currentGuiSchema = $derived(currentWidgetName ? $widgetFunctions[currentWidgetName]?.GuiSchema || null : null);
	const specificFields = $derived(currentGuiSchema ? Object.keys(currentGuiSchema).filter((key) => !defaultFields.includes(key)) : []);

	/** Updates the target widget property */
	function handleUpdate(detail: { value: any }, property: string) {
		const currentWidget = targetWidget.value;
		currentWidget[property] = detail.value;
		targetWidget.value = currentWidget;
	}
</script>

{#if targetWidget.value && currentGuiSchema && specificFields.length > 0}
	{#each specificFields as property}
		<InputSwitch
			value={targetWidget.value[property]}
			onupdate={(e: { value: any }) => handleUpdate(e, property)}
			widget={asAny((currentGuiSchema as any)[property]?.widget)}
			key={property}
		/>
	{/each}
{:else if targetWidget.value && currentWidgetName}
	<div class="text-center text-sm text-gray-500">No specific options for this widget type</div>
{/if}
