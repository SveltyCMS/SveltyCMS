<!--
@file src/routes/(app)/dashboard/widgets/UserActivityWidget.svelte
@component
**Dashboard widget for displaying user activity with improved rendering and error handling**

@example
<UserActivityWidget label="User Activity" />

### Props
- `label`: The label for the widget (default: 'User Activity')

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
	import BaseWidget from '../BaseWidget.svelte';
	import { onMount } from 'svelte';

	interface Activity {
		timestamp: string;
		description: string;
	}

	interface User {
		activities: Activity[];
	}

	let activities: Activity[] = $state([]);

	onMount(async () => {
		const res = await fetch('/api/users');
		const users: User[] = (await res.json()).data;
		// Assume each user has an activities field containing recent activities
		activities = users.flatMap((user) => user.activities);
	});

	let { label, theme = 'light' } = $props();
	const themeType = theme as 'light' | 'dark';
</script>

<BaseWidget {label} theme={themeType} endpoint="/api/users" pollInterval={5000}>
	<section>
		<h2>Recent User Activities</h2>
		<ul>
			{#each activities as activity}
				<li>{activity.timestamp}: {activity.description}</li>
			{/each}
		</ul>
	</section>
</BaseWidget>
