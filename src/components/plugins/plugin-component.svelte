<!--
@file src/components/plugins/plugin-component.svelte
@component Dynamic wrapper for plugin UI components
-->

<script lang="ts">
	import { getPluginComponent, peekPluginComponent } from '@src/plugins/client';
	import { untrack } from 'svelte';

	interface Props {
		componentName: string;
		pluginId: string;
		[key: string]: any; // Props to pass to the plugin component
	}

	const { pluginId, componentName, ...restProps }: Props = $props();

	// Eager peek is a one-time init (registry is warm at mount) — untrack makes
	// the intentional non-reactivity explicit and silences the rune lint.
	let Component: any = $state(untrack(() => peekPluginComponent(pluginId, componentName)));
	let loading = $state(untrack(() => !Component));
	let error = $state(false);
	// Which (pluginId:componentName) the loaded Component belongs to — stateful
	// marker, not a derived: it must NOT track prop changes itself.
	let loadedKey = $state('');

	$effect(() => {
		const key = `${pluginId}:${componentName}`;
		const warmed = peekPluginComponent(pluginId, componentName);
		if (warmed) {
			Component = warmed;
			loading = false;
			error = false;
			loadedKey = key;
			return;
		}
		if (key === loadedKey && Component) return;

		let isMounted = true;
		loading = true;
		error = false;
		loadedKey = key;

		getPluginComponent(pluginId, componentName)
			.then((comp) => {
				if (isMounted) {
					Component = comp;
					loading = false;
					if (!comp) error = true;
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
	<div class="h-4 w-4 animate-spin rounded-full border-2 border-surface-500/30 border-t-primary-500"></div>
{:else if error}
	<iconify-icon icon="mdi:alert-circle" class="text-error-500"></iconify-icon>
{/if}
