<!--
@file src/components/media/hls-video-player.svelte
@component
**Adaptive video player for HLS (`.m3u8`) assets**

### Props
- `src` (string): Playlist URL — a master playlist from `metadata.hls.master` or any `.m3u8`.
- `poster` (string, optional): Poster image URL.
- `label` (string, optional): Accessible name for the `<video>` element.
- `class` (string, optional): Layout classes for the element.

### Features:
- Native HLS on Safari/iOS (`canPlayType("application/vnd.apple.mpegurl")`).
- `hls.js` for every other browser, imported lazily so the library never reaches
  the server bundle or the initial page chunk.
- Recovers from network/media errors, and falls back to direct `<video src>`
  playback when hls.js is unsupported or exhausts its recovery paths.
- `data-mode` exposes the active strategy (`native` | `hls` | `fallback`) for tests.
-->

<script lang="ts">
	import { logger } from '@utils/logger';

	interface Props {
		src: string;
		poster?: string;
		label?: string;
		class?: string;
	}

	let { src, poster, label, class: className = '' }: Props = $props();

	let videoEl = $state<HTMLVideoElement>();
	let mode = $state<'loading' | 'native' | 'hls' | 'fallback'>('loading');

	$effect(() => {
		const element = videoEl;
		const source = src;
		if (!element || !source) return;

		let disposed = false;
		let destroy: (() => void) | undefined;

		const playDirectly = () => {
			mode = 'fallback';
			element.src = source;
		};

		if (element.canPlayType('application/vnd.apple.mpegurl')) {
			element.src = source;
			mode = 'native';
		} else {
			void (async () => {
				try {
					const { default: Hls } = await import('hls.js');
					if (disposed) return;

					if (!Hls.isSupported()) {
						playDirectly();
						return;
					}

					const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
					destroy = () => hls.destroy();

					hls.on(Hls.Events.ERROR, (_event, data) => {
						if (!data.fatal) return;
						if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
							hls.startLoad();
						} else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
							hls.recoverMediaError();
						} else {
							logger.warn(`[HlsVideoPlayer] fatal playback error: ${data.details}`);
							hls.destroy();
							destroy = undefined;
							playDirectly();
						}
					});

					hls.loadSource(source);
					hls.attachMedia(element);
					mode = 'hls';
				} catch (error) {
					if (disposed) return;
					logger.warn('[HlsVideoPlayer] hls.js unavailable, using direct playback', error);
					playDirectly();
				}
			})();
		}

		return () => {
			disposed = true;
			destroy?.();
			element.removeAttribute('src');
			element.load();
		};
	});
</script>

<video
	bind:this={videoEl}
	{poster}
	controls
	playsinline
	preload="metadata"
	aria-label={label}
	class={className}
	data-testid="media-video-player"
	data-mode={mode}
></video>
