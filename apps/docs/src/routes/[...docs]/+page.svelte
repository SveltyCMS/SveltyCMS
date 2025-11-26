<script lang="ts">
	export let data: {
		content: string;
		frontMatter: { title?: string; description?: string; icon?: string };
		path: string;
	};
</script>

<svelte:head>
	<title>{data.frontMatter?.title || 'Documentation'} - SveltyCMS</title>
	<meta name="description" content={data.frontMatter?.description || ''} />
</svelte:head>

<article class="prose prose-slate max-w-none dark:prose-invert xl:prose-lg">
	{#if data.frontMatter?.icon}
		<div class="mb-4">
			<iconify-icon icon={data.frontMatter.icon} class="text-5xl text-primary-500"></iconify-icon>
		</div>
	{/if}

	{#if data.frontMatter?.title}
		<h1 class="mb-4">{data.frontMatter.title}</h1>
	{/if}

	{#if data.frontMatter?.description}
		<p class="lead mb-8 text-lg text-surface-400">{data.frontMatter.description}</p>
	{/if}

	{@html data.content}
</article>
