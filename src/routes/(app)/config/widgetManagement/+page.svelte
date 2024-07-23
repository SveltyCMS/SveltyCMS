<script lang="ts">
	import { onMount } from 'svelte';
	//import { activateWidget, deactivateWidget, getInstalledWidgets, getActiveWidgets } from './widgetManager';

	// Component
	import PageTitle from '@components/PageTitle.svelte';

	type Widget = {
		name: string;
		status: 'active' | 'inactive';
	};

	let installedWidgets: Widget[] = [];
	let activeWidgets: string[] = [];

	onMount(async () => {
		await loadWidgets();
	});

	async function loadWidgets() {
		try {
			// const widgets = await getInstalledWidgets();
			// activeWidgets = await getActiveWidgets();
			// installedWidgets = widgets.map((widget) => ({
			// 	...widget,
			// 	status: activeWidgets.includes(widget.name) ? 'active' : 'inactive'
			// }));
			return [];
		} catch (error) {
			console.error('Failed to load widgets:', error);
		}
	}

	async function toggleWidgetStatus(widget: Widget) {
		const newStatus = widget.status === 'active' ? 'inactive' : 'active';
		try {
			if (newStatus === 'active') {
				//await activateWidget(widget.name);
			} else {
				//await deactivateWidget(widget.name);
			}
			widget.status = newStatus;
		} catch (error) {
			console.error(`Failed to update widget status for ${widget.name}:`, error);
		}
	}
</script>

<div class="my-2 flex items-center justify-between">
	<PageTitle name="Widget Management" icon="" />
</div>

{#each installedWidgets as widget}
	<div class="my-4 flex items-center justify-between border-b pb-2">
		<span>{widget.name}</span>
		<button class="ml-4 rounded border px-4 py-2" on:click={() => toggleWidgetStatus(widget)}>
			{widget.status === 'active' ? 'Deactivate' : 'Activate'}
		</button>
	</div>
{/each}
