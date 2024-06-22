<script lang="ts">
	import { onMount } from 'svelte';
	import axios from 'axios';

	// Skeleton
	import { popup, type PopupSettings } from '@skeletonlabs/skeleton';

	// Popup Tooltips
	const RemoveTooltip: PopupSettings = {
		event: 'hover',
		target: 'Remove',
		placement: 'right'
	};

	export let label: string;
	let messages = [];

	onMount(async () => {
		const response = await axios.get('/api/systemMessages');
		messages = response.data;
	});

	function removeWidget() {
		const el = document.getElementById('systemMessagesWidget');
		el.parentElement.remove();
		saveWidgets();
	}

	function saveWidgets() {
		const serializedWidgets = gridController.save();
		localStorage.setItem('dashboardWidgets', JSON.stringify(serializedWidgets));
	}
</script>

<div id="systemMessagesWidget" class="relative rounded-lg bg-white p-4 shadow-md dark:bg-gray-800">
	<h3 class="mb-2 text-lg font-bold">{label} <Badge>Alert</Badge></h3>
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

<style>
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
