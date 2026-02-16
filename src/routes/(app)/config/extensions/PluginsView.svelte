<!--
@file src/routes/(app)/config/extensions/PluginsView.svelte
@component PluginsView

Features:
- Toggle plugin enabled/disabled state
- Configure plugin
-->
<script lang="ts">
	// Using iconify-icon web component
	/**
	 * @file src/routes/(app)/config/extensions/PluginsView.svelte
	 */
	// import { showToast } from '@utils/toast'; // Need to check if this exists in current codebase

	interface Props {
		data: {
			plugins: any[];
			[key: string]: any;
		};
	}

	let { data }: Props = $props();

	async function handleToggle(plugin: any) {
		const newEnabledState = !plugin.enabled;

		// Optimistic UI update
		plugin.enabled = newEnabledState;

		try {
			const response = await fetch('/api/plugins/toggle', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ pluginId: plugin.name, enabled: newEnabledState })
			});

			const result = await response.json();

			if (!result.success) {
				// Revert on failure
				plugin.enabled = !newEnabledState;
				alert(result.message || 'Failed to toggle plugin');
			}
		} catch (error) {
			// Revert on error
			plugin.enabled = !newEnabledState;
			alert('An error occurred while communicating with the server');
			console.error(error);
		}
	}

	function handleConfigure(plugin: any) {
		if (plugin.missingConfig && plugin.configUrl) {
			window.location.href = plugin.configUrl;
			return;
		}

		console.log('Configure plugin:', plugin);
		// Future: Open configuration modal
		alert(`Configuration for ${plugin.displayName} coming soon!`);
	}
</script>

<div class="mb-6 text-center text-surface-500 dark:text-surface-50">Manage installed plugins to extend your CMS functionality.</div>

<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
	{#if !data.plugins || data.plugins.length === 0}
		<div class="col-span-full py-12 text-center text-surface-400">
			<iconify-icon icon="mdi:help-circle" width="24"></iconify-icon>
			<p>No plugins installed.</p>
		</div>
	{:else}
		{#each data.plugins as plugin (plugin.name)}
			<div
				class="flex flex-col rounded-lg border border-surface-200 bg-white p-5 shadow-sm transition-all hover:shadow-md dark:border-surface-700 dark:bg-surface-800"
			>
				<div class="mb-3 flex items-start justify-between">
					<div class="flex items-center gap-3">
						<div class="flex h-12 w-12 items-center justify-center rounded-lg bg-surface-50 dark:bg-surface-900/50">
							<iconify-icon icon={plugin.icon || 'mdi:puzzle'} width="32" class="text-primary-500"></iconify-icon>
						</div>
						<div>
							<div class="flex items-center gap-2">
								<h3 class="font-bold">{plugin.displayName}</h3>
								{#if plugin.missingConfig}
									<div class="group relative">
										<iconify-icon icon="mdi:alert-circle" width="18" class="text-warning-500"></iconify-icon>
										<div
											class="absolute bottom-full left-1/2 mb-2 hidden w-48 -translate-x-1/2 rounded bg-surface-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:block group-hover:opacity-100"
										>
											Missing Configuration
											<div class="absolute -bottom-1 left-1/2 -ml-1 h-2 w-2 rotate-45 bg-surface-900"></div>
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
					<!-- status -->
					<div class="flex items-center">
						<button
							onclick={() => handleToggle(plugin)}
							class="inline-flex cursor-pointer items-center rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors {plugin.enabled
								? 'bg-primary-500 text-white hover:bg-primary-600'
								: 'bg-surface-200 text-surface-600 hover:bg-surface-300 dark:bg-surface-700 dark:text-surface-400'}"
						>
							{plugin.enabled ? 'Active' : 'Disabled'}
						</button>
					</div>
				</div>
				<!-- description -->
				<p class="mb-4 line-clamp-2 grow text-sm text-surface-500 dark:text-surface-50">
					{plugin.description}
				</p>

				<!-- actions -->
				<div class="mt-auto flex items-center justify-end gap-2 border-t border-surface-100 pt-3 dark:border-surface-700">
					<button class="preset-filled-surface-500 btn-sm btn" onclick={() => handleConfigure(plugin)}>
						<iconify-icon icon="mdi:cog" width="18" class="mr-1"></iconify-icon>
						Configure
					</button>
				</div>
			</div>
		{/each}
	{/if}
</div>
