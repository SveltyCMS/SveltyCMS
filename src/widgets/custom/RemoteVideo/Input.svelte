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
	import { tokenTarget } from '@src/services/token/tokenTarget';

	let { field, value, error }: { field: FieldType; value: RemoteVideoData | null | undefined; error?: string | null } = $props();

	// Local state for the URL input.
	let urlInput = $state(value?.url ?? '');
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
		const allowedPlatforms = (field.allowedPlatforms || ['youtube', 'vimeo', 'twitch', 'tiktok']) as string[];
		const isValid = allowedPlatforms.some((platform: string) => ALLOWED_PLATFORMS[platform]?.test(url));

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

<div class="input-container relative mb-4" class:invalid={error || fetchError}>
	<div class="variant-filled-surface btn-group flex w-full rounded" role="group">
		{#if field?.prefix}
			<button class="!px-2" type="button" aria-label={`${field.prefix} prefix`}>
				{field?.prefix}
			</button>
		{/if}

		<div class="relative w-full flex-1">
			<input
				type="url"
				bind:value={urlInput}
				oninput={handleUrlInput}
				use:tokenTarget={{
					name: field.db_fieldName,
					label: field.label,
					collection: (field as any).collection
				}}
				name={field?.db_fieldName}
				id={field?.db_fieldName}
				placeholder={typeof field?.placeholder === 'string' && field.placeholder !== '' ? field.placeholder : String(field?.db_fieldName ?? '')}
				required={field?.required as boolean | undefined}
				readonly={field?.readonly as boolean | undefined}
				disabled={field?.disabled as boolean | undefined}
				class="input w-full rounded-none text-black dark:text-tertiary-500"
				class:error={!!error || !!fetchError}
				class:validating={isLoading}
				aria-invalid={!!error || !!fetchError}
				aria-describedby={error || fetchError ? `${field.db_fieldName}-error` : undefined}
				aria-required={field?.required}
				data-testid="url-input"
			/>
			<iconify-icon icon="mdi:code-braces" class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-surface-400" width="16"
			></iconify-icon>
		</div>

		{#if field?.suffix}
			<button class="!px-2" type="button" aria-label={`${field.suffix} suffix`}>
				{field?.suffix}
			</button>
		{/if}

		<!-- Validation indicator -->
	</div>

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

<style lang="postcss">
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
