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

	// Widget Manager
	import { type WidgetStatus, loadWidgets, getActiveWidgets, updateWidgetStatus } from '@widgets/widgetManager.svelte.ts';

	interface Widget {
		Name: string;
		Description: string;
		Icon: string;
		status: WidgetStatus;
	}

	let installedWidgets: Widget[] = $state([]);
	let error: string | null = $state(null);

	// Load widgets on mount
	onMount(async () => {
		try {
			const widgets = await loadWidgets();
			const active = await getActiveWidgets();

			// Transform widgets into the format we need
			installedWidgets = Object.values(widgets).map((widget) => ({
				Name: widget.Name,
				Description: (widget.config?.description as string) || 'No description available',
				Icon: (widget.config?.icon as string) || 'mdi:puzzle',
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
			await updateWidgetStatus(widget.Name, newStatus);
			widget.status = newStatus;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to update widget status';
			console.error('Failed to update widget status:', err);
		}
	}
</script>

<!-- Page Title with Back Button -->
<PageTitle name="Widget Management" icon="mdi:widgets" showBackButton={true} backUrl="/config" />

<div class="card p-4">
	{#each installedWidgets as widget}
		<div class="flex min-h-[70px] items-center justify-between border-b hover:bg-surface-300 dark:hover:bg-surface-500">
			<div class="flex items-center">
				<iconify-icon icon={widget.Icon} width="38" class="mr-2 text-error-500"></iconify-icon>
				<div>
					<h3 class="text-lg font-semibold">{widget.Name}</h3>
					<p class="text-wrap text-sm text-tertiary-500 dark:text-primary-500">
						{widget.Description}
					</p>
				</div>
			</div>
			<button
				class="btn mx-2 min-w-[200px] variant-{widget.status === 'active' ? 'ghost-error ' : 'filled-primary'}"
				onclick={() => toggleWidget(widget)}
			>
				{widget.status === 'active' ? 'Deactivate' : 'Activate'}
			</button>
		</div>
	{/each}

	{#if installedWidgets.length === 0}
		<p class="text-center text-tertiary-500 dark:text-primary-500">
			There are currently no widgets available. Visit the SveltyCMS marketplace to find new widgets and extend your system.
		</p>

		<a
			href="https://www.sveltyCMS.com"
			target="_blank"
			rel="noopener noreferrer"
			aria-label={m.config_Martketplace()}
			class="variant-ghost-primary btn w-full"
		>
			<iconify-icon icon="icon-park-outline:shopping-bag" width="28" class="text-white"></iconify-icon>
			<p class="uppercase">{m.config_Martketplace()}</p>
		</a>
	{/if}
</div>
