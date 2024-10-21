<script lang="ts">
	import { onMount } from 'svelte';

	// Define the structure of a media document
	interface MediaDocument {
		createdAt: string;
		createdBy: string;
	}

	// Define the structure of a media schema
	interface MediaSchema {
		schemaName: string;
		recentDocs: MediaDocument[];
	}

	// Define the type of the media array
	let media: MediaSchema[] = [];

	onMount(async () => {
		const res = await fetch('/api/media');
		const data = await res.json();
		media = data.data;
	});

	export let label;
</script>

<section>
	<h2>Last 5 Added Media</h2>
	<ul>
		{#each media as { schemaName, recentDocs }}
			<li>
				<h3>{schemaName}</h3>
				<ul>
					{#each recentDocs as doc}
						<li>{doc.createdAt}: {doc.createdBy}</li>
					{/each}
				</ul>
			</li>
		{/each}
	</ul>
</section>
