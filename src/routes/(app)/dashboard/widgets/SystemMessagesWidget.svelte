<!--
@file src/routes/(app)/dashboard/widgets/SystemMessagesWidget.svelte
@component 
**Dashboard widget for displaying system messages with improved rendering and error handling**

```tsx
<SystemMessagesWidget label="System Messages" />
```

### Props
- `label`: The label for the widget (default: 'System Messages')

Features:
- Responsive doughnut chart visualization
- Theme-aware rendering (light/dark mode support)
- Real-time data updates
- Customizable widget properties (size, position, etc.)
- Improved error handling and data validation
- Proper lifecycle management
- Enhanced debugging and logging
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import axios from 'axios';
	import { type PopupSettings } from '@skeletonlabs/skeleton-svelte';

	// Define the structure of a system message
	interface SystemMessage {
		title: string;
		timestamp: string;
		body: string;
	}

	// Define the type of the messages array
	let messages: SystemMessage[] = $state([]);

	// Skeleton popup settings
	const RemoveTooltip: PopupSettings = {
		event: 'hover',
		target: 'Remove',
		placement: 'right'
	};

	interface Props {
		label: string;
		currentTheme: string;
	}

	let { label, currentTheme }: Props = $props();

	onMount(async () => {
		try {
			const response = await axios.get('/api/systemMessages');
			messages = response.data;
		} catch (err) {
			console.error('Failed to fetch system messages:', err);
			messages = [];
		}
	});
</script>

<div id="systemMessagesWidget" class="relative rounded-lg bg-white p-4 shadow-md dark:bg-gray-800">
	<h3 class="mb-2 text-lg font-bold">{label} <span class="preset-filled badge">Alert</span></h3>
	{#if messages.length > 0}
		<ul>
			{#each messages as message}
				<li class="mb-1">
					<strong>{message.title}</strong>
					<small class="text-gray-500">({new Date(message.timestamp).toLocaleString()})</small>
					<p>{message.body}</p>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="text-center text-gray-500">No system messages available</p>
	{/if}
</div>
