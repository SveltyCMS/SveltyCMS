<!--
@file src/components/site/svedit/paragraph-node.svelte
@component Svedit paragraph text block.
-->

<script lang="ts">
	import { Node, TextProperty } from 'svedit';

	interface Props {
		path: Array<string | number>;
	}

	let { path }: Props = $props();
</script>

<Node {path}>
	<div class="prose prose-surface mb-8 max-w-none dark:prose-invert">
		<TextProperty path={[...path, 'content']} placeholder="Paragraph" />
	</div>
</Node>