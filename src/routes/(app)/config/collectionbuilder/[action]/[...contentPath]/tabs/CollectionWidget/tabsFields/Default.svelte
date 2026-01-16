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
	import type { SvelteComponent } from 'svelte';

	// Components
	import InputSwitch from '@components/system/builder/InputSwitch.svelte';

	// Stores
	import { targetWidget } from '@src/stores/collectionStore.svelte';

	// GuiSchema is a record of field properties with their widget configs
	type GuiSchema = Record<string, { widget: typeof SvelteComponent }>;

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
		} else return (targetWidget.value.widget as any)?.Name;
	}

	function handleUpdate(detail: { value: any }, property: string) {
		// Update the targetWidget store
		const currentWidget = targetWidget.value;
		currentWidget[property] = detail.value;
		targetWidget.value = currentWidget;
	}
</script>

{#if targetWidget.value}
	<!-- Default section -->
	<div class="mb-2 border-y text-center text-primary-500">
		<div class="text-xl text-primary-500">
			Widget <span class="font-bold text-black dark:text-white">{(targetWidget.value.widget as any).Name}</span> Input Options
		</div>
		<div class="my-1 text-xs text-error-500">* Required</div>
	</div>

	<div class="options-table">
		{#each displayProperties as property}
			{#if guiSchema[property]}
				<InputSwitch
					value={targetWidget.value[property] ?? defaultValue(property)}
					icon={targetWidget.value[property] as string}
					widget={asAny(guiSchema[property]?.widget)}
					key={property}
					onupdate={(e: { value: any }) => handleUpdate(e, property)}
				/>
			{/if}
		{/each}
	</div>
{/if}
