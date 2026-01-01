<!-- 
@files src/routes/(app)/config/collectionbuilder/[...contentTypes]/tabs/CollectionWidget/tabsFields/Default.svelte
@component
**This component displays the default tab fields**

Features:
- Label
- Display
- DB Field Name
- Required
- Translated
- Icon
- Helper
- Width

-->

<script lang="ts">
	import { asAny } from '@utils/utils';
	import type { Component } from 'svelte';

	// Components
	import InputSwitch from '@components/system/builder/InputSwitch.svelte';

	// Skeleton Stores
	import { getModalStore } from '@utils/modalState.svelte';
	const modalStore = getModalStore();

	// Stores
	import { collections } from '@src/stores/collectionStore.svelte';

	// GuiSchema is a record of field properties with their widget configs
	type GuiSchema = Record<string, { widget: Component<any> }>;

	interface Props {
		guiSchema: GuiSchema;
	}

	const { guiSchema }: Props = $props();

	// Get all properties from the guiSchema
	const allProperties = $derived(Object.keys(guiSchema || {}));

	// Define standard/default properties that should appear first
	const standardProperties = ['label', 'db_fieldName', 'required', 'translated', 'icon', 'helper', 'width'];

	// Get additional properties from the widget's GuiSchema
	const additionalProperties = $derived(allProperties.filter((prop) => !standardProperties.includes(prop) && prop !== 'permissions'));

	// Combine them in order: standard first, then additional
	const displayProperties = $derived([...standardProperties, ...additionalProperties]);

	function defaultValue(property: string) {
		if (property === 'required' || property === 'translated') {
			return false;
		} else return (collections.targetWidget.widget as any)?.Name;
	}

	function handleUpdate(detail: { value: any }, property: string) {
		// Update the targetWidget store
		const currentWidget = collections.targetWidget;
		currentWidget[property] = detail.value;
		collections.setTargetWidget(currentWidget);
	}
</script>

{#if $modalStore[0]}
	<!-- Default section -->
	<div class="flex flex-col gap-4">
		{#each displayProperties as property}
			{#if guiSchema[property]}
				<InputSwitch
					value={collections.targetWidget[property] ?? defaultValue(property)}
					icon={collections.targetWidget[property] as string}
					widget={asAny(guiSchema[property]?.widget)}
					key={property}
					onupdate={(e: { value: any }) => handleUpdate(e, property)}
				/>
			{/if}
		{/each}
	</div>
{/if}
