<!--
@file: src/routes/(app)/dashboard/widgets/MemoryWidget.svelte
@description:  Dashboard widget for displaying system messages with improved rendering and error handling.

This widget displays the last 5 system messages added to the database.


Features:
- Responsive doughnut chart visualization
- Theme-aware rendering (light/dark mode support)
- Real-time data updates
- Customizable widget properties (size, position, etc.)
- Improved error handling and data validation
- Proper lifecycle management
- Enhanced debugging and logging

Usage:
<SystemMessagesWidget label="System Messages" />
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import axios from 'axios';
	import { popup, type PopupSettings } from '@skeletonlabs/skeleton';

	// Define the structure of a system message
	interface SystemMessage {
		title: string;
		timestamp: string;
		body: string;
	}

	// Define the type of the messages array
	let messages: SystemMessage[] = [];

	// Skeleton popup settings
	const RemoveTooltip: PopupSettings = {
		event: 'hover',
		target: 'Remove',
		placement: 'right'
	};

	export let label: string;

	onMount(async () => {
		const response = await axios.get('/api/systemMessages');
		messages = response.data;
	});

	function removeWidget() {
		const el = document.getElementById('systemMessagesWidget');
		if (el && el.parentElement) {
			el.parentElement.remove();
			saveWidgets();
		}
	}

	function saveWidgets() {
		const serializedWidgets = gridController.save();
		localStorage.setItem('dashboardWidgets', JSON.stringify(serializedWidgets));
	}
</script>

<div id="systemMessagesWidget" class="relative rounded-lg bg-white p-4 shadow-md dark:bg-gray-800">
	<h3 class="mb-2 text-lg font-bold">{label} <span class="variant-filled badge">Alert</span></h3>
	<ul>
		{#each messages as message}
			<li class="mb-1">
				<strong>{message.title}</strong>
				<small class="text-gray-500">({new Date(message.timestamp).toLocaleString()})</small>
				<p>{message.body}</p>
			</li>
		{/each}
	</ul>
	<button on:click={removeWidget} use:popup={RemoveTooltip} class="remove-button absolute right-2 top-2 rounded bg-error-500 px-2 py-1 text-white">
		<!-- Popup Tooltip with the arrow element -->
		<div class="card variant-filled z-50 max-w-sm p-2" data-popup="Remove">
			Remove
			<div class="variant-filled arrow" />
		</div>
	</button>
</div>

<style lang="postcss">
	.remove-button {
		position: absolute;
		top: 5px;
		right: 5px;
		background: red;
		color: white;
		border: none;
		cursor: pointer;
	}
</style>
