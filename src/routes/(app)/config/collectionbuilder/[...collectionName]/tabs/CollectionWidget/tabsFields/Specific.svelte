<!-- 
@files src/routes/(app)/config/collectionbuilder/[...collectionName]/tabs/CollectionWidget/tabsFields/Specific.svelte
@description This component displays the specific tab fields.
-->

<script lang="ts">
	import { asAny } from '@utils/utils';

	// Components
	import widgets from '@components/widgets';
	import InputSwitch from '@components/system/builder/InputSwitch.svelte';

	// Skeleton Stores
	import { getModalStore } from '@skeletonlabs/skeleton';
	const modalStore = getModalStore();

	import { targetWidget } from '@stores/collectionStore';

	// Get the keys of the widgets object
	const widget_keys = Object.keys(widgets) as unknown as keyof typeof widgets;
	export let guiSchema: (typeof widgets)[typeof widget_keys]['GuiSchema'];

	// Function to handle permission updates
	function handleToggle(event: CustomEvent, property: string) {
		targetWidget.update((w) => {
			w[property] = event.detail;
			return w;
		});
	}

	// Get current widget schema
	$: currentWidgetName = $modalStore[0]?.value?.widget?.Name;
	$: currentGuiSchema = currentWidgetName ? widgets[currentWidgetName]?.GuiSchema : null;

	// Get specific fields (excluding default fields)
	const defaultFields = ['label', 'display', 'db_fieldName', 'required', 'translated', 'icon', 'helper', 'width', 'permissions'];

	$: specificFields = currentGuiSchema ? Object.keys(currentGuiSchema).filter((key) => !defaultFields.includes(key)) : [];
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
