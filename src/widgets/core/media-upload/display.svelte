<!--
@file src/widgets/core/media-upload/display.svelte
@component
**Media Upload Display Widget Component**

Renders selected media files as thumbnails for display purposes.

### Props
- `value: string | string[] | object | object[] | null | undefined` - Media ID(s) or hydrated media object(s).
- `compact: boolean` - Use the dense 28px table-cell variant (defaults to true).

### Features
- **Envelope-safe fetch**: `/api/media/:id` answers `{ success, data }`; the
  document is unwrapped before reading `filename`/`thumbnails`/`size`.
- **Thumbnail Display**: Shows small thumbnails with a file-name tooltip.
- **Multi-select summary**: Collapses to the first three thumbnails plus a `+N` chip.
- **Fallback Handling**: Displays an en dash when no media is selected and a
  file-type icon when the asset has no previewable thumbnail.
- **Caching**: One shared per-page cache, so a table with many rows does not
  re-fetch the same media document per cell.
-->

<script lang="ts">
	import { logger } from '@utils/logger';
	import { mediaDisplayUrl } from '@utils/media/media-utils';
	import type { MediaFile } from './types';
	import { mediaCache } from './media-cache';

	interface Props {
		value?: unknown;
		compact?: boolean;
	}

	const { value, compact = true }: Props = $props();

	// Local state for the resolved file(s).
	let files = $state<MediaFile[]>([]);

	/** Guards against a stale in-flight response overwriting newer state. */
	let requestToken = 0;

	function toMediaFile(found: Record<string, unknown>, fallbackId: string): MediaFile {
		const url = typeof found.url === 'string' ? found.url : String(found.path ?? '');
		return {
			_id: String(found._id ?? fallbackId),
			name: String(found.filename ?? found.name ?? ''),
			type: String(found.mimeType ?? found.type ?? ''),
			size: typeof found.size === 'number' ? found.size : 0,
			url,
			thumbnailUrl: mediaDisplayUrl(found as { url?: string | null }, 'thumbnail') || url
		} as MediaFile;
	}

	function asMediaId(entry: unknown): string {
		if (typeof entry === 'string') return entry;
		if (entry && typeof entry === 'object') {
			return String((entry as { _id?: unknown })._id ?? '');
		}
		return '';
	}

	// Resolve media data when the value prop changes.
	$effect(() => {
		const rawValues = Array.isArray(value) ? value : value ? [value] : [];
		const token = ++requestToken;

		if (rawValues.length === 0) {
			files = [];
			return;
		}

		const resolved: MediaFile[] = [];
		const pending: string[] = [];

		for (const entry of rawValues) {
			const id = asMediaId(entry);
			if (!id) continue;

			if (entry && typeof entry === 'object' && 'filename' in (entry as object)) {
				resolved.push(toMediaFile(entry as Record<string, unknown>, id));
				continue;
			}

			const cached = mediaCache.get(id);
			if (cached) resolved.push(cached);
			else pending.push(id);
		}

		// Render what we already know immediately (no layout flash).
		files = resolved;

		if (pending.length === 0) return;

		const fetchAll = async () => {
			const fetched: MediaFile[] = [];
			for (const id of pending) {
				try {
					const response = await fetch(`/api/media/${encodeURIComponent(id)}`);
					if (!response.ok) continue;

					const payload = (await response.json()) as
						| Record<string, unknown>
						| { data?: Record<string, unknown> };
					// Unwrap the API envelope — reading `filename` off `{ success, data }`
					// left every field undefined and rendered a broken image.
					const found = (payload?.data ?? payload) as Record<string, unknown> | null;
					if (!found || typeof found !== 'object') continue;

					const file = toMediaFile(found, id);
					mediaCache.set(id, file);
					fetched.push(file);
				} catch (e) {
					logger.error(`Failed to fetch media ${id}`, e);
				}
			}

			if (token !== requestToken) return;
			files = [...resolved, ...fetched];
		};

		void fetchAll();
	});

	const visibleFiles = $derived(files.slice(0, compact ? 3 : 6));
	const overflowCount = $derived(Math.max(0, files.length - visibleFiles.length));
</script>

<div class="flex items-center justify-start gap-1 p-0.5" data-testid="media-display">
	{#if files.length > 0}
		{#each visibleFiles as file (file._id)}
			<div class="group relative">
				{#if file.thumbnailUrl}
					<img
						src={file.thumbnailUrl}
						alt={file.name}
						title={file.name}
						class="h-8 w-8 rounded border border-surface-500/30 bg-(--admin-bg-card) object-cover"
						loading="lazy"
						decoding="async"
					/>
				{:else}
					<span
						class="flex h-8 w-8 items-center justify-center rounded border border-surface-500/30 text-(--admin-text-muted)"
						title={file.name}
					>
						<iconify-icon icon="mdi:file-outline" width="16" aria-hidden="true"></iconify-icon>
					</span>
				{/if}
			</div>
		{/each}
		{#if overflowCount > 0}
			<span
				class="flex h-8 min-w-8 items-center justify-center rounded border border-surface-500/30 bg-(--admin-bg-chip) px-1 text-[10px] font-bold text-(--admin-text-muted)"
				title={`${overflowCount} more file${overflowCount === 1 ? '' : 's'}`}
			>
				+{overflowCount}
			</span>
		{/if}
	{:else}
		<span class="text-(--admin-text-muted)">–</span>
	{/if}
</div>
