<!--
@file src/routes/(app)/config/widgetManagement/+page.svelte
@component
**This file sets up and displays the widget management page. It provides a user-friendly interface for managing widgets and their activation status.**

Features:
- List all available widgets
- Toggle widget status (active/inactive)
- View widget details (name, description, icon)
-->

<script lang="ts">
	import { onMount } from 'svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Components
	import PageTitle from '@components/PageTitle.svelte';
	import Loading from '@components/Loading.svelte';

	// Widget Manager
	import { type WidgetStatus, loadWidgets, getActiveWidgets, updateWidgetStatus, activeWidgets } from '@components/widgets/widgetManager';

	interface Widget {
		name: string;
		description: string;
		icon: string;
		status: WidgetStatus;
	}

	let installedWidgets: Widget[] = $state([]);
	let error: string | null = $state(null);

	// Load widgets on mount
	onMount(async () => {
		try {
			const widgets = loadWidgets();
			const active = await getActiveWidgets();

			// Transform widgets into the format we need
			installedWidgets = Object.entries(widgets).map(([name, widget]) => ({
				name: widget.Name,
				description: widget.Description || 'No description available',
				icon: widget.Icon || 'mdi:puzzle',
				status: active.includes(widget.Name) ? 'active' : 'inactive'
			}));
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load widgets';
			console.error('Failed to load widgets:', err);
		}
	});

	// Toggle widget status
	async function toggleWidget(widget: Widget) {
		try {
			const newStatus = widget.status === 'active' ? 'inactive' : 'active';
			await updateWidgetStatus(widget.name, newStatus);
			widget.status = newStatus;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to update widget status';
			console.error('Failed to update widget status:', err);
		}
	}
</script>

<!-- Page Title with Back Button -->
<PageTitle name="Widget Management" icon="mdi:widgets" showBackButton={true} backUrl="/config" />

{#if loading}
	<div class="flex h-48 items-center justify-center">
		<Loading />
	</div>
{:else if error}
	<div class="alert variant-filled-error" role="alert">
		<iconify-icon icon="mdi:alert" width="20"></iconify-icon>
		<span>{error}</span>
	</div>
{:else}
	<div class="card p-4">
		{#each installedWidgets as widget}
			<div class="my-2 flex items-center justify-between border-b pb-2">
				<div class="flex items-center gap-2">
					<iconify-icon icon={widget.icon} width="24"></iconify-icon>
					<div>
						<h3 class="text-lg font-semibold">{widget.name}</h3>
						<p class="text-sm text-tertiary-500 dark:text-primary-500">{widget.description}</p>
					</div>
				</div>
				<button class="btn variant-{widget.status === 'active' ? 'filled' : 'ghost'}-primary" onclick={() => toggleWidget(widget)}>
					{widget.status === 'active' ? 'Deactivated' : 'Activate'}
				</button>
			</div>
		{/each}

		{#if installedWidgets.length === 0}
			<p class="my-2 text-center text-tertiary-500 dark:text-primary-500">
				There are currently no widgets available. Visit the SveltyCMS marketplace to find new widgets and extend your system.
			</p>

			<a
				href="https://www.sveltyCMS.com"
				target="_blank"
				rel="noopener noreferrer"
				aria-label={m.config_Martketplace()}
				class="variant-ghost-primary btn w-full gap-2 py-6"
			>
				<iconify-icon icon="icon-park-outline:shopping-bag" width="28" class="text-white"></iconify-icon>
				<p class="uppercase">{m.config_Martketplace()}</p>
			</a>
		{/if}
	</div>
{/if}
