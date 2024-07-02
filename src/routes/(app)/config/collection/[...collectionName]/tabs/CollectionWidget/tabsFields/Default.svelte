<script lang="ts">
	import { asAny } from '@utils/utils';

	// Components
	import widgets from '@components/widgets';
	import InputSwitch from '@components/system/builder/InputSwitch.svelte';

	// Skeleton Stores
	import { getModalStore } from '@skeletonlabs/skeleton';
	const modalStore = getModalStore();

	import { targetWidget } from '@src/stores/store';

	// Get the keys of the widgets object
	const widget_keys = Object.keys(widgets) as unknown as keyof typeof widgets;
	export let guiSchema: (typeof widgets)[typeof widget_keys]['GuiSchema'];

	// Function to handle toggle updates
	function handleToggle(event: CustomEvent, property: string) {
		targetWidget.update((w) => {
			w[property] = event.detail;
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
			{#if property === 'icon'}
				<InputSwitch
					bind:iconselected={$targetWidget[property]}
					widget={asAny(guiSchema[$modalStore[0].value.widget.Name].GuiSchema[property]?.widget)}
					key={property}
				/>
			{:else if property === 'translated' || property === 'required'}
				<InputSwitch
					bind:value={$targetWidget[property]}
					widget={asAny(guiSchema[$modalStore[0].value.widget.Name].GuiSchema[property]?.widget)}
					key={property}
					on:toggle={(e) => handleToggle(e, property)}
				/>
			{:else}
				<InputSwitch
					bind:value={$targetWidget[property]}
					widget={asAny(guiSchema[$modalStore[0].value.widget.Name].GuiSchema[property]?.widget)}
					key={property}
				/>
			{/if}
		{/each}
	</div>
{/if}
