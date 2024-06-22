<script lang="ts">
	import { onMount } from 'svelte';
	let media = [];

	onMount(async () => {
		const res = await fetch('/api/media');
		media = (await res.json()).data;
	});
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
