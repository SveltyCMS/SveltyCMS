<!--
@file src/widgets/custom/RemoteVideo/Input.svelte
@component
**RemoteVideo Widget Input Component**

Provides URL input with automatic video metadata fetching and preview from multiple platforms.
Part of the Three Pillars Architecture for widget system.

@example
<RemoteVideoInput bind:value={videoData} field={{ allowedPlatforms: ["youtube", "vimeo"] }} />
<!-- User enters URL → fetches metadata → shows preview with thumbnail and details

### Props
- `field: FieldType` - Widget field definition with allowed platforms configuration
- `value: RemoteVideoData | null | undefined` - Video metadata object (bindable)
- `error?: string | null` - Validation error message for display

### Features
- **Multi-Platform Support**: YouTube, Vimeo, Twitch, TikTok integration
- **Automatic Metadata Fetching**: Debounced API calls for video information
- **Rich Preview**: Thumbnail, title, channel, and duration display
- **Security First**: Server-side metadata fetching with platform validation
- **Loading States**: Visual feedback during API requests with spinner
- **Error Handling**: Comprehensive error display for failed requests
- **URL Validation**: HTML5 URL input with platform-specific validation
- **Debounced Input**: Performance-optimized API calls (500ms delay)
- **Accessibility**: Full ARIA support with loading and error states
-->

<script lang="ts">
	import type { FieldType } from './';
	import { logger } from '@utils/logger';
	import type { RemoteVideoData } from './types';

	import { debounce } from '@utils/utils';

	import { app } from '@src/stores/store.svelte';
	import { publicEnv } from '@src/stores/globalSettings.svelte';
	import SystemTooltip from '@components/system/SystemTooltip.svelte';

	let {
		field,
		value = $bindable(),
		error
	}: { field: FieldType; value: RemoteVideoData | null | undefined | Record<string, RemoteVideoData>; error?: string | null } = $props();

	const _language = $derived(field.translated ? app.contentLanguage : ((publicEnv.DEFAULT_CONTENT_LANGUAGE as string) || 'en').toLowerCase());

	// Local state for the URL input.
	let urlInput = $state('');
	// Local state to temporarily hold fetched metadata before it's set to `value`.
	let fetchedMetadata = $state<RemoteVideoData | null>(null);
	let isLoading = $state(false);
	let fetchError = $state<string | null>(null);

	// Effect to update local `urlInput` when parent `value` changes externally.
	$effect(() => {
		const parentVal = value;
		let extracted: RemoteVideoData | null = null;

		if (field.translated && typeof parentVal === 'object' && parentVal !== null) {
			extracted = (parentVal as Record<string, any>)[_language] ?? null;
		} else if (!field.translated && typeof parentVal === 'object') {
			extracted = parentVal as RemoteVideoData;
		}

		if (extracted?.url && extracted.url !== urlInput) {
			urlInput = extracted.url;
			fetchedMetadata = extracted;
		} else if (!extracted) {
			urlInput = '';
			fetchedMetadata = null;
		}
	});

	// ... (validation logic unchanged) ...

	// Define simple validation function
	function validateVideoUrl(url: string): { valid: boolean; error?: string } {
		if (!url) return { valid: false, error: 'URL is required' };
		// Basic URL validation
		try {
			new URL(url);
			// Check for supported platforms (basic check)
			const supported = ['youtube.com', 'youtu.be', 'vimeo.com', 'twitch.tv', 'tiktok.com'];
			if (!supported.some((domain) => url.includes(domain))) {
				return { valid: false, error: 'Unsupported video platform' };
			}
			return { valid: true };
		} catch {
			return { valid: false, error: 'Invalid URL format' };
		}
	}

	// Helper to update parent value
	function updateParent(newData: RemoteVideoData | null) {
		if (field.translated) {
			if (!value || typeof value !== 'object') {
				value = {};
			}
			value = { ...(value as object), [_language]: newData } as Record<string, RemoteVideoData>;
		} else {
			value = newData;
		}
	}

	// Debounced function to fetch video metadata from the server.
	const fetchVideoMetadata = debounce.create((...args: unknown[]) => {
		const url = typeof args[0] === 'string' ? args[0] : '';
		isLoading = true;
		fetchError = null;
		fetchedMetadata = null;

		if (!url) {
			isLoading = false;
			return;
		}

		// SECURITY: Validate URL before making API call
		const validation = validateVideoUrl(url);
		if (!validation.valid) {
			fetchError = validation.error || 'Invalid video URL';
			isLoading = false;
			updateParent(null);
			return;
		}

		// Async fetch wrapped in promise
		(async () => {
			try {
				// Call API endpoint to fetch metadata securely
				const response = await fetch('/api/remoteVideo', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					// Send a JSON object
					body: JSON.stringify({
						url,
						allowedPlatforms: field.allowedPlatforms
					})
				});

				const result = await response.json();

				if (response.ok && result.success) {
					fetchedMetadata = result.data;
					updateParent(result.data); // Bind the full metadata object back to the parent safely.
				} else {
					fetchError = result.error || 'Failed to fetch video metadata.';
					updateParent(null); // Clear parent value on error.
				}
			} catch (e) {
				logger.error('Error fetching video metadata:', e);
				fetchError = 'An unexpected error occurred while fetching video data.';
				updateParent(null);
			} finally {
				isLoading = false;
			}
		})();
	}, 500);

	// Trigger fetch when the URL input changes.
	function handleUrlInput() {
		fetchVideoMetadata(urlInput);
	}
</script>

<div class="input-container relative mb-4">
	<SystemTooltip title={error || fetchError || ''} wFull={true}>
		<div class="flex w-full overflow-hidden rounded border border-surface-400 dark:border-surface-600" role="group">
			<input
				type="url"
				id={field.db_fieldName}
				name={field.db_fieldName}
				required={field.required}
				placeholder={typeof field.placeholder === 'string' ? field.placeholder : 'e.g., https://www.youtube.com/watch?v=dQw4w9WgXcQ'}
				bind:value={urlInput}
				oninput={handleUrlInput}
				oninvalid={(e) => e.preventDefault()}
				class="input w-full rounded-none border-none bg-white font-medium text-black outline-none focus:ring-0 dark:bg-surface-900 dark:text-primary-500 {error ||
				fetchError
					? 'bg-error-500-10!'
					: ''} {isLoading ? 'opacity-50' : ''}"
				aria-invalid={!!error || !!fetchError}
				aria-describedby={error || fetchError ? `${field.db_fieldName}-error` : undefined}
			/>

			{#if isLoading}
				<div class="flex items-center bg-white px-2 dark:bg-surface-900" aria-label="Loading">
					<div class="h-4 w-4 animate-spin rounded-full border-2 border-primary-500 border-t-transparent"></div>
				</div>
			{/if}
		</div>
	</SystemTooltip>

	{#if error || fetchError}
		<p id={`${field.db_fieldName}-error`} class="absolute -bottom-4 left-0 w-full text-center text-xs text-error-500" role="alert">
			{error || fetchError}
		</p>
	{/if}

	{#if fetchedMetadata && !isLoading && !fetchError}
		<div class="video-preview">
			<img src={fetchedMetadata.thumbnailUrl} alt={fetchedMetadata.title} class="thumbnail" />
			<div class="details">
				<h3>{fetchedMetadata.title}</h3>
				{#if fetchedMetadata.channelTitle}
					<p>By: {fetchedMetadata.channelTitle}</p>
				{/if}
				{#if fetchedMetadata.duration}
					<p>Duration: {fetchedMetadata.duration}</p>
				{/if}
				<a href={fetchedMetadata.url} target="_blank" rel="noopener noreferrer" class="watch-link">Watch on {fetchedMetadata.platform}</a>
			</div>
		</div>
	{/if}
</div>

<style>
	/* Add styles for input, preview, thumbnail, details, and error messages */
	.input-container {
		position: relative;
		padding-bottom: 1.5rem;
		width: 100%;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}
	.video-preview {
		display: flex;
		gap: 1rem;
		margin-top: 1rem;
		border: 1px solid #eee;
		padding: 1rem;
		border-radius: 8px;
		align-items: flex-start;
	}
	.thumbnail {
		width: 120px;
		height: auto;
		flex-shrink: 0;
	}
	.details h3 {
		font-size: 1.1em;
		font-weight: bold;
		margin-top: 0;
		margin-bottom: 0.5rem;
	}
	.details p {
		font-size: 0.9em;
		color: #555;
		margin-bottom: 0.25rem;
	}
	.watch-link {
		color: #007bff;
		text-decoration: underline;
		font-size: 0.9em;
	}
</style>
