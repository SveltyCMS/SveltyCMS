<!-- 
@files src/routes/(app)/config/collectionbuilder/[...collectionName]/tabs/CollectionWidget/tabsFields/Specific.svelte
@description This component displays specific tab fields.
-->

<script lang="ts">
	import { asAny } from '@utils/utils';

	// Components
	import widgets from '@components/widgets';
	import InputSwitch from '@components/system/builder/InputSwitch.svelte';

	// Skeleton Stores
	import { getModalStore } from '@skeletonlabs/skeleton';
	import { targetWidget } from '@stores/collectionStore';

	const modalStore = getModalStore();

	// Define widget keys and excluded fields for specificity
	const defaultFields = ['label', 'display', 'db_fieldName', 'required', 'translated', 'icon', 'helper', 'width', 'permissions'];

	// Reactive statements to derive widget-related data
	$: currentWidgetName = $modalStore[0]?.value?.widget?.Name;
	$: currentGuiSchema = currentWidgetName ? widgets[currentWidgetName]?.GuiSchema : null;
	$: specificFields = currentGuiSchema ? Object.keys(currentGuiSchema).filter((key) => !defaultFields.includes(key)) : [];

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
			bind:value={$targetWidget[property]}
			on:toggle={(e) => handleToggle(e, property)}
			widget={asAny(currentGuiSchema[property]?.widget)}
			key={property}
		/>
	{/each}
{:else if $modalStore[0] && currentWidgetName}
	<div class="text-center text-sm text-gray-500">No specific options for this widget type</div>
{/if}
