<!--
@file src/widgets/custom/Seo/components/SocialPreview.svelte
@component
**Social Media Preview Component**
Displays a preview of the shared link for different platforms.
-->

<script module lang="ts">
	import Button from '@components/ui/button.svelte';
	const PLATFORMS = [
				{ id: 'facebook', icon: 'mdi:facebook', color: 'text-tertiary-500 dark:text-primary-500', label: 'Facebook' },
				{ id: 'whatsapp', icon: 'mdi:whatsapp', color: 'text-success-500', label: 'WhatsApp' },
				{ id: 'twitter', icon: 'mdi:twitter', color: 'text-surface-900 dark:text-surface-50', label: 'X (Twitter)' },
				{ id: 'linkedin', icon: 'mdi:linkedin', color: 'text-tertiary-600 dark:text-primary-500', label: 'LinkedIn' },
				{ id: 'discord', icon: 'mdi:discord', color: 'text-secondary-500', label: 'Discord' }
			] as const;
</script>

<script lang="ts">
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	// Using iconify-icon web component
	interface Props {
		hostUrl: string;
		ogDescription?: string;
		ogImage?: string;
		ogTitle?: string;
		twitterDescription?: string;
		twitterImage?: string;
		twitterTitle?: string;
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

	let activePlatform = $state<(typeof PLATFORMS)[number]['id']>('facebook');

	// Fallback logic
	let displayTitle = $derived(activePlatform === 'twitter' ? twitterTitle || ogTitle || 'Page Title' : ogTitle || 'Page Title');
	let displayDescription = $derived(
		activePlatform === 'twitter' ? twitterDescription || ogDescription || 'Page description...' : ogDescription || 'Page description...'
	);

	// Image placeholder if no image provided
	let displayImage = $derived(activePlatform === 'twitter' && twitterImage ? twitterImage : ogImage);
</script>

<div class="card preset-tonal-surface p-4 rounded-lg mb-6">
	<div class="flex items-center gap-2 mb-4">
		<iconify-icon icon="mdi:share-variant" width="24" class="text-secondary-500 text-xl"></iconify-icon>
		<h3 class="h3">Social Share Preview</h3>
	</div>

	<!-- Platform Tabs -->
	<div class="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
		{#each PLATFORMS as platform (platform.id)}
			<SystemTooltip title={platform.label}>
				<Button variant="secondary"
					type="button"
					onclick={() => (activePlatform = platform.id)}
					aria-label={platform.label}
				 class="p-0! min-w-0 transition-all {activePlatform === platform.id ? ' ring-2 ring-surface-900 dark:ring-white scale-110' : ' hover:bg-surface-100 dark:hover:bg-surface-700'}">
					<iconify-icon icon={platform.icon} width="24" class="text-xl {activePlatform === platform.id ? 'text-white' : platform.color}"
					></iconify-icon>
				</Button>
			</SystemTooltip>
		{/each}
	</div>

	<!-- Preview Card Area -->
	<div class="bg-surface-50 dark:bg-surface-900 rounded p-4 md:p-8 flex justify-center border border-surface-200 dark:text-surface-50">
		<!-- Dynamic Preview Styling based on Platform -->
		<div class="w-full max-w-125 bg-white text-black overflow-hidden shadow-lg rounded transition-all duration-300">
			<!-- Image Area -->
			<div class="relative bg-gray-100 aspect-[1.91/1] flex items-center justify-center overflow-hidden">
				{#if displayImage}
					<img src={displayImage} alt="Social Preview" class="w-full h-full object-cover" />
				{:else}
					<div class="flex flex-col items-center text-gray-400">
						<iconify-icon icon="mdi:image-off" width="24" class="text-4xl"></iconify-icon>
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
				<div class="font-bold text-[16px] leading-snug text-[#050505] line-clamp-2 md:line-clamp-1 font-sans mb-1">{displayTitle}</div>
				<div class="text-[14px] text-[#65676b] line-clamp-1 md:line-clamp-2 font-sans">{displayDescription}</div>
			</div>
		</div>
	</div>

	<!-- Tips/Warnings based on active platform -->
	<div class="mt-4 text-sm text-surface-600 dark:text-surface-200">
		{#if displayTitle.length > 95 && activePlatform === 'facebook'}
			<div class="flex items-center gap-2 text-warning-600 dark:text-warning-300">
				<iconify-icon icon="mdi:alert"></iconify-icon>
				<span>Title is slightly long for Facebook (recommended &lt; 95 chars).</span>
			</div>
		{/if}
		{#if displayTitle.length > 70 && activePlatform === 'twitter'}
			<div class="flex items-center gap-2 text-warning-600 dark:text-warning-300">
				<iconify-icon icon="mdi:alert"></iconify-icon>
				<span>Title is too long for X cards (recommended &lt; 70 chars).</span>
			</div>
		{/if}
		{#if !displayImage}
			<div class="flex items-center gap-2 text-warning-600 dark:text-warning-300 mt-1">
				<iconify-icon icon="mdi:image-search" width={24}></iconify-icon>
				<span>No Og Image selected. The platform will try to scrape one from your page body.</span>
			</div>
		{/if}
	</div>
</div>
