<script lang="ts">
	export let id: string = crypto.randomUUID();
	export let x: number = 0;
	export let y: number = 0;
	export let w: number = 2;
	export let h: number = 5;
	export let min: { w: number; h: number } = { w: 1, h: 1 };
	export let max: { w: number; h: number } | undefined;
	export let movable: boolean = true;
	export let resizable: boolean = true;

	import { onMount } from 'svelte';
	import { writable } from 'svelte/store';

	const contentInfo = writable<any[]>([]);

	onMount(async () => {
		const res = await fetch('/api/last5Content');
		const data = await res.json();
		contentInfo.set(data);
	});
</script>

<div class="widget">
	<h2>Last 5 Content</h2>
	<ul>
		{#each $contentInfo as content}
			<li>{content.title}</li>
		{/each}
	</ul>
</div>

<style>
	.widget {
		padding: 1rem;
		border: 1px solid #ccc;
		border-radius: 8px;
		background: white;
	}
</style>
