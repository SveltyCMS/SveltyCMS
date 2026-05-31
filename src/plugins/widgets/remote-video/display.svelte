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
	import ResponsiveEmbed from './components/responsive-embed.svelte';

	interface Props {
		value: RemoteVideoData | null | undefined;
		mode?: 'compact' | 'embed';
	}

	let { value, mode = 'compact' }: Props = $props();
</script>

{#if value?.thumbnailUrl}
	{#if mode === 'embed'}
		<ResponsiveEmbed video={value} />
	{:else}
		<div class="flex w-full max-w-full items-center gap-2.5" title={value.title ?? ''}>
			<div class="relative shrink-0">
				<img
					src={value.thumbnailUrl}
					alt={value.title || 'Video thumbnail'}
					class="h-auto w-[60px] rounded object-cover aspect-video"
					loading="lazy"
					decoding="async"
				/>
				<div class="absolute inset-0 flex items-center justify-center bg-black/20 rounded">
					<iconify-icon icon="mdi:play" width="16" class="text-white"></iconify-icon>
				</div>
			</div>

			<div class="flex min-w-0 flex-col justify-center overflow-hidden">
				<span class="truncate text-sm font-bold text-surface-900 dark:text-surface-50"> {value.title} </span>

				<div class="flex items-center gap-2 text-[10px] text-surface-500">
					<span class="uppercase">{value.platform}</span>
					{#if value.duration}
						<span>• {value.duration}</span>
					{/if}
				</div>
			</div>
		</div>
	{/if}
{:else}
	<span class="text-surface-400">–</span>
{/if}
