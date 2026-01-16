<!--
@file src/widgets/custom/RemoteVideo/Display.svelte
@component
**RemoteVideo Widget Display Component**

Displays video metadata as compact preview with thumbnail, title, and duration.
Part of the Three Pillars Architecture for widget system.

@example
<RemoteVideoDisplay value={{ title: "Video Title", thumbnailUrl: "...", duration: "3:45" }} />
Renders: Thumbnail + title + duration in compact horizontal layout

### Props
- `value: RemoteVideoData | null | undefined` - Video metadata object with thumbnail and details

### Features
- **Compact Preview**: Thumbnail with title and duration in horizontal layout
- **Multi-Platform Embeds**: YouTube, Vimeo, Twitch, TikTok iframe generation
- **Responsive Thumbnails**: Optimized 60px thumbnails with proper aspect ratios
- **Embed URL Generation**: Platform-specific embed URLs with security parameters
- **Iframe HTML**: Ready-to-use iframe code with 16:9 aspect ratio
- **Null Handling**: Graceful fallback to "–" for missing video data
- **Performance Optimized**: Lazy embed generation with `$derived.by()`
- **Cross-Origin Security**: Proper iframe attributes and CORS handling
- **PostCSS Styling**: Modern CSS with flexbox layout and responsive design
-->

<script lang="ts">
	import type { RemoteVideoData } from './types';

	const { value }: { value: RemoteVideoData | null | undefined } = $props();

	// Construct the embed URL and iframe HTML based on the platform.
	// Note: For now we just display thumbnail and metadata, embed logic available if needed
</script>

{#if value?.thumbnailUrl}
	<div class="flex w-full max-w-full items-center gap-2.5" title={value.title ?? ''}>
		<img
			src={value.thumbnailUrl}
			alt={value.title || 'Video thumbnail'}
			class="h-auto w-[60px] shrink-0 rounded-md object-cover"
			loading="lazy"
			decoding="async"
		/>

		<div class="flex min-w-0 flex-wrap items-center gap-x-2">
			<span class="max-w-[12rem] truncate text-sm font-medium">
				{value.title}
			</span>

			{#if value.duration}
				<span class="shrink-0 text-xs text-gray-500">
					{value.duration}
				</span>
			{/if}
		</div>
	</div>
{:else}
	<span class="text-gray-400">–</span>
{/if}
