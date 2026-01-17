<script lang="ts">
	import { getCollection } from '$lib/api/client';
	import { onMount } from 'svelte';

	let posts: Array<any> = [];
	let loading = true;
	let error: string | null = null;

	onMount(async () => {
		try {
			const data = await getCollection('posts', { limit: '10' });
			posts = data.entries || [];
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load posts';
		} finally {
			loading = false;
		}
	});
</script>

<svelte:head>
	<title>SveltyCMS Frontend - Live Preview</title>
</svelte:head>

<div class="container">
	<header>
		<h1>🎨 SveltyCMS Frontend</h1>
		<p>Live preview using REST API</p>
	</header>

	<main>
		{#if loading}
			<div class="loading">
				<p>Loading content...</p>
			</div>
		{:else if error}
			<div class="error">
				<h2>Error</h2>
				<p>{error}</p>
				<p class="hint">
					Make sure SveltyCMS is running on <code>http://localhost:5173</code>
				</p>
			</div>
		{:else}
			<section class="posts">
				<h2>Recent Posts</h2>
				{#if posts.length === 0}
					<p>No posts found. Create some content in the CMS admin panel!</p>
				{:else}
					<div class="posts-grid">
						{#each posts as post}
							<article class="post-card">
								<h3>{post.title || 'Untitled'}</h3>
								{#if post.excerpt}
									<p>{post.excerpt}</p>
								{/if}
								<a href="/posts/{post.slug || post._id}">Read more →</a>
							</article>
						{/each}
					</div>
				{/if}
			</section>
		{/if}
	</main>

	<footer>
		<p>
			Powered by <a href="https://github.com/SveltyCMS/SveltyCMS" target="_blank">SveltyCMS</a>
		</p>
		<p class="docs-links">
			<a href="/api-examples">REST API Examples</a> |
			<a href="/graphql-examples">GraphQL Examples</a>
		</p>
	</footer>
</div>

<style>
	.container {
		max-width: 1200px;
		margin: 0 auto;
		padding: 2rem;
		font-family: system-ui, -apple-system, sans-serif;
	}

	header {
		text-align: center;
		margin-bottom: 3rem;
	}

	h1 {
		font-size: 3rem;
		margin-bottom: 0.5rem;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	header p {
		color: #666;
		font-size: 1.2rem;
	}

	.loading,
	.error {
		text-align: center;
		padding: 3rem;
		border-radius: 8px;
		background: #f5f5f5;
	}

	.error {
		background: #fff5f5;
		border: 1px solid #feb2b2;
	}

	.error .hint {
		margin-top: 1rem;
		font-size: 0.9rem;
		color: #666;
	}

	code {
		background: #edf2f7;
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
		font-family: 'Courier New', monospace;
	}

	.posts {
		margin-bottom: 3rem;
	}

	.posts-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 2rem;
		margin-top: 2rem;
	}

	.post-card {
		background: white;
		border: 1px solid #e2e8f0;
		border-radius: 8px;
		padding: 1.5rem;
		transition: transform 0.2s, box-shadow 0.2s;
	}

	.post-card:hover {
		transform: translateY(-4px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
	}

	.post-card h3 {
		margin: 0 0 0.5rem 0;
		color: #2d3748;
	}

	.post-card p {
		color: #718096;
		margin-bottom: 1rem;
	}

	.post-card a {
		color: #667eea;
		text-decoration: none;
		font-weight: 500;
	}

	.post-card a:hover {
		text-decoration: underline;
	}

	footer {
		text-align: center;
		padding-top: 2rem;
		border-top: 1px solid #e2e8f0;
		color: #718096;
	}

	footer a {
		color: #667eea;
		text-decoration: none;
	}

	footer a:hover {
		text-decoration: underline;
	}

	.docs-links {
		margin-top: 0.5rem;
		font-size: 0.9rem;
	}
</style>
