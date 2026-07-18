<!--
@file src/routes/(app)/config/extensions/plugins-view.svelte
@component PluginsView — toggle plugin enabled state and open configure.

### Features:
- Optimistic toggle with CSRF
- toast instead of alert
- Stable data-testids
-->
<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import { toast } from '@src/stores/toast.svelte.ts';
	import { togglePlugin } from './plugins-api';

	interface Props {
		data: {
			plugins: any[];
			[key: string]: any;
		};
	}

	let { data }: Props = $props();

	async function handleToggle(plugin: any) {
		const newEnabledState = !plugin.enabled;
		plugin.enabled = newEnabledState;

		try {
			const result = await togglePlugin(plugin.name, newEnabledState);

			if (!result.success) {
				plugin.enabled = !newEnabledState;
				toast.error(result.message || 'Failed to toggle plugin');
			} else {
				toast.success(`${plugin.displayName} ${newEnabledState ? 'enabled' : 'disabled'}`);
			}
		} catch (error) {
			plugin.enabled = !newEnabledState;
			toast.error('An error occurred while communicating with the server');
			console.error(error);
		}
	}

	function handleConfigure(plugin: any) {
		if (plugin.missingConfig && plugin.configUrl) {
			window.location.href = plugin.configUrl;
			return;
		}
		toast.info(
			`Configuration for ${plugin.displayName} — open System Settings or the plugin panel when available.`,
		);
	}
</script>

<div class="mb-6 text-center text-surface-500 dark:text-surface-50" data-testid="plugins-view">
	Manage installed plugins to extend your CMS functionality.
</div>

<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3" data-testid="plugins-grid">
	{#if !data.plugins || data.plugins.length === 0}
		<div class="col-span-full py-12 text-center text-surface-400" data-testid="plugins-empty">
			<iconify-icon icon="mdi:help-circle" width="24"></iconify-icon>
			<p>No plugins installed.</p>
		</div>
	{:else}
		{#each data.plugins as plugin (plugin.name)}
			<div
				class="flex flex-col rounded border border-surface-200 bg-white p-5 shadow-sm transition-all hover:shadow-md dark:border-surface-700 dark:bg-surface-800"
				data-testid={`plugin-card-${plugin.name}`}
				data-plugin-id={plugin.name}
			>
				<div class="mb-3 flex items-start justify-between">
					<div class="flex items-center gap-3">
						<div class="flex h-12 w-12 items-center justify-center rounded bg-surface-50 dark:bg-surface-900/50">
							<iconify-icon icon={plugin.icon || 'mdi:puzzle'} width="32" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
						</div>
						<div>
							<div class="flex items-center gap-2">
								<h3 class="font-bold">{plugin.displayName}</h3>
								{#if plugin.missingConfig}
									<div class="group relative">
										<iconify-icon icon="mdi:alert-circle" width="18" class="text-warning-500"></iconify-icon>
										<div
											class="absolute bottom-full inset-s-1/2 mb-2 hidden w-48 -translate-x-1/2 rounded bg-surface-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:block group-hover:opacity-100"
										>
											Missing Configuration
											<div class="absolute -bottom-1 inset-s-1/2 -ms-1 h-2 w-2 rotate-45 bg-surface-900"></div>
										</div>
									</div>
								{/if}
							</div>

							<div class="flex items-center gap-2 text-[10px] opacity-60">
								<span>v{plugin.version}</span>
								<span>•</span>
								<span>{plugin.author}</span>
							</div>
						</div>
					</div>
					<div class="flex items-center">
						<button
							type="button"
							onclick={() => handleToggle(plugin)}
							data-testid={`plugin-toggle-${plugin.name}`}
							aria-label="{plugin.enabled ? 'Disable' : 'Enable'} {plugin.displayName}"
							class="inline-flex cursor-pointer items-center rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors {plugin.enabled
								? 'bg-tertiary-500 dark:bg-primary-500 text-white hover:bg-tertiary-600'
								: 'bg-surface-200 text-surface-600 hover:bg-surface-300 dark:bg-surface-700 dark:text-surface-400'}"
						>
							{plugin.enabled ? 'Active' : 'Disabled'}
						</button>
					</div>
				</div>
				<p class="mb-4 line-clamp-2 grow text-sm text-surface-500 dark:text-surface-50">{plugin.description}</p>

				<div class="mt-auto flex items-center justify-end gap-2 border-t border-surface-100 pt-3 dark:border-surface-700">
					<Button
						variant="surface"
						onclick={() => handleConfigure(plugin)}
						size="sm"
						data-testid={`plugin-configure-${plugin.name}`}
					>
						<iconify-icon icon="mdi:cog" width="18" class="me-1"></iconify-icon>
						Configure
					</Button>
				</div>
			</div>
		{/each}
	{/if}
</div>
