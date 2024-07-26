<script lang="ts">
	import { onMount } from 'svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Component
	import PageTitle from '@components/PageTitle.svelte';

	type Widget = {
		name: string;
		status: 'active' | 'inactive';
	};

	let installedWidgets: Widget[] = [];
	let activeWidgets: string[] = []; // Placeholder until implemented

	onMount(async () => {
		try {
			const widgets = await loadWidgets(); // Replace with actual implementation
			activeWidgets = await getActiveWidgets(); // Replace with actual implementation
			installedWidgets = widgets.map((widget) => ({
				...widget,
				status: activeWidgets.includes(widget.name) ? 'active' : 'inactive'
			}));
		} catch (error) {
			console.error('Failed to load widgets:', error);
			// Display an error message to the user
		}
	});

	async function loadWidgets(): Promise<Widget[]> {
		// Implement your logic to fetch installed widgets from the server or local storage
		return []; // Replace with actual implementation
	}

	async function getActiveWidgets(): Promise<string[]> {
		// Implement your logic to fetch currently active widgets from the server or local storage
		return []; // Replace with actual implementation
	}

	async function toggleWidgetStatus(widget: Widget) {
		const newStatus = widget.status === 'active' ? 'inactive' : 'active';
		try {
			if (newStatus === 'active') {
				await activateWidget(widget.name); // Replace with actual implementation
			} else {
				await deactivateWidget(widget.name); // Replace with actual implementation
			}
			widget.status = newStatus;
		} catch (error) {
			console.error(`Failed to update widget status for ${widget.name}:`, error);
			// Display an informative message to the user about the failure
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

{#if installedWidgets.length === 0}
	<p class="my-2 text-center">
		There are currently no widgets available. Visit the SveltyCMS marketplace to find new widgets and extend your system.
	</p>

	<a
		href="https://www.sveltyCMS.com"
		target="_blank"
		rel="noopener noreferrer"
		class="variant-ghost-primary btn w-full gap-2 py-6"
		aria-label={m.config_Martketplace()}
	>
		<iconify-icon icon="icon-park-outline:shopping-bag" width="28" class="text-white" />
		<p class="uppercase">{m.config_Martketplace()}</p>
	</a>
{/if}
