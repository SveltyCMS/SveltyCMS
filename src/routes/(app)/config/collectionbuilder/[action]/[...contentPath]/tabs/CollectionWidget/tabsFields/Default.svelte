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

	// Components
	import widgets from '@widgets';
	import InputSwitch from '@components/system/builder/InputSwitch.svelte';

	// Skeleton Stores
	import { getModalStore } from '@skeletonlabs/skeleton';
	const modalStore = getModalStore();

	// Stores
	import { targetWidget } from '@src/stores/collectionStore.svelte';
	import type { GuiSchema } from '@root/src/widgets/core/group/types';

	// Get the keys of the widgets object

	interface Props {
		guiSchema: GuiSchema;
	}

	let { guiSchema }: Props = $props();

	function defaultValue(property: string) {
		if (property === 'required' || property === 'translated') {
			return false;
		} else return targetWidget.value.widget.Name;
	}

	function handleUpdate(event: CustomEvent, property: string) {
		targetWidget.update((w) => {
			w[property] = event.detail.value;

			return w;
		});
	}
</script>

{#if $modalStore[0]}
	<!-- Default section -->
	<div class="mb-2 border-y text-center text-primary-500">
		<div class="text-xl text-primary-500">
			Widget <span class="font-bold text-black dark:text-white">{$modalStore[0].value.widget.Name}</span> Input Options
		</div>
		<div class="my-1 text-xs text-error-500">* Required</div>
	</div>

	<div class="options-table">
		{#each ['label', 'display', 'db_fieldName', 'required', 'translated', 'icon', 'helper', 'width'] as property}
			<InputSwitch
				value={targetWidget.value[property] ?? defaultValue(property)}
				icon={targetWidget.value[property] as string}
				widget={asAny(guiSchema[property]?.widget)}
				key={property}
				on:update={(e) => handleUpdate(e, property)}
			/>
		{/each}
	</div>
{/if}
