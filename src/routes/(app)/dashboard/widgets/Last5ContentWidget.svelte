<!--
@file: src/routes/(app)/dashboard/widgets/Last5ContentWidget.svelte
@description:  A reusable widget component for displaying last 5 content information with improved rendering and error handling.

This widget fetches and displays real-time disk usage data, including:
- Total disk space
- Used disk space
- Free disk space
- Usage percentages

Features:
- Responsive doughnut chart visualization
- Theme-aware rendering (light/dark mode support)
- Real-time data updates
- Customizable widget properties (size, position, etc.)
- Improved error handling and data validation
- Proper lifecycle management
- Enhanced debugging and logging

Usage:
<Last5ContentWidget label="Last 5 Content" />
-->

<script lang="ts">
	export const id: string = crypto.randomUUID();
	export const x: number = 0;
	export const y: number = 0;
	export const w: number = 2;
	export const h: number = 5;
	export const min: { w: number; h: number } = { w: 1, h: 1 };
	export let max: { w: number; h: number } | undefined;
	export const movable: boolean = true;
	export const resizable: boolean = true;

	import { onMount } from 'svelte';
	import { writable } from 'svelte/store';

	const contentInfo = writable<any[]>([]);
	const loading = writable<boolean>(true);
	const error = writable<string | null>(null);

	onMount(async () => {
		try {
			const res = await fetch('/api/last5Content');
			if (!res.ok) {
				throw new Error(`Failed to fetch data: ${res.statusText}`);
			}
			const data = await res.json();
			contentInfo.set(data);
			loading.set(false);
		} catch (err: unknown) {
			if (err instanceof Error) {
				error.set(err.message);
			} else {
				error.set('An unknown error occurred');
			}
			loading.set(false);
		}
	});
</script>

<div class="widget">
	<h2>Last 5 Content</h2>
	{#if $loading}
		<p>Loading...</p>
	{:else if $error}
		<p>Error: {$error}</p>
	{:else}
		<ul>
			{#each $contentInfo as content}
				<li>{content.title}</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.widget {
		padding: 1rem;
		border: 1px solid #ccc;
		border-radius: 8px;
		background: white;
	}
	.widget h2 {
		margin-bottom: 1rem;
		font-size: 1.25rem;
		color: #333;
	}
	.widget ul {
		list-style-type: none;
		padding: 0;
	}
	.widget li {
		margin-bottom: 0.5rem;
		padding: 0.5rem;
		border: 1px solid #e0e0e0;
		border-radius: 4px;
		background: #f9f9f9;
	}
	.widget li:last-child {
		margin-bottom: 0;
	}
	.widget p {
		color: #666;
	}
</style>
