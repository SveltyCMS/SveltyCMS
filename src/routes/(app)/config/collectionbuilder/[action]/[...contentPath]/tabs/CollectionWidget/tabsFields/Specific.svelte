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
	import widgets from '@widgets';
	import InputSwitch from '@components/system/builder/InputSwitch.svelte';

	// Skeleton Stores
	import { getModalStore } from '@skeletonlabs/skeleton';
	import { targetWidget } from '@src/stores/collectionStore.svelte';

	const modalStore = getModalStore();

	// Define widget keys and excluded fields for specificity
	const defaultFields = ['label', 'display', 'db_fieldName', 'required', 'translated', 'icon', 'helper', 'width', 'permissions'];

	// Reactive statements to derive widget-related data
	let currentWidgetName = $derived($modalStore[0]?.value?.widget?.Name);
	let currentGuiSchema = $derived(currentWidgetName ? widgets[currentWidgetName]?.GuiSchema : null);
	let specificFields = $derived(currentGuiSchema ? Object.keys(currentGuiSchema).filter((key) => !defaultFields.includes(key)) : []);

	/** Updates the target widget property */
	function handleToggle(event: CustomEvent<boolean>, property: string) {
		targetWidget.update((w) => {
			w[property] = event.detail;
			return w;
		});
	}
</script>

{#if $modalStore[0] && currentGuiSchema && specificFields.length > 0}
	{#each specificFields as property}
		<InputSwitch
			value={targetWidget.value[property]}
			on:toggle={(e) => handleToggle(e, property)}
			widget={asAny(currentGuiSchema[property]?.widget)}
			key={property}
		/>
	{/each}
{:else if $modalStore[0] && currentWidgetName}
	<div class="text-center text-sm text-gray-500">No specific options for this widget type</div>
{/if}
