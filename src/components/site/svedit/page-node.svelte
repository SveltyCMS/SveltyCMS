<!--
@file src/components/site/svedit/page-node.svelte
@component Svedit page document root — renders the body node array.
-->

<script lang="ts">
	import { Node, NodeArrayProperty } from 'svedit';

	interface Props {
		path: Array<string | number>;
	}

	let { path }: Props = $props();
</script>

<Node {path}>
	<div class="svedit-page">
		<NodeArrayProperty class="svedit-page-body" path={[...path, 'body']} />
	</div>
</Node>

<style>
	:global(.svedit-page-body) {
		display: grid;
		grid-template-columns: 1fr;
	}
</style>