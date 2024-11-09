<!--
@file: src/routes/(app)/dashboard/widgets/UserActivityWidget.svelte
@description:  Dashboard widget for displaying user activity with improved rendering and error handling.

This widget displays the current last 5 activities users

Features:
- Responsive doughnut chart visualization
- Theme-aware rendering (light/dark mode support)
- Real-time data updates
- Customizable widget properties (size, position, etc.)
- Improved error handling and data validation
- Proper lifecycle management
- Enhanced debugging and logging

Usage:
<UserActivityWidget label="User Activity" />
-->
<script lang="ts">
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

	let { label } = $props();
</script>

<section>
	<h2>Recent User Activities</h2>
	<ul>
		{#each activities as activity}
			<li>{activity.timestamp}: {activity.description}</li>
		{/each}
	</ul>
</section>
