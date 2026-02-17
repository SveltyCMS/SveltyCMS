<!--
@file src/components/plugins/PluginComponent.svelte
@component Dynamic wrapper for plugin UI components
-->

<script lang="ts">
	import { getPluginComponent } from '@src/plugins/client';

	interface Props {
		componentName: string;
		pluginId: string;
		[key: string]: any; // Props to pass to the plugin component
	}

	const { pluginId, componentName, ...restProps }: Props = $props();

	let Component: any = $state(null);
	let loading = $state(true);
	let error = $state(false);

	$effect(() => {
		let isMounted = true;
		loading = true;
		error = false;

		getPluginComponent(pluginId, componentName)
			.then((comp) => {
				if (isMounted) {
					Component = comp;
					loading = false;
				}
			})
			.catch(() => {
				if (isMounted) {
					error = true;
					loading = false;
				}
			});

		return () => {
			isMounted = false;
		};
	});
</script>

{#if Component}
	<Component {...restProps} />
{:else if loading}
	<div class="h-4 w-4 animate-spin rounded-full border-2 border-surface-300 border-t-primary-500"></div>
{:else if error}
	<iconify-icon icon="mdi:alert-circle" class="text-error-500"></iconify-icon>
{/if}
