<!--
@file src/routes/(app)/graphql-test/+page.svelte
@component
**GraphQL Subscription Test Page for SveltyCMS**

### Features:
- Connects to the GraphQL WebSocket endpoint using graphql-ws.
- Subscribes to the `postAdded` event and displays new posts in real time.
- Shows errors if the subscription fails.
- Demonstrates live updates from the backend using GraphQL subscriptions.
-->
<script lang="ts">
	import { logger } from '@utils/logger';
	import { onMount } from 'svelte';
	import { createClient } from 'graphql-ws';

	let posts: any[] = $state([]);
	let error: any = $state(null);

	onMount(() => {
		const client = createClient({
			url: 'ws://localhost:3001/api/graphql'
		});

		client.subscribe(
			{
				query: `
					subscription PostAdded {
						postAdded {
							_id
							title
						}
					}
				`
			},
			{
				next: (data) => {
					if (data?.data?.postAdded) {
						posts = [...posts, data.data.postAdded];
					}
				},
				error: (err) => {
					error = err;
				},
				complete: () => {
					logger.debug('Subscription complete');
				}
			}
		);
	});
</script>

<h1>GraphQL Subscription Test</h1>

{#if error}
	<p style="color: red">{JSON.stringify(error, null, 2)}</p>
{/if}

<h2>New Posts:</h2>
<ul>
	{#each posts as post (post._id)}
		<li>{post.title} ({post._id})</li>
	{/each}
</ul>
