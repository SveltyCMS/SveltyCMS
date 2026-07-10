<!--
@file src/components/site/svedit/hero-node.svelte
@component Svedit hero block with heading and subheading.
-->

<script lang="ts">
	import { Node, TextProperty } from 'svedit';

	interface Props {
		path: Array<string | number>;
	}

	let { path }: Props = $props();
</script>

<Node {path}>
	<section
		class="mb-12 rounded-2xl bg-gradient-to-br from-primary-500/10 via-surface-50 to-tertiary-500/10 p-8 dark:from-primary-500/20 dark:via-surface-900 dark:to-tertiary-500/10"
	>
		<TextProperty
			class="text-4xl font-bold tracking-tight text-surface-900 dark:text-surface-50"
			path={[...path, 'heading']}
			placeholder="Hero heading"
		/>
		<TextProperty
			class="mt-4 text-lg text-surface-600 dark:text-surface-300"
			path={[...path, 'subheading']}
			placeholder="Hero subheading"
		/>
	</section>
</Node>