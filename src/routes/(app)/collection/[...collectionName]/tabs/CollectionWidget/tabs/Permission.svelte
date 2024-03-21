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
	// Get the keys of the widgets object
	let widget_keys = Object.keys(widgets) as unknown as keyof typeof widgets;
	export let guiSchema: (typeof widgets)[typeof widget_keys]['GuiSchema'];

	// Function to handle permission updates
	function handlePermissionUpdate(event: CustomEvent) {
		targetWidget.update((w) => {
			w.permissions = event.detail;
			return w;
		});
	}
</script>

{#if $modalStore[0]}
	{#each ['permissions'] as property}
		<InputSwitch
			bind:permissions={$targetWidget[property]}
			on:update={handlePermissionUpdate}
			widget={asAny(guiSchema[$modalStore[0].value.widget.key].GuiSchema[property]?.widget)}
			key={property}
		/>
	{/each}
{/if}
