<script lang="ts">
	import { asAny } from '@utils/utils';

	// Components
	import widgets from '@components/widgets';
	import InputSwitch from '@components/system/builder/InputSwitch.svelte';

	// Skeleton Stores
	import { getModalStore } from '@skeletonlabs/skeleton';
	const modalStore = getModalStore();

	import { targetWidget } from '@src/stores/store';

	// Props
	export let tabSet;
	// Get the keys of the widgets object
	let widget_keys = Object.keys(widgets) as unknown as keyof typeof widgets;
	export let guiSchema: (typeof widgets)[typeof widget_keys]['GuiSchema'];

	// Function to handle permission updates
	function handleToggle(event: CustomEvent, property: string) {
		targetWidget.update((w) => {
			w[property] = event.detail;
			return w;
		});
	}
</script>

{#if $modalStore[0] && tabSet === 2}
	{#each Object.keys(guiSchema[$modalStore[0].value.widget.key].GuiSchema) as property}
		{#if !['label', 'display', 'db_fieldName', 'required', 'translated', 'icon', 'helper', 'width'].includes(property)}
			<InputSwitch
				bind:value={$targetWidget[property]}
				on:toggle={(e) => handleToggle(e, property)}
				widget={asAny(guiSchema[$modalStore[0].value.widget.key].GuiSchema[property]?.widget)}
				key={property}
			/>
		{/if}
	{/each}
{/if}
