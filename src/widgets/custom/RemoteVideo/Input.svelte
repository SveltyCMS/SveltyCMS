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

	let { field, value, error }: { field: FieldType; value: RemoteVideoData | null | undefined; error?: string | null } = $props();

	// Local state for the URL input.
	let urlInput = $state('');
	// Local state to temporarily hold fetched metadata before it's set to `value`.
	let fetchedMetadata = $state<RemoteVideoData | null>(null);
	let isLoading = $state(false);
	let fetchError = $state<string | null>(null);

	// Effect to update local `urlInput` when parent `value` changes externally.
	$effect(() => {
		if (value?.url && value.url !== urlInput) {
			urlInput = value.url;
			fetchedMetadata = value; // Also update fetchedMetadata if parent provides it.
		} else if (!value) {
			urlInput = '';
			fetchedMetadata = null;
		}
	});

	// SECURITY: URL validation patterns to prevent SSRF attacks
	const ALLOWED_PLATFORMS: Record<string, RegExp> = {
		youtube: /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
		vimeo: /^https?:\/\/(www\.)?vimeo\.com\/\d+$/,
		twitch: /^https?:\/\/(www\.)?twitch\.tv\/videos\/\d+$/,
		tiktok: /^https?:\/\/(www\.)?tiktok\.com\/@[\w.-]+\/video\/\d+$/
	};

	function validateVideoUrl(url: string): { valid: boolean; error?: string } {
		const rawPlatforms = field.allowedPlatforms || ['youtube', 'vimeo', 'twitch', 'tiktok'];
		const allowedPlatforms: string[] = Array.isArray(rawPlatforms)
			? rawPlatforms
			: typeof rawPlatforms === 'string'
				? rawPlatforms.split(',').map((p: string) => p.trim())
				: [];

		const isValid = allowedPlatforms.some((platform) => ALLOWED_PLATFORMS[platform]?.test(url));

		if (!isValid) {
			return {
				valid: false,
				error: `Invalid or disallowed video URL. Allowed platforms: ${allowedPlatforms.join(', ')}`
			};
		}
		return { valid: true };
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
			value = null;
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
					value = result.data; // Bind the full metadata object back to the parent.
				} else {
					fetchError = result.error || 'Failed to fetch video metadata.';
					value = null; // Clear parent value on error.
				}
			} catch (e) {
				logger.error('Error fetching video metadata:', e);
				fetchError = 'An unexpected error occurred while fetching video data.';
				value = null;
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

<div class="input-container" class:invalid={error || fetchError}>
	<label for={field.db_fieldName} class="label">Video URL</label>
	<input
		type="url"
		id={field.db_fieldName}
		name={field.db_fieldName}
		required={field.required}
		placeholder={typeof field.placeholder === 'string' ? field.placeholder : 'e.g., https://www.youtube.com/watch?v=dQw4w9WgXcQ'}
		bind:value={urlInput}
		oninput={handleUrlInput}
		class="input"
		class:loading={isLoading}
		aria-invalid={!!error || !!fetchError}
		aria-describedby={error || fetchError ? `${field.db_fieldName}-error` : undefined}
	/>

	{#if error || fetchError}
		<p id={`${field.db_fieldName}-error`} class="error-message" role="alert">
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
	.input.loading {
		/* Add a loading spinner or indicator to the input */
		background-image: url('data:image/svg+xml;charset=utf8,<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-3.589 8-8 8zM12 4V2c-5.523 0-10 4.477-10 10s4.477 10 10 10v-2c-4.411 0-8-3.589-8-8s3.589-8 8-8z" fill="%234A90E2"/></svg>'); /* Replace with actual spinner SVG */
		background-repeat: no-repeat;
		background-position: right 8px center;
		background-size: 20px;
		animation: spin 1s linear infinite;
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
	.error-message {
		position: absolute;
		bottom: 0;
		left: 0;
		width: 100%;
		text-align: center;
		font-size: 0.75rem;
		color: #ef4444;
	}
</style>
