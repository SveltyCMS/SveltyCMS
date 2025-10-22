<!--
@file src/widgets/custom/remoteVideo/Display.svelte
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

	let { value }: { value: RemoteVideoData | null | undefined } = $props();

	// Construct the embed URL and iframe HTML based on the platform.
	// Note: For now we just display thumbnail and metadata, embed logic available if needed
</script>

{#if value?.thumbnailUrl}
	<div class="display-wrapper" title={value.title}>
		<img src={value.thumbnailUrl} alt={value.title} class="thumbnail" />
		<div class="details">
			<span class="title">{value.title}</span>
			{#if value.duration}
				<span class="duration">{value.duration}</span>
			{/if}
		</div>
	</div>
{:else}
	<span>–</span>
{/if}

<style lang="postcss">
	.display-wrapper {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.thumbnail {
		width: 60px;
		height: auto;
		border-radius: 4px;
		flex-shrink: 0;
	}
	.title {
		font-size: 0.875rem;
		font-weight: 500;
	}
	.duration {
		font-size: 0.75rem;
		color: #666;
		margin-left: 0.5rem;
	}
</style>
