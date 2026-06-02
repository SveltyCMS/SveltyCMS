<!--
@file src/routes/(app)/dashboard/widgets/Last5MediaWidget.svelte
@component
**Modern Last 5 Media Widget — Recent uploads with thumbnails and adaptive layouts**

### Props
- `label` (string): Widget label (default: 'Last 5 Media')
- `size` (WidgetSize): Controls layout — h:1 compact chip scroll, h:2+ rich card list

### Features:
- Adaptive dual layout: compact (h:1) horizontal file chips, rich (h:2+) scrollable cards
- Thumbnail previews for images and videos, type-colored icons for other files
- Human-readable file sizes (B → KB → MB → GB)
- Color-coded file type icons (images=purple, video=rose, other=surface)
- Clickable rows navigate to /mediagallery
- Modern card styling with hover micro-animations
-->
<script lang="ts" module>
export const widgetMeta = {
	name: "Last 5 Media",
	icon: "mdi:image-multiple-outline",
	description: "Recently uploaded media files with thumbnail previews",
	defaultSize: { w: 1, h: 2 },
};
</script>

<script lang="ts">
	import type { WidgetSize } from '@src/content/types';
	import { formatDisplayDate } from '@utils/date';
	import BaseWidget from '../base-widget.svelte';

	interface MediaFile {
		id: string;
		name?: string;
		filename?: string;
		originalFilename?: string;
		type: string;
		size: number;
		url?: string;
		thumbnails?: Record<string, { url: string; width: number; height: number } | undefined>;
		thumbnailUrl?: string;
		mimeType?: string;
		createdAt?: string;
		modified?: string;
		createdBy?: string;
	}

	const {
		label = 'Last 5 Media',
		theme = 'light' as 'light' | 'dark',
		icon = 'mdi:image-multiple-outline',
		widgetId = undefined as string | undefined,
		size = { w: 1, h: 2 } as WidgetSize,
		onSizeChange = ((_newSize: WidgetSize) => {}) as (newSize: WidgetSize) => void,
		onRemove = (() => {}) as () => void
	} = $props();

	const isCompact = $derived(size.h === 1);

	function fileName(f: MediaFile): string {
		return f.name || f.filename || f.originalFilename || 'Unknown';
	}

	function fileDate(f: MediaFile): string {
		return formatDisplayDate(f.modified || f.createdAt || '');
	}

	function fmtSize(bytes: number): string {
		if (!bytes || bytes === 0) return '0 B';
		const units = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(1024));
		return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`;
	}

	function thumbnailUrl(f: MediaFile): string | null {
		if (f.thumbnails?.small?.url) return f.thumbnails.small.url;
		if (f.thumbnails?.thumb?.url) return f.thumbnails.thumb.url;
		if (f.thumbnailUrl) return f.thumbnailUrl;
		return f.url || null;
	}

	function isImage(f: MediaFile): boolean {
		const t = f.type?.toLowerCase() || f.mimeType?.toLowerCase() || '';
		return t === 'image' || t.startsWith('image/');
	}

	function isVideo(f: MediaFile): boolean {
		const t = f.type?.toLowerCase() || f.mimeType?.toLowerCase() || '';
		return t === 'video' || t.startsWith('video/') || t === 'remotevideo';
	}

	function fileIcon(f: MediaFile): string {
		if (isImage(f)) return 'mdi:image-outline';
		if (isVideo(f)) return 'mdi:video-outline';
		const ext = (f.type || '').toLowerCase();
		if (ext === 'pdf') return 'mdi:file-pdf-box';
		if (['zip', 'rar', '7z', 'gz'].includes(ext)) return 'mdi:archive-outline';
		if (['mp3', 'wav', 'flac', 'ogg'].includes(ext)) return 'mdi:music-note-outline';
		return 'mdi:file-outline';
	}

	function fileColor(f: MediaFile): string {
		if (isImage(f)) return 'text-purple-500 dark:text-purple-400';
		if (isVideo(f)) return 'text-rose-500 dark:text-rose-400';
		return 'text-surface-500 dark:text-surface-400';
	}
</script>

<BaseWidget
	{label}
	{theme}
	endpoint="/api/dashboard/last5media"
	pollInterval={30000}
	{icon}
	{widgetId}
	{size}
	{onSizeChange}
	onCloseRequest={onRemove}
>
	{#snippet children({ data })}
		{const files = (Array.isArray(data) ? data : []) as MediaFile[]}

		{#if files.length === 0}
			<div class="flex h-full flex-col items-center justify-center text-center">
				<iconify-icon icon="mdi:file-image-remove-outline" class="text-4xl opacity-20 mb-3"  ></iconify-icon>
				<div class="text-sm font-medium text-surface-500">No media files yet</div>
				<div class="text-xs text-surface-400 mt-1">Uploaded files will appear here</div>
			</div>
		{:else if isCompact}
			<div class="flex h-full items-center gap-2 overflow-hidden">
				<span class="shrink-0 text-xs font-semibold text-surface-500">{files.length} files</span>
				<div class="h-5 w-px shrink-0 bg-surface-200 dark:bg-surface-700"></div>
				<div class="flex flex-1 items-center gap-1.5 overflow-x-auto scrollbar-none">
					{#each files.slice(0, 8) as f (f.id)}
						<a
							href="/mediagallery"
							class="flex shrink-0 items-center gap-1.5 rounded-full bg-surface-100 px-2 py-1 dark:bg-surface-800 hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors"
							title="{fileName(f)} · {fmtSize(f.size)}"
						>
							{#if thumbnailUrl(f)}
								<img src={thumbnailUrl(f)!} alt="" class="h-5 w-5 rounded-full object-cover" loading="lazy" />
							{:else}
								<iconify-icon icon={fileIcon(f)} class="text-sm {fileColor(f)}" ></iconify-icon>
							{/if}
							<span class="max-w-15 truncate text-[11px] font-medium text-surface-700 dark:text-surface-300">
								{fileName(f)}
							</span>
						</a>
					{/each}
				</div>
			</div>
		{:else}
			<div class="flex h-full flex-col">
				<div class="flex-1 overflow-y-auto space-y-1 pe-0.5 custom-scroll">
					{#each files.slice(0, 5) as f (f.id)}
						<a
							href="/mediagallery"
							data-sveltekit-preload-data="hover"
							class="group flex items-center gap-3 rounded-2xl bg-surface-50 px-3 py-2.5 transition-colors hover:bg-surface-100 dark:bg-surface-800/60 dark:hover:bg-surface-700/60"
						>
							<!-- Thumbnail / Icon -->
							<div class="relative shrink-0">
								{#if thumbnailUrl(f)}
									<img
										src={thumbnailUrl(f)!}
										alt={fileName(f)}
										class="h-10 w-10 rounded-xl object-cover ring-1 ring-surface-200 dark:ring-surface-700"
										loading="lazy"
									/>
									{#if isVideo(f)}
										<div class="absolute inset-0 flex items-center justify-center rounded-xl bg-black/30">
											<iconify-icon icon="mdi:play-circle" class="text-lg text-white/90"  ></iconify-icon>
										</div>
									{/if}
								{:else}
									<div class="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-100 dark:bg-surface-700">
										<iconify-icon icon={fileIcon(f)} class="text-xl {fileColor(f)}"  ></iconify-icon>
									</div>
								{/if}
							</div>

							<!-- Info -->
							<div class="min-w-0 flex-1">
								<div class="truncate text-sm font-medium text-surface-900 dark:text-surface-100 group-hover:text-tertiary-600 dark:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
									{fileName(f)}
								</div>
								<div class="mt-0.5 flex items-center gap-2 text-xs text-surface-500">
									<span>{fmtSize(f.size)}</span>
									<span class="opacity-40">·</span>
									<span class="uppercase">{f.type || 'file'}</span>
								</div>
							</div>

							<!-- Date -->
							<div class="shrink-0 text-right text-[11px] tabular-nums text-surface-400 dark:text-surface-500">
								{fileDate(f)}
							</div>
						</a>
					{/each}
				</div>
			</div>
		{/if}
	{/snippet}
</BaseWidget>

<style>
	.scrollbar-none { scrollbar-width: none; }
	.scrollbar-none::-webkit-scrollbar { display: none; }
	.custom-scroll::-webkit-scrollbar { width: 4px; }
	.custom-scroll::-webkit-scrollbar-track { background: transparent; }
	.custom-scroll::-webkit-scrollbar-thumb { background: rgba(156, 163, 175, 0.25); border-radius: 9999px; }
	.custom-scroll::-webkit-scrollbar-thumb:hover { background: rgba(156, 163, 175, 0.45); }
</style>
