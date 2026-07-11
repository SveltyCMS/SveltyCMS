<!--
@file src/components/site/svedit/cta-node.svelte
@component Svedit call-to-action block with label and link.
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import { getContext } from 'svelte';
	import { Node, TextProperty } from 'svedit';
	import type { Session } from 'svedit';

	interface Props {
		path: Array<string | number>;
	}

	let { path }: Props = $props();

	const svedit = getContext<{ session: Session }>('svedit');
	const node = $derived(svedit.session.get(path));
	const href = $derived(typeof node?.href === 'string' && node.href ? node.href : '#');
</script>

<Node {path}>
	<div class="mb-10">
		<Button variant="primary" {href}>
			<TextProperty path={[...path, 'label']} placeholder="Button label" />
		</Button>
	</div>
</Node>