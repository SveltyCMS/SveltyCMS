<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import '../app.postcss';

	// Icons
	import 'iconify-icon';

	// Skeleton
	import { AppShell } from '@skeletonlabs/skeleton';

	// Highlight JS
	import hljs from 'highlight.js/lib/core';
	import 'highlight.js/styles/github-dark.css';
	import { storeHighlightJs } from '@skeletonlabs/skeleton';
	import xml from 'highlight.js/lib/languages/xml';
	import css from 'highlight.js/lib/languages/css';
	import javascript from 'highlight.js/lib/languages/javascript';
	import typescript from 'highlight.js/lib/languages/typescript';

	hljs.registerLanguage('xml', xml);
	hljs.registerLanguage('css', css);
	hljs.registerLanguage('javascript', javascript);
	hljs.registerLanguage('typescript', typescript);
	storeHighlightJs.set(hljs);

	// Components
	import Header from '$lib/components/Header.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import Footer from '$lib/components/Footer.svelte';

	let sidebarOpen = true;

	const toggleSidebar = () => {
		sidebarOpen = !sidebarOpen;
	};
</script>

<svelte:head>
	<title>SveltyCMS Documentation</title>
	<meta name="description" content="Comprehensive documentation for SveltyCMS" />
</svelte:head>

<AppShell class="w-full bg-white dark:bg-surface-900">
	<svelte:fragment slot="header">
		<Header {toggleSidebar} {sidebarOpen} />
	</svelte:fragment>

	<svelte:fragment slot="sidebarLeft">
		{#if sidebarOpen}
			<Sidebar />
		{/if}
	</svelte:fragment>

	<div class="overflow-y-auto p-8">
		<slot />
	</div>

	<svelte:fragment slot="footer">
		<Footer />
	</svelte:fragment>
</AppShell>
