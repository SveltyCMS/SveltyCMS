<script lang="ts">
	// Components
	import widgets from '@components/widgets';
	import Permission from '@src/components/Permission.svelte';

	// Skeleton Stores
	import { getModalStore } from '@skeletonlabs/skeleton';
	const modalStore = getModalStore();

	import { targetWidget } from '@src/stores/store';

	// Get the keys of the widgets object
	const widget_keys = Object.keys(widgets) as unknown as keyof typeof widgets;
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
	<Permission permissions={$targetWidget['permissions']} on:update={handlePermissionUpdate} />
{/if}
