<!--
@file src/widgets/custom/Seo/components/SocialPreview.svelte
@component
**Social Media Preview Component**
Displays a preview of the shared link for different platforms.
-->

<script lang="ts">
	interface Props {
		ogTitle?: string;
		ogDescription?: string;
		ogImage?: string;
		twitterTitle?: string;
		twitterDescription?: string;
		twitterImage?: string;
		hostUrl: string;
	}

	let {
		ogTitle = '',
		ogDescription = '',
		ogImage = '',
		twitterTitle = '',
		twitterDescription = '',
		twitterImage = '',
		hostUrl = ''
	}: Props = $props();

	let activePlatform = $state<'facebook' | 'whatsapp' | 'twitter' | 'linkedin' | 'discord'>('facebook');

	// Fallback logic
	let displayTitle = $derived(activePlatform === 'twitter' ? twitterTitle || ogTitle || 'Page Title' : ogTitle || 'Page Title');
	let displayDescription = $derived(
		activePlatform === 'twitter' ? twitterDescription || ogDescription || 'Page description...' : ogDescription || 'Page description...'
	);

	// Image placeholder if no image provided
	let displayImage = $derived(activePlatform === 'twitter' && twitterImage ? twitterImage : ogImage);

	const platforms = [
		{ id: 'facebook', icon: 'mdi:facebook', color: 'text-blue-600', label: 'Facebook' },
		{ id: 'whatsapp', icon: 'mdi:whatsapp', color: 'text-green-500', label: 'WhatsApp' },
		{ id: 'twitter', icon: 'mdi:twitter', color: 'text-black dark:text-white', label: 'X (Twitter)' },
		{ id: 'linkedin', icon: 'mdi:linkedin', color: 'text-blue-700', label: 'LinkedIn' },
		{ id: 'discord', icon: 'ic:baseline-discord', color: 'text-indigo-500', label: 'Discord' }
	] as const;
</script>

<div class="card preset-soft-surface-500 p-4 rounded-xl bg-surface-100 dark:bg-surface-800 mb-6">
	<div class="flex items-center gap-2 mb-4">
		<iconify-icon icon="mdi:share-variant" class="text-secondary-500 text-xl"></iconify-icon>
		<h3 class="h3">Social Share Preview</h3>
	</div>

	<!-- Platform Tabs -->
	<div class="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
		{#each platforms as platform}
			<button
				type="button"
				class="btn btn-icon btn-icon-sm transition-all {activePlatform === platform.id
					? 'preset-filled-secondary-500 ring-2 ring-preset-900 dark:ring-white scale-110'
					: 'preset-soft-surface-500 hover:preset-filled-surface-500'}"
				onclick={() => (activePlatform = platform.id)}
				title={platform.label}
			>
				<iconify-icon icon={platform.icon} class="text-xl {activePlatform === platform.id ? 'text-white' : platform.color}"></iconify-icon>
			</button>
		{/each}
	</div>

	<!-- Preview Card Area -->
	<div class="bg-surface-50 dark:bg-surface-900 rounded-lg p-4 md:p-8 flex justify-center border border-surface-200 dark:border-surface-700">
		<!-- Dynamic Preview Styling based on Platform -->
		<div class="w-full max-w-[500px] bg-white text-black overflow-hidden shadow-lg rounded-lg transition-all duration-300">
			<!-- Image Area -->
			<div class="relative bg-gray-100 aspect-[1.91/1] flex items-center justify-center overflow-hidden">
				{#if displayImage}
					<img src={displayImage} alt="Social Preview" class="w-full h-full object-cover" />
				{:else}
					<div class="flex flex-col items-center text-gray-400">
						<iconify-icon icon="mdi:image-off" class="text-4xl"></iconify-icon>
						<span class="text-xs uppercase font-bold mt-2 tracking-wider">No Image</span>
					</div>
				{/if}
			</div>

			<!-- Content Area -->
			<div class="p-3 bg-[#f0f2f5] border-t border-gray-200">
				<div class="text-[12px] uppercase text-gray-500 truncate font-sans mb-0.5">
					{hostUrl
						.replace(/^https?:\/\//, '')
						.split('/')[0]
						.toUpperCase()}
				</div>
				<div class="font-bold text-[16px] leading-snug text-[#050505] line-clamp-2 md:line-clamp-1 font-sans mb-1">
					{displayTitle}
				</div>
				<div class="text-[14px] text-[#65676b] line-clamp-1 md:line-clamp-2 font-sans">
					{displayDescription}
				</div>
			</div>
		</div>
	</div>

	<!-- Tips/Warnings based on active platform -->
	<div class="mt-4 text-sm text-surface-600 dark:text-surface-300">
		{#if displayTitle.length > 95 && activePlatform === 'facebook'}
			<div class="flex items-center gap-2 text-warning-600">
				<iconify-icon icon="mdi:alert"></iconify-icon>
				<span>Title is slightly long for Facebook (recommended &lt; 95 chars).</span>
			</div>
		{/if}
		{#if displayTitle.length > 70 && activePlatform === 'twitter'}
			<div class="flex items-center gap-2 text-warning-600">
				<iconify-icon icon="mdi:alert"></iconify-icon>
				<span>Title is too long for X cards (recommended &lt; 70 chars).</span>
			</div>
		{/if}
		{#if !displayImage}
			<div class="flex items-center gap-2 text-warning-600 mt-1">
				<iconify-icon icon="mdi:image-search"></iconify-icon>
				<span>No Og Image selected. The platform will try to scrape one from your page body.</span>
			</div>
		{/if}
	</div>
</div>
