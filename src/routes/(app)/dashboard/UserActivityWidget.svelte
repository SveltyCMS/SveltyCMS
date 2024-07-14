<script lang="ts">
	import { onMount } from 'svelte';

	interface Activity {
		timestamp: string;
		description: string;
	}

	interface User {
		activities: Activity[];
	}

	let activities: Activity[] = [];

	onMount(async () => {
		const res = await fetch('/api/users');
		const users: User[] = (await res.json()).data;
		// Assume each user has an activities field containing recent activities
		activities = users.flatMap((user) => user.activities);
	});

	export let label;
</script>

<section>
	<h2>Recent User Activities</h2>
	<ul>
		{#each activities as activity}
			<li>{activity.timestamp}: {activity.description}</li>
		{/each}
	</ul>
</section>
