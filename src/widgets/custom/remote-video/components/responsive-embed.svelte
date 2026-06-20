<script lang="ts">
	import type { RemoteVideoData } from '../types';

	let { video, autoplay = false, class: className = '' }: { video: RemoteVideoData, autoplay?: boolean, class?: string } = $props();

	// Construct platform-specific embed URLs
	const embedUrl = $derived.by(() => {
		if (!video) return null;
		const { platform, videoId } = video;
		const params = new URLSearchParams();
		
		if (autoplay) params.set('autoplay', '1');

		switch (platform) {
			case 'youtube':
				return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
			case 'vimeo':
				return `https://player.vimeo.com/video/${videoId}?${params.toString()}`;
			case 'twitch':
				return `https://player.twitch.tv/?video=${videoId}&parent=${globalThis.location?.hostname || 'localhost'}&${params.toString()}`;
			case 'tiktok':
				return `https://www.tiktok.com/embed/v2/${videoId}`;
			default:
				return null;
		}
	});
</script>

{#if embedUrl}
	<div class="relative w-full overflow-hidden rounded bg-black {className}" style="padding-top: 56.25%;">
		<iframe
			src={embedUrl}
			title={video.title}
			class="absolute inset-0 h-full w-full"
			frameborder="0"
			allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
			allowfullscreen
			loading="lazy"
		></iframe>
	</div>
{:else}
	<div class="flex aspect-video w-full items-center justify-center rounded bg-surface-100 dark:bg-surface-800 text-surface-400">
		<iconify-icon icon="mdi:video-off" width="48"></iconify-icon>
		<span class="ms-2">Embed not available for this platform</span>
	</div>
{/if}
